import type { BeatBoardData, BeatBoardStorage } from "@/lib/storage"
import {
  getDb,
  newId,
  now,
  toBeat,
  toConnection,
  toLane,
  toOutlineItem,
  type BeatRow,
  type ConnectionRow,
  type LaneRow,
  type OutlineItemRow,
} from "./shared"

// ─── Beat board ───────────────────────────────────────────────────────────

export const beatBoard: BeatBoardStorage = {
  getBoard: async (projectId) => {
    const db = await getDb()
    const [beatRows, connRows, laneRows, itemRows] = await Promise.all([
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
    ])
    const board: BeatBoardData = {
      beats: beatRows.map(toBeat),
      connections: connRows.map(toConnection),
      lanes: laneRows.map(toLane),
      outlineItems: itemRows.map(toOutlineItem),
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
  },

  createLane: async (projectId, input) => {
    const db = await getDb()
    const id = newId()
    await db.execute(
      `INSERT INTO lanes (id, project_id, name, color, order_index, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, projectId, input.name ?? "Lane", input.color ?? "#CCCCCC", input.order ?? 0, now()],
    )
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
  },

  updateLaneOrder: async (_projectId, orderedIds) => {
    const db = await getDb()
    const ts = now()
    for (let i = 0; i < orderedIds.length; i++) {
      await db.execute("UPDATE lanes SET order_index = ?, updated_at = ? WHERE id = ?", [i, ts, orderedIds[i]])
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
  },

  deleteOutlineItem: async (itemId) => {
    const db = await getDb()
    const ts = now()
    await db.execute(
      "UPDATE outline_items SET deleted_at = ?, updated_at = ? WHERE id = ?",
      [ts, ts, itemId],
    )
  },
}
