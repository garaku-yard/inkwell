/** Desktop sync engine (Stage 3).
 *
 *  One sync = a full-snapshot push of a project's local rows (incl. tombstones)
 *  followed by applying the server's pulled delta. The server is authoritative
 *  on conflicts (last-sync-wins) and on the cursor; this layer just ships the
 *  snapshot, applies what comes back, and advances the stored cursor. Talks to
 *  the gateway via apiClient, so it inherits the desktop bearer token + gateway
 *  URL. No-ops when there's no linked account. See SYNC_DESIGN.md. */

import { apiClient, getAuthToken } from "@/lib/api"

import type { SyncProjectState, SyncStorage } from "@/lib/storage"
import { getDb, now } from "./shared"
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

// ─── push: local rows → proto-json snapshot (incl. tombstones) ───────────────

async function buildSnapshot(projectId: string): Promise<Changes> {
  const db = await getDb()
  // Raw reads — NO deleted_at filter, so tombstones ship and deletions
  // propagate. updated_at is omitted from every row (the server stamps it).
  const all = async (sql: string) => db.select<Row[]>(sql, [projectId])

  const projectRows = await db.select<Row[]>("SELECT * FROM projects WHERE id = ?", [projectId])
  const [scenes, elements, characters, locations, beats, connections, lanes, outlineItems] =
    await Promise.all([
      all("SELECT * FROM scenes WHERE project_id = ?"),
      all("SELECT * FROM script_elements WHERE project_id = ?"),
      all("SELECT * FROM characters WHERE project_id = ?"),
      all("SELECT * FROM locations WHERE project_id = ?"),
      all("SELECT * FROM beats WHERE project_id = ?"),
      all("SELECT * FROM connections WHERE project_id = ?"),
      all("SELECT * FROM lanes WHERE project_id = ?"),
      all("SELECT * FROM outline_items WHERE project_id = ?"),
    ])

  const changes: Changes = {
    scenes: scenes.map(pushScene),
    elements: elements.map(pushElement),
    characters: characters.map(pushCharacter),
    locations: locations.map(pushLocation),
    beats: beats.map(pushBeat),
    connections: connections.map(pushConnection),
    lanes: lanes.map(pushLane),
    outline_items: outlineItems.map(pushOutlineItem),
  }
  if (projectRows[0]) changes.project = pushProject(projectRows[0])
  return changes
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
    await db.execute(
      `INSERT INTO sync_state (project_id, enabled, status, updated_at)
       VALUES (?, ?, 'idle', ?)
       ON CONFLICT(project_id) DO UPDATE SET enabled = ?, updated_at = ?`,
      [projectId, enabled ? 1 : 0, now(), enabled ? 1 : 0, now()],
    )
    if (enabled) await sync.syncProject(projectId)
  },

  syncProject: async (projectId) => {
    const state = await readState(projectId)
    if (!state.enabled) return state
    if (getAuthToken() === null) {
      await writeStatus(projectId, "offline", null)
      return readState(projectId)
    }

    await writeStatus(projectId, "syncing", null)
    try {
      const db = await getDb()
      const rows = await db.select<StateRow[]>("SELECT cursor FROM sync_state WHERE project_id = ?", [projectId])
      const cursorStr = rows[0]?.cursor ?? ""

      const body: { changes: Changes; cursor?: Ts } = { changes: await buildSnapshot(projectId) }
      if (cursorStr) body.cursor = JSON.parse(cursorStr) as Ts

      const resp = await apiClient<SyncResponse>(`sync/projects/${projectId}`, { method: "POST", body })
      await applyChanges(resp.changes)

      const nextCursor = resp.cursor ? JSON.stringify(resp.cursor) : cursorStr
      await db.execute(
        `UPDATE sync_state SET cursor = ?, last_synced_at = ?, status = 'idle', error = NULL, updated_at = ? WHERE project_id = ?`,
        [nextCursor, now(), now(), projectId],
      )
      // Time-based tombstone GC: reclaim rows deleted long enough ago that every
      // device has surely seen the deletion.
      await purgeLocalTombstones(projectId)
    } catch (err) {
      await writeStatus(projectId, "error", err instanceof Error ? err.message : "Sync failed")
    }
    return readState(projectId)
  },

  syncAll: async () => {
    const enabled = await sync.listEnabled()
    const out: SyncProjectState[] = []
    for (const s of enabled) out.push(await sync.syncProject(s.projectId))
    return out
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
