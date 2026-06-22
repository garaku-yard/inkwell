/** Desktop sync engine (Stage 3).
 *
 *  One sync = an INCREMENTAL push of only the project rows that changed locally
 *  since the last sync (drained from sync_outbox), followed by applying the
 *  server's pulled delta. Pushing only changed rows is what makes multi-device
 *  safe: an idle/stale device pushes nothing, so it neither clobbers another
 *  device's edits nor mis-excludes them from its own pull (the full-snapshot v1
 *  did both — see migration 0011 / SYNC_DESIGN.md). The server is authoritative
 *  on conflicts (last-sync-wins) and on the cursor; this layer ships the dirty
 *  rows, applies what comes back, advances the cursor, and clears the drained
 *  outbox entries. Talks to the gateway via apiClient, so it inherits the
 *  desktop bearer token + gateway URL. No-ops when there's no linked account. */

import { apiClient, getAuthToken } from "@/lib/api"

import type { SyncProjectState, SyncStorage } from "@/lib/storage"
import { getDb, LOCAL_USER_ID, now, SYNCED_PROJECT_CHILD_TABLES } from "./shared"
import { runVaultSync } from "./vault-sync"
import {
  fromTs,
  pushBeat,
  pushCharacter,
  pushConnection,
  pushElement,
  pushLane,
  pushLocation,
  pushOutlineItem,
  pushProject,
  pushScene,
  type Row,
  type Ts,
} from "./sync-mappers"

// SyncChanges as carried over the wire (proto-json, snake_case). Rows are loose
// records — the field set per entity is handled by the per-entity mappers.
interface Changes {
  project?: Row
  scenes?: Row[]
  elements?: Row[]
  characters?: Row[]
  locations?: Row[]
  beats?: Row[]
  connections?: Row[]
  lanes?: Row[]
  outline_items?: Row[]
}
interface SyncResponse {
  changes?: Changes
  cursor?: Ts
}

// ─── push: dirty local rows → proto-json snapshot (incl. tombstones) ─────────
//
// Only rows the local mutations marked dirty in sync_outbox are pushed. Each
// dirty row is read back at its CURRENT state (no deleted_at filter, so a
// tombstone ships and the delete propagates); updated_at is omitted from every
// row (the server stamps it). The join to sync_outbox — rather than an `id IN
// (…)` list — keeps a huge first sync under SQLite's bound-parameter limit.

/** Per child-entity: which table to read and which push-mapper reshapes the row
 *  into the wire field names. The project row is handled separately (it's a
 *  single object on Changes, not an array). */
const ENTITY_MAP: Record<
  string,
  { table: string; push: (r: Row) => Row; key: Exclude<keyof Changes, "project"> }
> = {
  scene: { table: "scenes", push: pushScene, key: "scenes" },
  element: { table: "script_elements", push: pushElement, key: "elements" },
  character: { table: "characters", push: pushCharacter, key: "characters" },
  location: { table: "locations", push: pushLocation, key: "locations" },
  beat: { table: "beats", push: pushBeat, key: "beats" },
  connection: { table: "connections", push: pushConnection, key: "connections" },
  lane: { table: "lanes", push: pushLane, key: "lanes" },
  outline_item: { table: "outline_items", push: pushOutlineItem, key: "outline_items" },
}

/** Builds the push from the rows marked dirty in sync_outbox up to maxSeq.
 *  Returns empty Changes when nothing changed (an idle device pushes nothing —
 *  the whole point: it can't clobber and it still pulls others' edits). */
async function buildSnapshotFromOutbox(projectId: string, maxSeq: number): Promise<Changes> {
  const db = await getDb()
  const changes: Changes = {}
  const present = await db.select<Array<{ entity_type: string }>>(
    "SELECT DISTINCT entity_type FROM sync_outbox WHERE project_id = ? AND seq <= ?",
    [projectId, maxSeq],
  )
  for (const { entity_type } of present) {
    if (entity_type === "project") {
      const rows = await db.select<Row[]>("SELECT * FROM projects WHERE id = ?", [projectId])
      if (rows[0]) changes.project = pushProject(rows[0])
      continue
    }
    const meta = ENTITY_MAP[entity_type]
    if (!meta) continue
    // Current state of every dirty row of this type (incl. tombstones). table is
    // a fixed constant from ENTITY_MAP, never user input — safe to interpolate.
    const rows = await db.select<Row[]>(
      `SELECT t.* FROM ${meta.table} t
       JOIN (SELECT DISTINCT row_id FROM sync_outbox
             WHERE project_id = ? AND entity_type = ? AND seq <= ?) d ON d.row_id = t.id`,
      [projectId, entity_type, maxSeq],
    )
    if (rows.length > 0) changes[meta.key] = rows.map(meta.push)
  }
  return changes
}

/** Seeds the outbox with every current row of a project (live + tombstoned) so
 *  the first sync after opting in uploads the whole project. Called by setEnabled
 *  on the disabled→enabled transition; a freshly-pulled device has no local rows
 *  yet, so this enqueues nothing and the first sync is a pure pull. */
async function seedOutbox(projectId: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `INSERT INTO sync_outbox (project_id, entity_type, row_id, op, created_at)
     SELECT id, 'project', id, 'upsert', ? FROM projects WHERE id = ?`,
    [ts, projectId],
  )
  for (const { table, entity } of SYNCED_PROJECT_CHILD_TABLES) {
    await db.execute(
      `INSERT INTO sync_outbox (project_id, entity_type, row_id, op, created_at)
       SELECT project_id, ?, id, 'upsert', ? FROM ${table} WHERE project_id = ?`,
      [entity, ts, projectId],
    )
  }
}

// ─── apply: pulled proto-json rows → SQLite upsert-by-id ──────────────────────
//
// Applied in dependency order (project → scenes → elements → …) so foreign keys
// resolve. Each upsert writes the server's updated_at + deleted_at, so a pulled
// tombstone deletes the row locally and a revived id comes back to life.

async function applyChanges(c: Changes | undefined): Promise<void> {
  if (!c) return
  const db = await getDb()
  if (c.project) await applyProject(db, c.project)
  for (const x of c.scenes ?? []) await applyScene(db, x)
  for (const x of c.elements ?? []) await applyElement(db, x)
  for (const x of c.characters ?? []) await applyCharacter(db, x)
  for (const x of c.locations ?? []) await applyLocation(db, x)
  for (const x of c.beats ?? []) await applyBeat(db, x)
  for (const x of c.lanes ?? []) await applyLane(db, x)
  for (const x of c.connections ?? []) await applyConnection(db, x)
  for (const x of c.outline_items ?? []) await applyOutlineItem(db, x)
}

const g = (row: Row, key: string) => (row[key] as string | undefined) ?? ""
const gn = (row: Row, key: string) => (row[key] as number | undefined) ?? 0
const gts = (row: Row, key: string) => fromTs(row[key] as Ts | undefined)

type DB = Awaited<ReturnType<typeof getDb>>

/** Vault projects sync their files (markdown + attachments) through the separate
 *  path-keyed engine in ./vault-sync, not the DB row engine here. */
async function isVaultProject(db: DB, projectId: string): Promise<boolean> {
  const rows = await db.select<Array<{ category: string }>>(
    "SELECT category FROM projects WHERE id = ?",
    [projectId],
  )
  return rows[0]?.category === "vault"
}

async function applyProject(db: DB, p: Row): Promise<void> {
  await db.execute(
    `INSERT INTO projects (id, title, description, owner_id, category, status, is_starred, created_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description,
       category=excluded.category, status=excluded.status, is_starred=excluded.is_starred,
       updated_at=excluded.updated_at, deleted_at=excluded.deleted_at`,
    [g(p, "id"), g(p, "title"), g(p, "description"), g(p, "owner_id"), g(p, "category"),
      g(p, "status"), p["is_starred"] ? 1 : 0, gts(p, "created_at") ?? now(), gts(p, "updated_at") ?? now(), gts(p, "deleted_at")],
  )
}
async function applyScene(db: DB, s: Row): Promise<void> {
  await db.execute(
    `INSERT INTO scenes (id, project_id, outline_unit_id, scene_heading, content, order_index, created_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET scene_heading=excluded.scene_heading, content=excluded.content,
       order_index=excluded.order_index, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at`,
    [g(s, "id"), g(s, "project_id"), g(s, "outline_unit_id") || null, g(s, "scene_heading"),
      g(s, "content"), gn(s, "order_index"), gts(s, "created_at") ?? now(), gts(s, "updated_at") ?? now(), gts(s, "deleted_at")],
  )
}
async function applyElement(db: DB, e: Row): Promise<void> {
  await db.execute(
    `INSERT INTO script_elements (id, project_id, scene_id, element_type, content, line_number, formatting_json, created_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET scene_id=excluded.scene_id, element_type=excluded.element_type,
       content=excluded.content, line_number=excluded.line_number, formatting_json=excluded.formatting_json,
       updated_at=excluded.updated_at, deleted_at=excluded.deleted_at`,
    [g(e, "id"), g(e, "project_id"), g(e, "scene_id") || null, g(e, "type"), g(e, "content"),
      gn(e, "line_number"), JSON.stringify(e["formatting"] ?? {}), gts(e, "created_at") ?? now(), gts(e, "updated_at") ?? now(), gts(e, "deleted_at")],
  )
}
async function applyCharacter(db: DB, c: Row): Promise<void> {
  await db.execute(
    `INSERT INTO characters (id, project_id, name, description, role, attributes_json, created_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, role=excluded.role,
       attributes_json=excluded.attributes_json, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at`,
    [g(c, "id"), g(c, "project_id"), g(c, "name"), g(c, "description"), g(c, "role"),
      JSON.stringify(c["attributes"] ?? {}), gts(c, "created_at") ?? now(), gts(c, "updated_at") ?? now(), gts(c, "deleted_at")],
  )
}
async function applyLocation(db: DB, l: Row): Promise<void> {
  await db.execute(
    `INSERT INTO locations (id, project_id, name, description, type, created_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, type=excluded.type,
       updated_at=excluded.updated_at, deleted_at=excluded.deleted_at`,
    [g(l, "id"), g(l, "project_id"), g(l, "name"), g(l, "description"), g(l, "type"),
      gts(l, "created_at") ?? now(), gts(l, "updated_at") ?? now(), gts(l, "deleted_at")],
  )
}
async function applyBeat(db: DB, b: Row): Promise<void> {
  await db.execute(
    `INSERT INTO beats (id, project_id, title, description, scene_numbers, color, position_x, position_y, width, height, act, order_index, start_page, end_page, image_url, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, scene_numbers=excluded.scene_numbers,
       color=excluded.color, position_x=excluded.position_x, position_y=excluded.position_y, width=excluded.width,
       height=excluded.height, act=excluded.act, order_index=excluded.order_index, start_page=excluded.start_page,
       end_page=excluded.end_page, image_url=excluded.image_url, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at`,
    [g(b, "id"), g(b, "project_id"), g(b, "title"), g(b, "description"), g(b, "scene_numbers"), g(b, "color"),
      gn(b, "position_x"), gn(b, "position_y"), gn(b, "width"), gn(b, "height"), gn(b, "act_number"), gn(b, "order"),
      gn(b, "start_page"), gn(b, "end_page"), (b["image_url"] as string | undefined) ?? null, gts(b, "updated_at") ?? now(), gts(b, "deleted_at")],
  )
}
async function applyLane(db: DB, l: Row): Promise<void> {
  await db.execute(
    `INSERT INTO lanes (id, project_id, name, color, order_index, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color, order_index=excluded.order_index,
       updated_at=excluded.updated_at, deleted_at=excluded.deleted_at`,
    [g(l, "id"), g(l, "project_id"), g(l, "name"), g(l, "color"), gn(l, "order"), gts(l, "updated_at") ?? now(), gts(l, "deleted_at")],
  )
}
async function applyConnection(db: DB, c: Row): Promise<void> {
  await db.execute(
    `INSERT INTO connections (id, project_id, from_id, to_id, from_side, to_side, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET from_id=excluded.from_id, to_id=excluded.to_id, from_side=excluded.from_side,
       to_side=excluded.to_side, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at`,
    [g(c, "id"), g(c, "project_id"), g(c, "from_beat_id"), g(c, "to_beat_id"), g(c, "from_side"), g(c, "to_side"),
      gts(c, "updated_at") ?? now(), gts(c, "deleted_at")],
  )
}
async function applyOutlineItem(db: DB, o: Row): Promise<void> {
  await db.execute(
    `INSERT INTO outline_items (id, project_id, beat_id, lane_id, order_index, timeline_position, width, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET beat_id=excluded.beat_id, lane_id=excluded.lane_id, order_index=excluded.order_index,
       timeline_position=excluded.timeline_position, width=excluded.width, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at`,
    [g(o, "id"), g(o, "project_id"), g(o, "beat_id"), g(o, "lane_id"), gn(o, "order"),
      (o["timeline_position"] as number | undefined) ?? null, (o["width"] as number | undefined) ?? null,
      gts(o, "updated_at") ?? now(), gts(o, "deleted_at")],
  )
}

// ─── state ───────────────────────────────────────────────────────────────────

interface StateRow {
  project_id: string
  enabled: number
  cursor: string
  last_synced_at: string | null
  status: string
  error: string | null
}

const DISABLED = (projectId: string): SyncProjectState => ({
  projectId, enabled: false, lastSyncedAt: null, status: "idle",
})

function toState(row: StateRow): SyncProjectState {
  return {
    projectId: row.project_id,
    enabled: row.enabled === 1,
    lastSyncedAt: row.last_synced_at,
    status: (row.status as SyncProjectState["status"]) ?? "idle",
    error: row.error ?? undefined,
  }
}

async function readState(projectId: string): Promise<SyncProjectState> {
  const db = await getDb()
  const rows = await db.select<StateRow[]>("SELECT * FROM sync_state WHERE project_id = ?", [projectId])
  return rows[0] ? toState(rows[0]) : DISABLED(projectId)
}

async function writeStatus(projectId: string, status: string, error: string | null): Promise<void> {
  const db = await getDb()
  await db.execute(
    `INSERT INTO sync_state (project_id, enabled, status, error, updated_at)
     VALUES (?, 1, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET status = ?, error = ?, updated_at = ?`,
    [projectId, status, error, now(), status, error, now()],
  )
}

/** Tombstone retention horizon for the local time-based purge. */
const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

// ─── public surface ──────────────────────────────────────────────────────────

// Projects with a sync round-trip in flight, so the focus/tick/after-save
// triggers don't run two concurrent syncs of the same project (which would
// race the outbox high-water and double-push).
const inFlight = new Set<string>()

export const sync: SyncStorage = {
  isAvailable: async () => getAuthToken() !== null,

  getState: (projectId) => readState(projectId),

  listEnabled: async () => {
    const db = await getDb()
    const rows = await db.select<StateRow[]>("SELECT * FROM sync_state WHERE enabled = 1")
    return rows.map(toState)
  },

  setEnabled: async (projectId, enabled) => {
    const db = await getDb()
    const was = await readState(projectId)
    await db.execute(
      `INSERT INTO sync_state (project_id, enabled, status, updated_at)
       VALUES (?, ?, 'idle', ?)
       ON CONFLICT(project_id) DO UPDATE SET enabled = ?, updated_at = ?`,
      [projectId, enabled ? 1 : 0, now(), enabled ? 1 : 0, now()],
    )
    if (enabled) {
      // Opting in (disabled → enabled): seed the outbox with the project's
      // current rows so the first sync uploads everything. markDirty only began
      // tracking edits once enabled, so without this seed a pre-existing project
      // would push nothing. A re-enable re-uploads current state by design
      // ("sync my version up") — only routine auto-sync must never full-push.
      // Vault projects skip the outbox entirely: the file engine's manifest diff
      // naturally treats every file as new on the first sync.
      if (!was.enabled && !(await isVaultProject(db, projectId))) await seedOutbox(projectId)
      await sync.syncProject(projectId)
    }
  },

  syncProject: async (projectId) => {
    const state = await readState(projectId)
    if (!state.enabled) return state
    if (getAuthToken() === null) {
      await writeStatus(projectId, "offline", null)
      return readState(projectId)
    }
    // A sync for this project is already running — skip rather than race it.
    if (inFlight.has(projectId)) return readState(projectId)
    inFlight.add(projectId)

    await writeStatus(projectId, "syncing", null)
    try {
      const db = await getDb()
      const rows = await db.select<StateRow[]>("SELECT cursor FROM sync_state WHERE project_id = ?", [projectId])
      const cursorStr = rows[0]?.cursor ?? ""

      if (await isVaultProject(db, projectId)) {
        // Path-keyed file engine: push changed files, apply the pulled delta,
        // advance the manifest + cursor. See ./vault-sync.
        const { cursor, skipped } = await runVaultSync(projectId, cursorStr)
        await db.execute(
          `UPDATE sync_state SET cursor = ?, last_synced_at = ?, status = 'idle', error = NULL, updated_at = ? WHERE project_id = ?`,
          [cursor, now(), now(), projectId],
        )
        // v1 surfaces oversized-file skips via the console; a dedicated "sync
        // issues" affordance is a follow-up (see SYNC_DESIGN.md).
        if (skipped.length > 0) {
          console.warn(`Vault sync skipped ${skipped.length} file(s) over 20 MB:`, skipped)
        }
        return readState(projectId)
      }

      // Capture the outbox high-water BEFORE building the push: rows enqueued by
      // edits during this in-flight sync (seq > maxSeq) are left for next round,
      // so a concurrent save is never silently dropped.
      const seqRows = await db.select<Array<{ maxseq: number | null }>>(
        "SELECT MAX(seq) AS maxseq FROM sync_outbox WHERE project_id = ?",
        [projectId],
      )
      const maxSeq = seqRows[0]?.maxseq ?? 0

      const body: { changes: Changes; cursor?: Ts } = {
        changes: await buildSnapshotFromOutbox(projectId, maxSeq),
      }
      if (cursorStr) body.cursor = JSON.parse(cursorStr) as Ts

      const resp = await apiClient<SyncResponse>(`sync/projects/${projectId}`, { method: "POST", body })
      await applyChanges(resp.changes)

      const nextCursor = resp.cursor ? JSON.stringify(resp.cursor) : cursorStr
      await db.execute(
        `UPDATE sync_state SET cursor = ?, last_synced_at = ?, status = 'idle', error = NULL, updated_at = ? WHERE project_id = ?`,
        [nextCursor, now(), now(), projectId],
      )
      // Drop the rows we just pushed; edits enqueued mid-sync (seq > maxSeq) stay.
      await db.execute("DELETE FROM sync_outbox WHERE project_id = ? AND seq <= ?", [projectId, maxSeq])
      // Time-based tombstone GC: reclaim rows deleted long enough ago that every
      // device has surely seen the deletion.
      await purgeLocalTombstones(projectId)
    } catch (err) {
      await writeStatus(projectId, "error", err instanceof Error ? err.message : "Sync failed")
    } finally {
      inFlight.delete(projectId)
    }
    return readState(projectId)
  },

  syncAll: async () => {
    const enabled = await sync.listEnabled()
    const out: SyncProjectState[] = []
    for (const s of enabled) out.push(await sync.syncProject(s.projectId))
    return out
  },

  listCloudProjects: async () => {
    if (getAuthToken() === null) return []
    const resp = await apiClient<{
      projects: Array<{ id: string; title: string; category: string; status: string; updated_at: string }>
    }>("projects", { method: "GET" })
    const db = await getDb()
    const localRows = await db.select<{ id: string }[]>(
      "SELECT id FROM projects WHERE deleted_at IS NULL",
    )
    const localIds = new Set(localRows.map((x) => x.id))
    return (resp.projects ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      status: p.status,
      updatedAt: p.updated_at,
      onThisDevice: localIds.has(p.id),
    }))
  },

  pullProject: async (projectId, opts) => {
    // A vault project's files sync, not a project row — so on a fresh device the
    // local project row + its vault folder must be seeded BEFORE the first pull,
    // or the file engine has nowhere to write. DB-backed projects skip this: the
    // pull's applyChanges creates their rows.
    if (opts?.meta?.category === "vault") {
      if (!opts.vaultFolder) {
        throw new Error("Choose a folder to pull this vault into.")
      }
      const db = await getDb()
      const ts = now()
      await db.execute(
        `INSERT INTO projects (id, title, description, owner_id, category, status, is_starred, created_at, updated_at, vault_path)
         VALUES (?, ?, '', ?, 'vault', ?, 0, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET vault_path = excluded.vault_path`,
        [projectId, opts.meta.title || "Untitled", LOCAL_USER_ID, opts.meta.status || "draft", ts, ts, opts.vaultFolder],
      )
    }
    // Enabling sync on a not-yet-local project does an empty push + full pull,
    // writing the project + its children (or vault files) into the local store.
    await sync.setEnabled(projectId, true)
  },
}

async function purgeLocalTombstones(projectId: string): Promise<void> {
  const db = await getDb()
  const cutoff = new Date(Date.now() - TOMBSTONE_RETENTION_MS).toISOString()
  const tables = ["scenes", "script_elements", "characters", "locations", "beats", "connections", "lanes", "outline_items"]
  for (const t of tables) {
    await db.execute(`DELETE FROM ${t} WHERE project_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?`, [projectId, cutoff])
  }
  await db.execute(`DELETE FROM projects WHERE id = ? AND deleted_at IS NOT NULL AND deleted_at < ?`, [projectId, cutoff])
}
