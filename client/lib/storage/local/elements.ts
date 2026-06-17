import type { ElementStorage } from "@/lib/storage"
import { getDb, newId, now, toElement, type ElementRow } from "./shared"

// ─── Elements ─────────────────────────────────────────────────────────────

export const elements: ElementStorage = {
  create: async (input) => {
    const db = await getDb()
    const id = newId()
    const ts = now()
    // Scene must already exist; look up project_id so the element row carries
    // both ids (the outline editor queries by project_id).
    const sceneRows = await db.select<Array<{ project_id: string }>>(
      "SELECT project_id FROM scenes WHERE id = ?",
      [input.sceneId],
    )
    const projectId = sceneRows[0]?.project_id ?? ""
    await db.execute(
      `INSERT INTO script_elements (id, project_id, scene_id, element_type, content, line_number, formatting_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
      [
        id,
        projectId,
        input.sceneId,
        input.elementType,
        input.content,
        input.elementOrder,
        ts,
        ts,
      ],
    )
    const rows = await db.select<ElementRow[]>(
      "SELECT * FROM script_elements WHERE id = ?",
      [id],
    )
    return toElement(rows[0])
  },

  listForScene: async (sceneId) => {
    const db = await getDb()
    const rows = await db.select<ElementRow[]>(
      "SELECT * FROM script_elements WHERE scene_id = ? ORDER BY line_number",
      [sceneId],
    )
    return rows.map(toElement)
  },

  update: async (elementId, patch) => {
    const db = await getDb()
    const ts = now()
    const sets: string[] = []
    const args: (string | number | null)[] = []
    if (patch.content !== undefined) {
      sets.push("content = ?")
      args.push(patch.content)
    }
    if (patch.elementType !== undefined) {
      sets.push("element_type = ?")
      args.push(patch.elementType)
    }
    sets.push("updated_at = ?")
    args.push(ts)
    args.push(elementId)
    await db.execute(`UPDATE script_elements SET ${sets.join(", ")} WHERE id = ?`, args)
    const rows = await db.select<ElementRow[]>(
      "SELECT * FROM script_elements WHERE id = ?",
      [elementId],
    )
    return toElement(rows[0])
  },

  delete: async (elementId) => {
    const db = await getDb()
    await db.execute("DELETE FROM script_elements WHERE id = ?", [elementId])
  },

  listForProject: async (projectId, _userId, startLine, endLine) => {
    const db = await getDb()
    let sql = "SELECT * FROM script_elements WHERE project_id = ?"
    const args: (string | number)[] = [projectId]
    if (startLine !== undefined) {
      sql += " AND line_number >= ?"
      args.push(startLine)
    }
    if (endLine !== undefined) {
      sql += " AND line_number <= ?"
      args.push(endLine)
    }
    sql += " ORDER BY line_number"
    const rows = await db.select<ElementRow[]>(sql, args)
    return rows.map(toElement)
  },
}
