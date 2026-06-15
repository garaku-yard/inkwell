import type { FullProject, ProjectStorage } from "@/lib/storage"
import {
  getDb,
  newId,
  now,
  toElement,
  toProject,
  toScene,
  type ElementRow,
  type ProjectRow,
  type SceneRow,
} from "./shared"

// ─── Projects ─────────────────────────────────────────────────────────────

export const projects: ProjectStorage = {
  create: async (input) => {
    const db = await getDb()
    const id = newId()
    const ts = now()
    await db.execute(
      `INSERT INTO projects (id, title, description, owner_id, category, status, is_starred, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', 0, ?, ?)`,
      [
        id,
        input.title,
        input.description ?? "",
        input.owner_id,
        input.category ?? "screenplay",
        ts,
        ts,
      ],
    )
    const rows = await db.select<ProjectRow[]>("SELECT * FROM projects WHERE id = ?", [id])
    return toProject(rows[0])
  },

  getById: async (projectId) => {
    const db = await getDb()
    const rows = await db.select<ProjectRow[]>("SELECT * FROM projects WHERE id = ?", [projectId])
    if (rows.length === 0) throw new Error(`Project not found: ${projectId}`)
    return toProject(rows[0])
  },

  getFull: async (projectId, userId) => {
    const project = await projects.getById(projectId, userId)
    const sceneRows = await (await getDb()).select<SceneRow[]>(
      "SELECT * FROM scenes WHERE project_id = ? ORDER BY order_index",
      [projectId],
    )
    const scenes = await Promise.all(
      sceneRows.map(async (s) => {
        const elementRows = await (await getDb()).select<ElementRow[]>(
          "SELECT * FROM script_elements WHERE scene_id = ? ORDER BY line_number",
          [s.id],
        )
        return {
          ...toScene(s),
          elements: elementRows.map(toElement),
          comments: [],
        }
      }),
    )
    const full: FullProject = { ...project, scenes }
    return full
  },

  listOwned: async (userId) => {
    const db = await getDb()
    const rows = await db.select<ProjectRow[]>(
      "SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC",
      [userId],
    )
    const list = rows.map(toProject)
    return { projects: list, total: list.length }
  },

  listShared: async () => [],

  update: async (projectId, _userId, patch) => {
    const db = await getDb()
    const ts = now()
    const sets: string[] = []
    const args: (string | number | null)[] = []
    if (patch.title !== undefined) {
      sets.push("title = ?")
      args.push(patch.title)
    }
    if (patch.description !== undefined) {
      sets.push("description = ?")
      args.push(patch.description)
    }
    if (patch.status !== undefined) {
      sets.push("status = ?")
      args.push(patch.status)
    }
    sets.push("updated_at = ?")
    args.push(ts)
    args.push(projectId)
    await db.execute(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`, args)
    const rows = await db.select<ProjectRow[]>("SELECT * FROM projects WHERE id = ?", [projectId])
    return toProject(rows[0])
  },

  toggleStar: async (projectId) => {
    const db = await getDb()
    const ts = now()
    await db.execute(
      "UPDATE projects SET is_starred = 1 - is_starred, updated_at = ? WHERE id = ?",
      [ts, projectId],
    )
    const rows = await db.select<ProjectRow[]>("SELECT * FROM projects WHERE id = ?", [projectId])
    return toProject(rows[0])
  },

  delete: async (projectId) => {
    const db = await getDb()
    await db.execute("DELETE FROM projects WHERE id = ?", [projectId])
  },
}
