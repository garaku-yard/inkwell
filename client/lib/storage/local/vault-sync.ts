/** Desktop vault file-sync engine (path-keyed).
 *
 *  Vault notes are real files on disk (markdown + attachments), not the UUID rows
 *  the DB engine in ./sync handles — so they need their own engine keyed by
 *  vault-relative path. A sync walks the vault, content-hashes every file, and
 *  diffs against the per-file MANIFEST (vault_manifest: path → hash at last sync,
 *  the common base) to classify each file as created / modified / deleted
 *  locally. Only changed files are pushed; the server (apply-then-pull-by-path,
 *  last-sync-wins, server clock) returns the delta since the cursor, paginated.
 *  Pulled files are applied to disk and the manifest is advanced. Because the
 *  manifest records the hash of every file we write, the filesystem watcher
 *  firing on our own applied writes never looks like a fresh local edit (the
 *  file-world echo guard). Conflicts resolve last-sync-wins; an UNSYNCED local
 *  edit is never overwritten by an apply (it's pushed and wins next round). See
 *  SYNC_DESIGN.md ("vault file sync").
 *
 *  This module owns no sync_state I/O — ./sync wraps runVaultSync with status,
 *  cursor, and last_synced_at bookkeeping, so the dependency stays one-way. */

import { exists, mkdir, readDir, readFile, remove, stat, writeFile } from "@tauri-apps/plugin-fs"

import { apiClient } from "@/lib/api"
import { allowFsDir } from "@/lib/tauri-scope"
import { getDb, now } from "./shared"
import { joinPath, normaliseRelPath, vault } from "./vault"
import { pushProject, toTs, type Row, type Ts } from "./sync-mappers"

// ─── tuning ──────────────────────────────────────────────────────────────────

/** A file larger than this is skipped (not pushed): base64 inflates ~33%, and a
 *  single push request is capped at 32 MiB server-side. Surfaced, never silent. */
const MAX_PUSH_FILE_BYTES = 20 * 1024 * 1024
/** Per-push-batch budgets — many changed files are split across requests so no
 *  single push exceeds the server's body cap. */
const PUSH_BATCH_MAX_FILES = 150
const PUSH_BATCH_MAX_BYTES = 12 * 1024 * 1024
/** Backstop against a runaway push/pull loop. */
const MAX_ROUNDS = 1000

// ─── wire types ────────────────────────────────────────────────────────────────

/** A vault file on the wire (protojson). content is base64 (proto `bytes`). */
interface WireFile {
  path: string
  content?: string
  content_hash?: string
  updated_at?: Ts
  deleted_at?: Ts
}
interface VaultSyncResponse {
  files?: WireFile[]
  cursor?: unknown
  has_more?: boolean
}

/** A locally-changed file queued for push. `bytes` is null for a deletion. */
interface PushItem {
  path: string
  bytes: Uint8Array | null
  hash: string
}

// ─── byte / hash helpers ───────────────────────────────────────────────────────

function bytesToB64(bytes: Uint8Array): string {
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Cast around the lib.dom BufferSource generic-variance quirk (Uint8Array<
  // ArrayBufferLike> vs ArrayBufferView<ArrayBuffer>); a Uint8Array is a valid
  // digest input at runtime.
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource)
  const arr = new Uint8Array(digest)
  let s = ""
  for (let i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, "0")
  return s
}

// ─── filesystem walk (all non-hidden files, not just .md) ──────────────────────

async function walkAllFiles(
  folder: string,
  relPrefix = "",
): Promise<Array<{ rel: string; abs: string }>> {
  const out: Array<{ rel: string; abs: string }> = []
  let entries: Awaited<ReturnType<typeof readDir>>
  try {
    entries = await readDir(folder)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue // skip .obsidian / .git / dotfiles
    const childRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
    const childAbs = joinPath(folder, entry.name)
    if (entry.isDirectory) {
      out.push(...(await walkAllFiles(childAbs, childRel)))
    } else if (entry.isFile) {
      out.push({ rel: childRel, abs: childAbs })
    }
  }
  return out
}

const isMarkdown = (rel: string) => rel.toLowerCase().endsWith(".md")

// ─── manifest (vault_manifest: path → hash at last successful sync) ─────────────

type DB = Awaited<ReturnType<typeof getDb>>

async function loadManifest(db: DB, projectId: string): Promise<Map<string, string>> {
  const rows = await db.select<Array<{ path: string; synced_hash: string }>>(
    "SELECT path, synced_hash FROM vault_manifest WHERE project_id = ?",
    [projectId],
  )
  return new Map(rows.map((r) => [r.path, r.synced_hash]))
}

async function setManifest(
  db: DB,
  map: Map<string, string>,
  projectId: string,
  path: string,
  hash: string,
): Promise<void> {
  await db.execute(
    `INSERT INTO vault_manifest (project_id, path, synced_hash) VALUES (?, ?, ?)
     ON CONFLICT(project_id, path) DO UPDATE SET synced_hash = ?`,
    [projectId, path, hash, hash],
  )
  map.set(path, hash)
}

async function clearManifest(
  db: DB,
  map: Map<string, string>,
  projectId: string,
  path: string,
): Promise<void> {
  await db.execute("DELETE FROM vault_manifest WHERE project_id = ? AND path = ?", [projectId, path])
  map.delete(path)
}

// ─── vault path resolution ─────────────────────────────────────────────────────

async function vaultPathOrThrow(db: DB, projectId: string): Promise<string> {
  const rows = await db.select<Array<{ vault_path: string | null }>>(
    "SELECT vault_path FROM projects WHERE id = ?",
    [projectId],
  )
  const path = rows[0]?.vault_path
  if (!path) {
    throw new Error("Pick a folder for this vault before syncing it.")
  }
  await allowFsDir(path, true)
  return path
}

// ─── classify: disk vs manifest → push items ───────────────────────────────────

async function classifyChanges(
  vaultRoot: string,
  manifest: Map<string, string>,
): Promise<{ items: PushItem[]; skipped: string[] }> {
  const files = await walkAllFiles(vaultRoot)
  const onDisk = new Set(files.map((f) => f.rel))
  const items: PushItem[] = []
  const skipped: string[] = []

  // Created / modified files.
  for (const f of files) {
    let size = 0
    try {
      size = (await stat(f.abs)).size ?? 0
    } catch {
      continue // vanished mid-walk; next sync catches it
    }
    if (size > MAX_PUSH_FILE_BYTES) {
      skipped.push(f.rel)
      continue
    }
    let bytes: Uint8Array
    try {
      bytes = await readFile(f.abs)
    } catch {
      continue
    }
    const hash = await sha256Hex(bytes)
    if (manifest.get(f.rel) !== hash) {
      items.push({ path: f.rel, bytes, hash })
    }
  }

  // Deletions: in the manifest (we synced it before) but gone from disk.
  for (const path of manifest.keys()) {
    if (!onDisk.has(path)) {
      items.push({ path, bytes: null, hash: "" })
    }
  }

  return { items, skipped }
}

function takeBatch(remaining: PushItem[]): PushItem[] {
  const batch: PushItem[] = []
  let bytes = 0
  while (remaining.length > 0) {
    const next = remaining[0]
    const size = next.bytes?.length ?? 0
    if (batch.length > 0 && (batch.length >= PUSH_BATCH_MAX_FILES || bytes + size > PUSH_BATCH_MAX_BYTES)) {
      break
    }
    batch.push(next)
    bytes += size
    remaining.shift()
  }
  return batch
}

function toWire(item: PushItem): WireFile {
  if (item.bytes === null) {
    return { path: item.path, deleted_at: toTs(now()) }
  }
  return { path: item.path, content: bytesToB64(item.bytes), content_hash: item.hash }
}

// ─── apply: pulled files → disk (last-sync-wins, never clobber unsynced edits) ──

async function diskHash(abs: string): Promise<string | null> {
  if (!(await exists(abs))) return null
  try {
    return await sha256Hex(await readFile(abs))
  } catch {
    return null
  }
}

async function applyPulled(
  db: DB,
  manifest: Map<string, string>,
  projectId: string,
  vaultRoot: string,
  files: WireFile[],
): Promise<void> {
  for (const f of files) {
    const rel = normaliseRelPath(f.path)
    const abs = joinPath(vaultRoot, rel)
    const base = manifest.get(rel)
    const current = await diskHash(abs)

    if (f.deleted_at) {
      // Tombstone. Only delete when there's no unsynced local edit — otherwise
      // leave the local file so it's pushed (and wins) next round.
      if (current !== null && current === base) {
        await remove(abs).catch(() => {})
        if (isMarkdown(rel)) await vault.reindexLinks(projectId, rel).catch(() => {})
      }
      await clearManifest(db, manifest, projectId, rel)
      continue
    }

    const bytes = b64ToBytes(f.content ?? "")
    const hash = await sha256Hex(bytes)

    if (current === hash) {
      // Already byte-identical on disk — just record the base.
      await setManifest(db, manifest, projectId, rel, hash)
      continue
    }
    if (current !== null && current !== base) {
      // Unsynced local edit diverges from both base and server — keep local,
      // don't advance the manifest, so the next classify pushes it (LWW: the
      // last sync wins, and this local edit is the newer one).
      continue
    }
    // Safe to apply: no local file, or local matches the base.
    const slash = rel.lastIndexOf("/")
    if (slash !== -1) {
      await mkdir(joinPath(vaultRoot, rel.slice(0, slash)), { recursive: true }).catch(() => {})
    }
    await writeFile(abs, bytes)
    await setManifest(db, manifest, projectId, rel, hash)
    if (isMarkdown(rel)) await vault.reindexLinks(projectId, rel).catch(() => {})
  }
}

// ─── public: one full sync round-trip (push batches + pull pages) ──────────────

/** Runs a vault sync for the project: pushes every locally-changed file (batched
 *  under the request cap) and applies the server's pulled delta (paginated),
 *  advancing the manifest as it goes. Returns the new cursor (opaque JSON string
 *  to persist) and the relative paths skipped for being too large. Throws on a
 *  network/auth/storage failure; the caller records the error status. */
export async function runVaultSync(
  projectId: string,
  cursorStr: string,
): Promise<{ cursor: string; skipped: string[] }> {
  const db = await getDb()
  const vaultRoot = await vaultPathOrThrow(db, projectId)
  const manifest = await loadManifest(db, projectId)

  // The project row travels on the first request so the server can create the
  // project if this device is the first to push it (mirrors DB sync).
  const projectRows = await db.select<Row[]>("SELECT * FROM projects WHERE id = ?", [projectId])
  const projectWire = projectRows[0] ? pushProject(projectRows[0]) : undefined

  const { items, skipped } = await classifyChanges(vaultRoot, manifest)
  const remaining = [...items]

  let cursor = cursorStr
  let rounds = 0
  let sentProject = false

  // Loop until every local change is pushed AND the server has no more pages.
  for (;;) {
    const batch = takeBatch(remaining)
    const body: { project?: Row; files: WireFile[]; cursor?: unknown } = {
      files: batch.map(toWire),
    }
    if (!sentProject && projectWire) {
      body.project = projectWire
      sentProject = true
    }
    if (cursor) body.cursor = JSON.parse(cursor)

    const resp = await apiClient<VaultSyncResponse>(`sync/vault/projects/${projectId}`, {
      method: "POST",
      body,
    })

    await applyPulled(db, manifest, projectId, vaultRoot, resp.files ?? [])

    // Advance the manifest for the files we just pushed: the server now holds
    // them and excludes them from our pull, so our copy is the synced one.
    for (const item of batch) {
      if (item.bytes === null) await clearManifest(db, manifest, projectId, item.path)
      else await setManifest(db, manifest, projectId, item.path, item.hash)
    }

    if (resp.cursor !== undefined && resp.cursor !== null) cursor = JSON.stringify(resp.cursor)

    rounds++
    if (rounds >= MAX_ROUNDS) break
    if (remaining.length === 0 && !resp.has_more) break
  }

  return { cursor, skipped }
}
