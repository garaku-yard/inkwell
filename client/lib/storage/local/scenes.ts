import type { SceneStorage } from "@/lib/storage"
import { getDb, newId, now, toScene, type SceneRow } from "./shared"

// ─── Scenes ───────────────────────────────────────────────────────────────

export const scenes: SceneStorage = {
  create: async (projectId, _userId, input) => {
    const db = await getDb()
    const id = newId()
    const ts = now()
    await db.execute(
      `INSERT INTO scenes (id, project_id, outline_unit_id, scene_heading, content, order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        input.outline_unit_id ?? null,
        input.scene_heading,
        input.content ?? "",
        input.order_index ?? 0,
        ts,
        ts,
      ],
    )
    const rows = await db.select<SceneRow[]>("SELECT * FROM scenes WHERE id = ?", [id])
    return toScene(rows[0])
  },

  listForProject: async (projectId) => {
    const db = await getDb()
    const rows = await db.select<SceneRow[]>(
      "SELECT * FROM scenes WHERE project_id = ? AND deleted_at IS NULL ORDER BY order_index",
      [projectId],
    )
    return rows.map(toScene)
  },

  updateHeading: async (sceneId, _userId, heading) => {
    const db = await getDb()
    const ts = now()
    await db.execute(
      "UPDATE scenes SET scene_heading = ?, updated_at = ? WHERE id = ?",
      [heading, ts, sceneId],
    )
    const rows = await db.select<SceneRow[]>("SELECT * FROM scenes WHERE id = ?", [sceneId])
    return toScene(rows[0])
  },

  delete: async (sceneId) => {
    const db = await getDb()
    const ts = now()
    // Soft-delete the scene and cascade a tombstone to its elements (hard
    // DELETE's FK CASCADE doesn't fire for an UPDATE), so both propagate on sync.
    await db.execute(
      "UPDATE scenes SET deleted_at = ?, updated_at = ? WHERE id = ?",
      [ts, ts, sceneId],
    )
    await db.execute(
      "UPDATE script_elements SET deleted_at = ?, updated_at = ? WHERE scene_id = ? AND deleted_at IS NULL",
      [ts, ts, sceneId],
    )
  },
}
