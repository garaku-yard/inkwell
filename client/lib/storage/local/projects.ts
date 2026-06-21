import type { FullProject, ProjectStorage } from "@/lib/storage"
import {
  getDb,
  markDirty,
  newId,
  now,
  softDeleteProjectChildren,
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
    await markDirty(db, "project", id, id)
    const rows = await db.select<ProjectRow[]>("SELECT * FROM projects WHERE id = ?", [id])
    return toProject(rows[0])
  },

  getById: async (projectId) => {
    const db = await getDb()
    const rows = await db.select<ProjectRow[]>(
      "SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL",
      [projectId],
    )
    if (rows.length === 0) throw new Error(`Project not found: ${projectId}`)
    return toProject(rows[0])
  },

  getFull: async (projectId, userId) => {
    const project = await projects.getById(projectId, userId)
    const sceneRows = await (await getDb()).select<SceneRow[]>(
      "SELECT * FROM scenes WHERE project_id = ? AND deleted_at IS NULL ORDER BY order_index",
      [projectId],
    )
    const scenes = await Promise.all(
      sceneRows.map(async (s) => {
        const elementRows = await (await getDb()).select<ElementRow[]>(
          "SELECT * FROM script_elements WHERE scene_id = ? AND deleted_at IS NULL ORDER BY line_number",
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

  listOwned: async () => {
    const db = await getDb()
    // The local DB is single-user, so every project is "yours" regardless of the
    // owner_id stored on the row. Filtering by the auth user's id would hide all
    // projects once a cloud account is linked (the working identity's id differs
    // from the seeded LOCAL_USER_ID the rows were created under). owner_id is a
    // sync artifact only — the server overrides it on push.
    const rows = await db.select<ProjectRow[]>(
      "SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC",
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
    await markDirty(db, "project", projectId, projectId)
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
    await markDirty(db, "project", projectId, projectId)
    const rows = await db.select<ProjectRow[]>("SELECT * FROM projects WHERE id = ?", [projectId])
    return toProject(rows[0])
  },

  delete: async (projectId) => {
    const db = await getDb()
    const ts = now()
    // The vault + knowledge index tables key on project_id without a foreign
    // key (notes live on disk, so they can't cascade from the projects row).
    // They're derived, device-local, and never synced, so hard-delete them.
    // project_knowledge is wiped whether this project was the consumer
    // (project_id) or the vault supplying notes to others (vault_project_id).
    await db.execute(
      "DELETE FROM project_knowledge WHERE project_id = ? OR vault_project_id = ?",
      [projectId, projectId],
    )
    await db.execute("DELETE FROM note_embeddings WHERE project_id = ?", [projectId])
    await db.execute("DELETE FROM note_links WHERE project_id = ?", [projectId])
    await db.execute("DELETE FROM note_tags WHERE project_id = ?", [projectId])
    // Soft-delete the project and cascade tombstones to its synced children, so
    // the deletion propagates on sync instead of vanishing without a trace.
    // (Hard DELETE's FK CASCADE doesn't fire for a soft-delete UPDATE.)
    await db.execute(
      "UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?",
      [ts, ts, projectId],
    )
    await markDirty(db, "project", projectId, projectId, "delete")
    await softDeleteProjectChildren(db, projectId, ts)
  },
}
