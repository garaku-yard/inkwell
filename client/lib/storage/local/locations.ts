import type { LocationStorage } from "@/lib/storage"
import { getDb, newId, now, toLocation, type LocationRow } from "./shared"

// ─── Locations ───────────────────────────────────────────────────────────

export const locations: LocationStorage = {
  create: async (projectId, _userId, input) => {
    const db = await getDb()
    const id = newId()
    const ts = now()
    await db.execute(
      `INSERT INTO locations (id, project_id, name, description, type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, input.name, input.description ?? "", input.type ?? "", ts, ts],
    )
    const rows = await db.select<LocationRow[]>("SELECT * FROM locations WHERE id = ?", [id])
    return toLocation(rows[0])
  },

  listForProject: async (projectId) => {
    const db = await getDb()
    const rows = await db.select<LocationRow[]>(
      "SELECT * FROM locations WHERE project_id = ? AND deleted_at IS NULL ORDER BY name",
      [projectId],
    )
    return rows.map(toLocation)
  },
}
