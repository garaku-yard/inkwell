import type { BeatBoardData, BeatBoardStorage } from "@/lib/storage"
import Database from "@tauri-apps/plugin-sql"
import {
  getDb,
  markDirty,
  newId,
  now,
  toBeat,
  toConnection,
  toDrawing,
  toLane,
  toOutlineItem,
  type BeatRow,
  type ConnectionRow,
  type DrawingRow,
  type LaneRow,
  type OutlineItemRow,
  type SyncEntity,
} from "./shared"

/** Resolves the owning project of a beat-board row so the mutation can be
 *  recorded for incremental sync (these handlers take only the row id). `table`
 *  comes from a fixed constant, never user input. */
async function markRowDirty(
  db: Database,
  entity: SyncEntity,
  table: string,
  rowId: string,
  op: "upsert" | "delete" = "upsert",
): Promise<void> {
  const rows = await db.select<Array<{ project_id: string }>>(
    `SELECT project_id FROM ${table} WHERE id = ?`,
    [rowId],
  )
  if (rows[0]) await markDirty(db, entity, rows[0].project_id, rowId, op)
}

// ─── Beat board ───────────────────────────────────────────────────────────

export const beatBoard: BeatBoardStorage = {
  getBoard: async (projectId) => {
    const db = await getDb()
    const [beatRows, connRows, laneRows, itemRows, drawingRows] = await Promise.all([
      db.select<BeatRow[]>(
        "SELECT * FROM beats WHERE project_id = ? AND deleted_at IS NULL ORDER BY act, order_index",
        [projectId],
      ),
      db.select<ConnectionRow[]>(
        "SELECT * FROM connections WHERE project_id = ? AND deleted_at IS NULL",
        [projectId],
      ),
      db.select<LaneRow[]>(
        "SELECT * FROM lanes WHERE project_id = ? AND deleted_at IS NULL ORDER BY order_index",
        [projectId],
      ),
      db.select<OutlineItemRow[]>(
        "SELECT * FROM outline_items WHERE project_id = ? AND deleted_at IS NULL ORDER BY order_index",
        [projectId],
      ),
      // z-order, then created_at so shapes drawn in the same slot stack in the
      // order they were made rather than an arbitrary one.
      db.select<DrawingRow[]>(
        "SELECT * FROM drawings WHERE project_id = ? AND deleted_at IS NULL ORDER BY order_index, created_at",
        [projectId],
      ),
    ])
    const board: BeatBoardData = {
      beats: beatRows.map(toBeat),
      connections: connRows.map(toConnection),
      lanes: laneRows.map(toLane),
      outlineItems: itemRows.map(toOutlineItem),
      drawings: drawingRows.map(toDrawing),
    }
    return board
  },

  createBeat: async (projectId, input) => {
    const db = await getDb()
    const id = newId()
    await db.execute(
      `INSERT INTO beats (id, project_id, title, description, scene_numbers, color, position_x, position_y, width, height, act, order_index, start_page, end_page, image_url, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        input.title ?? "",
        input.description ?? "",
        input.sceneNumbers ?? "",
        input.color ?? "#FFFFFF",
        input.position?.x ?? 0,
        input.position?.y ?? 0,
        input.width ?? 200,
        input.height ?? 100,
        input.act ?? 1,
        input.order ?? 0,
        input.startPage ?? null,
        input.endPage ?? null,
        input.imageUrl ?? null,
        now(),
      ],
    )
    await markDirty(db, "beat", projectId, id)
    const rows = await db.select<BeatRow[]>("SELECT * FROM beats WHERE id = ?", [id])
    return toBeat(rows[0])
  },

  updateBeat: async (beatId, patch) => {
    const db = await getDb()
    const sets: string[] = []
    const args: (string | number | null)[] = []
    const push = (col: string, val: string | number | null | undefined) => {
      if (val === undefined) return
      sets.push(`${col} = ?`)
      args.push(val)
    }
    push("title", patch.title)
    push("description", patch.description)
    push("scene_numbers", patch.sceneNumbers)
    push("color", patch.color)
    push("position_x", patch.position?.x)
    push("position_y", patch.position?.y)
    push("width", patch.width)
    push("height", patch.height)
    push("act", patch.act)
    push("order_index", patch.order)
    push("start_page", patch.startPage ?? null)
    push("end_page", patch.endPage ?? null)
    push("image_url", patch.imageUrl ?? null)
    if (sets.length > 0) {
      sets.push("updated_at = ?")
      args.push(now())
      args.push(beatId)
      await db.execute(`UPDATE beats SET ${sets.join(", ")} WHERE id = ?`, args)
      await markRowDirty(db, "beat", "beats", beatId)
    }
    const rows = await db.select<BeatRow[]>("SELECT * FROM beats WHERE id = ?", [beatId])
    return toBeat(rows[0])
  },

  deleteBeat: async (beatId) => {
    const db = await getDb()
    const ts = now()
    await db.execute(
      "UPDATE beats SET deleted_at = ?, updated_at = ? WHERE id = ?",
      [ts, ts, beatId],
    )
    await markRowDirty(db, "beat", "beats", beatId, "delete")
  },

  createConnection: async (projectId, input) => {
    const db = await getDb()
    const id = newId()
    await db.execute(
      `INSERT INTO connections (id, project_id, from_id, to_id, from_side, to_side, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        input.fromId ?? "",
        input.toId ?? "",
        input.fromSide ?? "right",
        input.toSide ?? "left",
        now(),
      ],
    )
    await markDirty(db, "connection", projectId, id)
    const rows = await db.select<ConnectionRow[]>(
      "SELECT * FROM connections WHERE id = ?",
      [id],
    )
    return toConnection(rows[0])
  },

  deleteConnection: async (connectionId) => {
    const db = await getDb()
    const ts = now()
    await db.execute(
      "UPDATE connections SET deleted_at = ?, updated_at = ? WHERE id = ?",
      [ts, ts, connectionId],
    )
    await markRowDirty(db, "connection", "connections", connectionId, "delete")
  },

  createLane: async (projectId, input) => {
    const db = await getDb()
    const id = newId()
    await db.execute(
      `INSERT INTO lanes (id, project_id, name, color, order_index, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, projectId, input.name ?? "Lane", input.color ?? "#CCCCCC", input.order ?? 0, now()],
    )
    await markDirty(db, "lane", projectId, id)
    const rows = await db.select<LaneRow[]>("SELECT * FROM lanes WHERE id = ?", [id])
    return toLane(rows[0])
  },

  updateLane: async (laneId, patch) => {
    const db = await getDb()
    const sets: string[] = []
    const args: (string | number | null)[] = []
    if (patch.name !== undefined) {
      sets.push("name = ?")
      args.push(patch.name)
    }
    if (patch.color !== undefined) {
      sets.push("color = ?")
      args.push(patch.color)
    }
    if (patch.order !== undefined) {
      sets.push("order_index = ?")
      args.push(patch.order)
    }
    if (sets.length === 0) return
    sets.push("updated_at = ?")
    args.push(now())
    args.push(laneId)
    await db.execute(`UPDATE lanes SET ${sets.join(", ")} WHERE id = ?`, args)
    await markRowDirty(db, "lane", "lanes", laneId)
  },

  updateLaneOrder: async (projectId, orderedIds) => {
    const db = await getDb()
    const ts = now()
    for (let i = 0; i < orderedIds.length; i++) {
      await db.execute("UPDATE lanes SET order_index = ?, updated_at = ? WHERE id = ?", [i, ts, orderedIds[i]])
      await markDirty(db, "lane", projectId, orderedIds[i])
    }
  },

  createOutlineItem: async (projectId, input) => {
    const db = await getDb()
    const id = newId()
    await db.execute(
      `INSERT INTO outline_items (id, project_id, beat_id, lane_id, order_index, timeline_position, width, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        input.beatId ?? "",
        input.laneId ?? "",
        input.order ?? 0,
        input.timelinePosition ?? null,
        input.width ?? null,
        now(),
      ],
    )
    await markDirty(db, "outline_item", projectId, id)
    const rows = await db.select<OutlineItemRow[]>(
      "SELECT * FROM outline_items WHERE id = ?",
      [id],
    )
    return toOutlineItem(rows[0])
  },

  updateOutlineItem: async (itemId, patch) => {
    const db = await getDb()
    const sets: string[] = []
    const args: (string | number | null)[] = []
    if (patch.beatId !== undefined) {
      sets.push("beat_id = ?")
      args.push(patch.beatId)
    }
    if (patch.laneId !== undefined) {
      sets.push("lane_id = ?")
      args.push(patch.laneId)
    }
    if (patch.order !== undefined) {
      sets.push("order_index = ?")
      args.push(patch.order)
    }
    if (patch.timelinePosition !== undefined) {
      sets.push("timeline_position = ?")
      args.push(patch.timelinePosition)
    }
    if (patch.width !== undefined) {
      sets.push("width = ?")
      args.push(patch.width)
    }
    if (sets.length === 0) return
    sets.push("updated_at = ?")
    args.push(now())
    args.push(itemId)
    await db.execute(`UPDATE outline_items SET ${sets.join(", ")} WHERE id = ?`, args)
    await markRowDirty(db, "outline_item", "outline_items", itemId)
  },

  deleteOutlineItem: async (itemId) => {
    const db = await getDb()
    const ts = now()
    await db.execute(
      "UPDATE outline_items SET deleted_at = ?, updated_at = ? WHERE id = ?",
      [ts, ts, itemId],
    )
    await markRowDirty(db, "outline_item", "outline_items", itemId, "delete")
  },

  // ─── Drawing layer (decisions/0022) ─────────────────────────────────────
  //
  // One row per shape. `data` is JSON (geometry + style) written whole on every
  // update: a shape is small and always edited as a unit — a stroke is one
  // gesture — so there's nothing to gain from picking it apart into columns.

  createDrawing: async (projectId, input) => {
    const db = await getDb()
    const id = newId()
    const ts = now()
    await db.execute(
      `INSERT INTO drawings (id, project_id, kind, data, order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        input.kind ?? "pen",
        JSON.stringify(input.data ?? { points: [], color: "#000000", width: 2 }),
        input.order ?? 0,
        ts,
        ts,
      ],
    )
    await markDirty(db, "drawing", projectId, id)
    const rows = await db.select<DrawingRow[]>("SELECT * FROM drawings WHERE id = ?", [id])
    return toDrawing(rows[0])
  },

  updateDrawing: async (drawingId, patch) => {
    const db = await getDb()
    const sets: string[] = []
    const args: (string | number | null)[] = []
    if (patch.kind !== undefined) {
      sets.push("kind = ?")
      args.push(patch.kind)
    }
    if (patch.data !== undefined) {
      sets.push("data = ?")
      args.push(JSON.stringify(patch.data))
    }
    if (patch.order !== undefined) {
      sets.push("order_index = ?")
      args.push(patch.order)
    }
    if (sets.length > 0) {
      sets.push("updated_at = ?")
      args.push(now())
      args.push(drawingId)
      await db.execute(`UPDATE drawings SET ${sets.join(", ")} WHERE id = ?`, args)
      await markRowDirty(db, "drawing", "drawings", drawingId)
    }
    const rows = await db.select<DrawingRow[]>("SELECT * FROM drawings WHERE id = ?", [drawingId])
    if (!rows[0]) throw new Error(`drawing ${drawingId} not found`)
    return toDrawing(rows[0])
  },

  deleteDrawing: async (drawingId) => {
    const db = await getDb()
    const ts = now()
    // Soft-delete: the tombstone is what carries an erase to other devices.
    await db.execute("UPDATE drawings SET deleted_at = ?, updated_at = ? WHERE id = ?", [
      ts,
      ts,
      drawingId,
    ])
    await markRowDirty(db, "drawing", "drawings", drawingId, "delete")
  },
}
