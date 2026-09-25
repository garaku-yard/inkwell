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

  update: async (characterId, _userId, input) => {
    const db = await getDb()
    const current = await db.select<CharacterRow[]>(
      "SELECT * FROM characters WHERE id = ? AND deleted_at IS NULL",
      [characterId],
    )
    if (!current[0]) throw new Error("Character not found")

    const ts = now()
    const next = {
      name: input.name ?? current[0].name,
      description: input.description ?? current[0].description,
      role: input.role ?? current[0].role,
      attributes_json:
        input.attributes === undefined
          ? current[0].attributes_json
          : JSON.stringify(input.attributes),
    }
    await db.execute(
      `UPDATE characters
       SET name = ?, description = ?, role = ?, attributes_json = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [next.name, next.description, next.role, next.attributes_json, ts, characterId],
    )
    await markDirty(db, "character", current[0].project_id, characterId)
    const rows = await db.select<CharacterRow[]>("SELECT * FROM characters WHERE id = ?", [characterId])
    return toCharacter(rows[0])
  },

  delete: async (characterId) => {
    const db = await getDb()
    const rows = await db.select<CharacterRow[]>(
      "SELECT * FROM characters WHERE id = ? AND deleted_at IS NULL",
      [characterId],
    )
    if (!rows[0]) return
    const ts = now()
    await db.execute(
      "UPDATE characters SET deleted_at = ?, updated_at = ? WHERE id = ?",
      [ts, ts, characterId],
    )
    await markDirty(db, "character", rows[0].project_id, characterId, "delete")
  },
}
