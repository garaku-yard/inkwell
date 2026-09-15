/** Desktop-only Google Drive one-way backup engine (vault slice).
 *
 * Drive IDs and source hashes live in local SQLite. Files are read from the
 * real vault and handed to native Rust for authenticated upload; refresh
 * tokens never enter the webview. Deletions deliberately remain in Drive in
 * v1, preserving backup history. */

import { invoke } from "@tauri-apps/api/core"
import { readFile } from "@tauri-apps/plugin-fs"

import { allowFsDir } from "@/lib/tauri-scope"
import { getDb, now } from "@/lib/storage/local/shared"
import { walkVaultFiles } from "@/lib/storage/local/vault"
import { buildProjectIw, projectExportSlug } from "@/lib/export/iw"
import { renderGenericPdfBytes } from "@/lib/export/generic-pdf"
import { renderScreenplayPdfBytes } from "@/lib/export/screenplay-pdf"
import { serializeIw } from "@/lib/iw/format"

const MAX_FILE_BYTES = 20 * 1024 * 1024

interface AuthStatus { connected: boolean; accountEmail?: string }
interface StateRow {
  account_email: string | null
  root_folder_id: string | null
  status: DriveBackupStatus["status"]
  error: string | null
  last_backup_at: string | null
}
interface ProjectRow { id: string; title: string; category: string; vault_path: string | null }
interface ProjectFolderRow { drive_folder_id: string; folder_name: string }
interface FolderRow { path: string; drive_folder_id: string }
interface MappingRow { path: string; drive_file_id: string; synced_hash: string }
interface UploadResult { fileId: string; created: boolean }

export interface DriveBackupStatus {
  status: "idle" | "backing_up" | "error"
  error?: string
  lastBackupAt?: string
}

export interface DriveBackupProgress {
  project: string
  path?: string
  completed: number
  total: number
}

export interface DriveBackupResult {
  projects: number
  uploaded: number
  unchanged: number
  skipped: string[]
}

export interface DriveBackupProject {
  id: string
  title: string
  category: string
  enabled: boolean
}

export async function listDriveBackupProjects(): Promise<DriveBackupProject[]> {
  return (await getDb()).select<DriveBackupProject[]>(
    `SELECT p.id, p.title, p.category, COALESCE(s.enabled, 0) = 1 AS enabled
     FROM projects p LEFT JOIN drive_selection s ON s.project_id = p.id
     WHERE p.deleted_at IS NULL AND (p.category <> 'vault' OR p.vault_path IS NOT NULL)
     ORDER BY p.title`,
  )
}

export async function setDriveBackupProjectEnabled(projectId: string, enabled: boolean): Promise<void> {
  await (await getDb()).execute(
    `INSERT INTO drive_selection (project_id, enabled) VALUES (?, ?)
     ON CONFLICT(project_id) DO UPDATE SET enabled = excluded.enabled`,
    [projectId, enabled ? 1 : 0],
  )
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error("Backup stopped")
  error.name = "AbortError"
  throw error
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function contentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase()
  return ({ md: "text/markdown", txt: "text/plain", json: "application/json", iw: "application/json", pdf: "application/pdf",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    svg: "image/svg+xml", mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4" } as Record<string, string>)[ext ?? ""]
    ?? "application/octet-stream"
}

async function folderExists(id: string): Promise<boolean> {
  return invoke<boolean>("google_drive_file_exists", { fileId: id })
}

async function createFolder(name: string, parentId?: string): Promise<string> {
  return invoke<string>("google_drive_create_folder", { name, parentId })
}

export async function getDriveBackupStatus(): Promise<DriveBackupStatus> {
  const rows = await (await getDb()).select<StateRow[]>("SELECT * FROM drive_state WHERE id = 1")
  const row = rows[0]
  return {
    status: row?.status ?? "idle",
    error: row?.error ?? undefined,
    lastBackupAt: row?.last_backup_at ?? undefined,
  }
}

export async function backupSelectedProjectsToDrive(
  onProgress?: (progress: DriveBackupProgress) => void,
  signal?: AbortSignal,
): Promise<DriveBackupResult> {
  const db = await getDb()
  const auth = await invoke<AuthStatus>("google_drive_status")
  if (!auth.connected) throw new Error("Connect Google Drive before backing up.")

  await db.execute(
    "UPDATE drive_state SET status = 'backing_up', error = NULL, updated_at = ? WHERE id = 1",
    [now()],
  )
  try {
    throwIfCancelled(signal)
    const projects = await db.select<ProjectRow[]>(
      `SELECT p.id, p.title, p.category, p.vault_path FROM projects p
       JOIN drive_selection s ON s.project_id = p.id AND s.enabled = 1
       WHERE p.deleted_at IS NULL AND (p.category <> 'vault' OR p.vault_path IS NOT NULL) ORDER BY p.title`,
    )
    if (projects.length === 0) throw new Error("Choose at least one project to back up.")
    let state = (await db.select<StateRow[]>("SELECT * FROM drive_state WHERE id = 1"))[0]
    if (state.account_email && state.account_email !== auth.accountEmail) {
      await db.execute("DELETE FROM drive_backup")
      await db.execute("DELETE FROM drive_project")
      await db.execute("DELETE FROM drive_folder")
      await db.execute("UPDATE drive_state SET root_folder_id = NULL WHERE id = 1")
      state = { ...state, root_folder_id: null }
    }

    let rootId = state.root_folder_id
    if (rootId && !(await folderExists(rootId))) {
      await db.execute("DELETE FROM drive_backup")
      await db.execute("DELETE FROM drive_project")
      await db.execute("DELETE FROM drive_folder")
      rootId = null
    }
    if (!rootId) rootId = await createFolder("Inkwell")
    await db.execute(
      "UPDATE drive_state SET account_email = ?, root_folder_id = ?, updated_at = ? WHERE id = 1",
      [auth.accountEmail ?? null, rootId, now()],
    )

    const scanned = await Promise.all(projects.map(async (project) => {
      throwIfCancelled(signal)
      if (project.category !== "vault") return { project, files: [] }
      await allowFsDir(project.vault_path!, true)
      return { project, files: await walkVaultFiles(project.vault_path!, "", true) }
    }))
    const total = scanned.reduce((sum, entry) => sum + (entry.project.category === "vault" ? entry.files.length : 2), 0)
    const result: DriveBackupResult = { projects: projects.length, uploaded: 0, unchanged: 0, skipped: [] }
    let completed = 0

    for (const { project, files } of scanned) {
      throwIfCancelled(signal)
      const folderRows = await db.select<ProjectFolderRow[]>(
        "SELECT drive_folder_id, folder_name FROM drive_project WHERE project_id = ?", [project.id],
      )
      let folderId: string | undefined = folderRows[0]?.drive_folder_id
      if (folderId && (folderRows[0].folder_name !== project.title || !(await folderExists(folderId)))) {
        await db.execute("DELETE FROM drive_backup WHERE project_id = ?", [project.id])
        await db.execute("DELETE FROM drive_folder WHERE project_id = ?", [project.id])
        folderId = undefined
      }
      if (!folderId) folderId = await createFolder(project.title, rootId)
      await db.execute(
        `INSERT INTO drive_project (project_id, drive_folder_id, folder_name) VALUES (?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET drive_folder_id = excluded.drive_folder_id, folder_name = excluded.folder_name`,
        [project.id, folderId, project.title],
      )

      const mappings = new Map((await db.select<MappingRow[]>(
        "SELECT path, drive_file_id, synced_hash FROM drive_backup WHERE project_id = ?", [project.id],
      )).map((row) => [row.path, row]))
      const folders = new Map((await db.select<FolderRow[]>(
        "SELECT path, drive_folder_id FROM drive_folder WHERE project_id = ?", [project.id],
      )).map((row) => [row.path, row.drive_folder_id]))
      const uploadArtifact = async (path: string, bytes: Uint8Array, hash: string) => {
        throwIfCancelled(signal)
        onProgress?.({ project: project.title, path, completed, total })
        const mapping = mappings.get(path)
        if (mapping?.synced_hash === hash && await folderExists(mapping.drive_file_id)) {
          result.unchanged++
          completed++
          return
        }
        const upload = await invoke<UploadResult>("google_drive_upsert_file", {
          upload: {
            name: path.split("/").pop() ?? path,
            parentId: folderId,
            fileId: mapping?.drive_file_id,
            contentType: contentType(path),
            contents: Array.from(bytes),
          },
        })
        throwIfCancelled(signal)
        await db.execute(
          `INSERT INTO drive_backup (project_id, path, drive_file_id, synced_hash) VALUES (?, ?, ?, ?)
           ON CONFLICT(project_id, path) DO UPDATE SET drive_file_id = excluded.drive_file_id, synced_hash = excluded.synced_hash`,
          [project.id, path, upload.fileId, hash],
        )
        mappings.set(path, { path, drive_file_id: upload.fileId, synced_hash: hash })
        result.uploaded++
        completed++
      }

      if (project.category !== "vault") {
        const built = await buildProjectIw(project.id, "")
        const stableSource = serializeIw({ ...built.iw, exportedAt: "" })
        const iwHash = await sha256Hex(new TextEncoder().encode(`iw-v2\n${stableSource}`))
        const pdfHash = await sha256Hex(new TextEncoder().encode(`pdf-v1\n${stableSource}`))
        const slug = projectExportSlug(project.title)
        const iwBytes = new TextEncoder().encode(built.content)
        const pdfBytes = project.category === "screenplay"
          ? renderScreenplayPdfBytes(built.project)
          : renderGenericPdfBytes(built.project, built.iw)
        await uploadArtifact(`${slug}.iw`, iwBytes, iwHash)
        await uploadArtifact(`${slug}.pdf`, pdfBytes, pdfHash)
        continue
      }

      for (const file of files) {
        throwIfCancelled(signal)
        onProgress?.({ project: project.title, path: file.rel, completed, total })
        const bytes = await readFile(file.abs)
        throwIfCancelled(signal)
        if (bytes.length > MAX_FILE_BYTES) {
          result.skipped.push(`${project.title}/${file.rel}`)
          completed++
          continue
        }
        const hash = await sha256Hex(bytes)
        const segments = file.rel.split("/")
        segments.pop()
        let parentId = folderId
        let folderPath = ""
        for (const segment of segments) {
          folderPath = folderPath ? `${folderPath}/${segment}` : segment
          let nestedId = folders.get(folderPath)
          if (nestedId && !(await folderExists(nestedId))) nestedId = undefined
          if (!nestedId) {
            nestedId = await createFolder(segment, parentId)
            await db.execute(
              `INSERT INTO drive_folder (project_id, path, drive_folder_id) VALUES (?, ?, ?)
               ON CONFLICT(project_id, path) DO UPDATE SET drive_folder_id = excluded.drive_folder_id`,
              [project.id, folderPath, nestedId],
            )
            folders.set(folderPath, nestedId)
          }
          parentId = nestedId
        }
        // Vault artifacts can be nested; temporarily target the resolved
        // parent while retaining the shared update/hash behavior.
        const mapping = mappings.get(file.rel)
        if (mapping?.synced_hash === hash && await folderExists(mapping.drive_file_id)) {
          result.unchanged++
          completed++
          continue
        }
        const upload = await invoke<UploadResult>("google_drive_upsert_file", {
          upload: { name: file.rel.split("/").pop() ?? file.rel, parentId, fileId: mapping?.drive_file_id,
            contentType: contentType(file.rel), contents: Array.from(bytes) },
        })
        throwIfCancelled(signal)
        await db.execute(
          `INSERT INTO drive_backup (project_id, path, drive_file_id, synced_hash) VALUES (?, ?, ?, ?)
           ON CONFLICT(project_id, path) DO UPDATE SET drive_file_id = excluded.drive_file_id, synced_hash = excluded.synced_hash`,
          [project.id, file.rel, upload.fileId, hash],
        )
        mappings.set(file.rel, { path: file.rel, drive_file_id: upload.fileId, synced_hash: hash })
        result.uploaded++
        completed++
      }
    }

    const finished = now()
    await db.execute(
      "UPDATE drive_state SET status = 'idle', error = NULL, last_backup_at = ?, updated_at = ? WHERE id = 1",
      [finished, finished],
    )
    return result
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      await db.execute(
        "UPDATE drive_state SET status = 'idle', error = NULL, updated_at = ? WHERE id = 1",
        [now()],
      )
      throw error
    }
    const message = error instanceof Error ? error.message : String(error)
    await db.execute(
      "UPDATE drive_state SET status = 'error', error = ?, updated_at = ? WHERE id = 1",
      [message, now()],
    )
    throw error
  }
}
