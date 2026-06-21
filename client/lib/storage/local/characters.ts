import type { CharacterStorage } from "@/lib/storage"
import { getDb, markDirty, newId, now, toCharacter, type CharacterRow } from "./shared"

// ─── Characters ──────────────────────────────────────────────────────────

export const characters: CharacterStorage = {
  create: async (projectId, _userId, input) => {
    const db = await getDb()
    const id = newId()
    const ts = now()
    await db.execute(
      `INSERT INTO characters (id, project_id, name, description, role, attributes_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        input.name,
        input.description ?? "",
        input.role ?? "",
        JSON.stringify(input.attributes ?? {}),
        ts,
        ts,
      ],
    )
    await markDirty(db, "character", projectId, id)
    const rows = await db.select<CharacterRow[]>("SELECT * FROM characters WHERE id = ?", [id])
    return toCharacter(rows[0])
  },

  listForProject: async (projectId) => {
    const db = await getDb()
    const rows = await db.select<CharacterRow[]>(
      "SELECT * FROM characters WHERE project_id = ? AND deleted_at IS NULL ORDER BY name",
      [projectId],
    )
    return rows.map(toCharacter)
  },
}
