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

import { exists, mkdir, readFile, remove, stat, writeFile } from "@tauri-apps/plugin-fs"

import { apiClient } from "@/lib/api"
import { allowFsDir } from "@/lib/tauri-scope"
import { getDb, now } from "./shared"
import { joinPath, normaliseRelPath, vault, walkVaultFiles } from "./vault"
import { pushProject, toTs, type Row, type Ts } from "./sync-mappers"

// ─── tuning ──────────────────────────────────────────────────────────────────

/** These budgets exist to keep every request under the transport's ceiling,
 *  which is `grpclimits.MaxMessageBytes` = 32 MiB (server/pkg/grpclimits).
 *
 *  That number used to be a fiction: nothing configured gRPC at all, so the real
 *  cap was grpc-go's 4 MiB default and any vault with more than 4 MiB of changed
 *  files could never sync — every retry rebuilt the same oversized message and
 *  failed identically (Orbit #151). The ceiling is now actually set, so these
 *  budgets mean what they say. Raising any of them requires raising it too:
 *  batching always emits at least one file, so a lone MAX_PUSH_FILE_BYTES file
 *  has to fit on its own. */
const MAX_PUSH_FILE_BYTES = 20 * 1024 * 1024
/** Per-push-batch budgets — many changed files are split across requests so no
 *  single push exceeds the ceiling above. */
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

/** A locally-changed file queued for push. `bytes` is null for a deletion.
 *  mtime/size are the on-disk stats recorded into the manifest so the next sync
 *  can skip re-hashing this file when they're unchanged. */
interface PushItem {
  path: string
  bytes: Uint8Array | null
  hash: string
  mtime: string
  size: number
}

/** A manifest row: the content hash plus the mtime/size last seen, for the
 *  stat-based fast-path (skip re-hashing when mtime+size are unchanged). */
interface ManifestEntry {
  hash: string
  mtime: string
  size: number
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

/** The walk lives in ./vault so the folder picker's warning and this engine
 *  agree on what the vault contains — see walkVaultFiles. */
const walkAllFiles = walkVaultFiles

const isMarkdown = (rel: string) => rel.toLowerCase().endsWith(".md")

// ─── manifest (vault_manifest: path → hash at last successful sync) ─────────────

type DB = Awaited<ReturnType<typeof getDb>>

async function loadManifest(db: DB, projectId: string): Promise<Map<string, ManifestEntry>> {
  const rows = await db.select<Array<{ path: string; synced_hash: string; mtime: string; size: number }>>(
    "SELECT path, synced_hash, mtime, size FROM vault_manifest WHERE project_id = ?",
    [projectId],
  )
  return new Map(rows.map((r) => [r.path, { hash: r.synced_hash, mtime: r.mtime, size: r.size }]))
}

async function setManifest(
  db: DB,
  map: Map<string, ManifestEntry>,
  projectId: string,
  path: string,
  entry: ManifestEntry,
): Promise<void> {
  await db.execute(
    `INSERT INTO vault_manifest (project_id, path, synced_hash, mtime, size) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(project_id, path) DO UPDATE SET synced_hash = ?, mtime = ?, size = ?`,
    [projectId, path, entry.hash, entry.mtime, entry.size, entry.hash, entry.mtime, entry.size],
  )
  map.set(path, entry)
}

/** Stats the on-disk file and records hash + its current mtime/size in the
 *  manifest, so the next sync's fast-path can skip re-hashing it. */
async function recordManifest(
  db: DB,
  map: Map<string, ManifestEntry>,
  projectId: string,
  abs: string,
  path: string,
  hash: string,
): Promise<void> {
  let mtime = ""
  let size = 0
  try {
    const info = await stat(abs)
    size = info.size ?? 0
    mtime = info.mtime ? String(info.mtime.getTime()) : ""
  } catch {
    /* file vanished between write and stat — record hash with empty stats */
  }
  await setManifest(db, map, projectId, path, { hash, mtime, size })
}

async function clearManifest(
  db: DB,
  map: Map<string, ManifestEntry>,
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

/** Decide whether a stat/read failure is benign.
 *
 *  A file that genuinely disappeared between the walk and the read is a race —
 *  skipping it is right, the next sync catches it. Every *other* failure
 *  (permission denied, unreadable, plugin command not allowed) is not benign:
 *  swallowing it drops the file from the push while the sync still reports
 *  success, i.e. a green "Synced" that synced nothing. That is exactly how the
 *  missing `fs:allow-stat`/`fs:allow-read-file` capabilities went unnoticed
 *  from the engine's first commit — every file silently vanished from every
 *  push. So: skip only if the file is really gone; otherwise surface it and let
 *  the caller record an error status. */
async function rethrowUnlessVanished(f: { rel: string; abs: string }, err: unknown): Promise<void> {
  let stillThere: boolean
  try {
    stillThere = await exists(f.abs)
  } catch {
    // Can't even ask — treat as a real failure rather than assume it's a race.
    stillThere = true
  }
  if (stillThere) {
    throw new Error(`Vault file "${f.rel}" could not be read: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function classifyChanges(
  vaultRoot: string,
  manifest: Map<string, ManifestEntry>,
): Promise<{ items: PushItem[]; skipped: string[]; refresh: PushItem[] }> {
  const files = await walkAllFiles(vaultRoot)
  const onDisk = new Set(files.map((f) => f.rel))
  const items: PushItem[] = []
  const skipped: string[] = []
  // Files whose content is unchanged but whose mtime/size drifted — refresh the
  // manifest stats (no push) so the fast-path keeps hitting next time.
  const refresh: PushItem[] = []

  // Created / modified files.
  for (const f of files) {
    let size = 0
    let mtime = ""
    try {
      const info = await stat(f.abs)
      size = info.size ?? 0
      mtime = info.mtime ? String(info.mtime.getTime()) : ""
    } catch (err) {
      await rethrowUnlessVanished(f, err) // vanished mid-walk; next sync catches it
      continue
    }
    if (size > MAX_PUSH_FILE_BYTES) {
      skipped.push(f.rel)
      continue
    }
    const prev = manifest.get(f.rel)
    // Fast-path: same size + mtime as last sync ⇒ assume unchanged, skip the
    // read + hash. Only trusted when we have a real mtime (null mtime → "").
    if (prev && mtime !== "" && prev.size === size && prev.mtime === mtime) {
      continue
    }
    let bytes: Uint8Array
    try {
      bytes = await readFile(f.abs)
    } catch (err) {
      await rethrowUnlessVanished(f, err)
      continue
    }
    const hash = await sha256Hex(bytes)
    if (!prev || prev.hash !== hash) {
      items.push({ path: f.rel, bytes, hash, mtime, size })
    } else {
      // Content identical, only stats drifted (e.g. touched) — refresh, no push.
      refresh.push({ path: f.rel, bytes: null, hash, mtime, size })
    }
  }

  // Deletions: in the manifest (we synced it before) but gone from disk.
  for (const path of manifest.keys()) {
    if (!onDisk.has(path)) {
      items.push({ path, bytes: null, hash: "", mtime: "", size: 0 })
    }
  }

  return { items, skipped, refresh }
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
  manifest: Map<string, ManifestEntry>,
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
      if (current !== null && current === base?.hash) {
        await remove(abs).catch(() => {})
        if (isMarkdown(rel)) await vault.reindexLinks(projectId, rel).catch(() => {})
      }
      await clearManifest(db, manifest, projectId, rel)
      continue
    }

    const bytes = b64ToBytes(f.content ?? "")
    const hash = await sha256Hex(bytes)

    if (current === hash) {
      // Already byte-identical on disk — just record the base (+ its stats).
      await recordManifest(db, manifest, projectId, abs, rel, hash)
      continue
    }
    if (current !== null && current !== base?.hash) {
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
    await recordManifest(db, manifest, projectId, abs, rel, hash)
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

  const { items, skipped, refresh } = await classifyChanges(vaultRoot, manifest)
  // Files whose content didn't change but whose stats drifted: refresh the
  // manifest's mtime/size so the fast-path keeps hitting. Local-only, so it's
  // safe to do before any network call (survives a later network failure).
  for (const r of refresh) {
    await setManifest(db, manifest, projectId, r.path, { hash: r.hash, mtime: r.mtime, size: r.size })
  }
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
      else await setManifest(db, manifest, projectId, item.path, { hash: item.hash, mtime: item.mtime, size: item.size })
    }

    if (resp.cursor !== undefined && resp.cursor !== null) cursor = JSON.stringify(resp.cursor)

    rounds++
    if (rounds >= MAX_ROUNDS) break
    if (remaining.length === 0 && !resp.has_more) break
  }

  return { cursor, skipped }
}
