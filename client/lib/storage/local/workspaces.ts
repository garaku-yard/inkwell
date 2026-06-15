import type { Workspace, WorkspaceStorage, WorkspacesResponse } from "@/lib/storage"
import {
  BUILTIN_CATEGORIES,
  ensureUserProfile,
  getDb,
  newId,
  now,
  slugifyCategory,
  toWorkspace,
  type WorkspaceRow,
} from "./shared"

// ─── Workspaces (local-only; no members/invites) ──────────────────────────

export const workspaces: WorkspaceStorage = {
  listCategories: async () => BUILTIN_CATEGORIES,

  list: async () => {
    const db = await getDb()
    const rows = await db.select<WorkspaceRow[]>(
      "SELECT * FROM workspaces ORDER BY name",
    )
    const all = rows.map(toWorkspace)
    const out: WorkspacesResponse = {
      personal: all.filter((w) => w.type !== "org"),
      org: all.filter((w) => w.type === "org"),
    }
    return out
  },

  createPersonal: async (_userId, categorySlugs) => {
    const me = await ensureUserProfile()
    const db = await getDb()
    const created: Workspace[] = []
    for (const slug of categorySlugs) {
      const id = newId()
      const ts = now()
      const cats = [slugifyCategory(slug)]
      await db.execute(
        `INSERT INTO workspaces (id, name, slug, type, owner_id, avatar_url, description, categories_json, created_at, updated_at)
         VALUES (?, ?, ?, 'personal', ?, NULL, NULL, ?, ?, ?)`,
        [id, `${slug} workspace`, slug, me.id, JSON.stringify(cats), ts, ts],
      )
      const rows = await db.select<WorkspaceRow[]>(
        "SELECT * FROM workspaces WHERE id = ?",
        [id],
      )
      created.push(toWorkspace(rows[0]))
    }
    return { workspaces: created }
  },

  createOrg: async (input) => {
    const me = await ensureUserProfile()
    const db = await getDb()
    const id = newId()
    const ts = now()
    const cats = (input.category_slugs ?? []).map(slugifyCategory)
    const slug = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
    await db.execute(
      `INSERT INTO workspaces (id, name, slug, type, owner_id, avatar_url, description, categories_json, created_at, updated_at)
       VALUES (?, ?, ?, 'org', ?, NULL, ?, ?, ?, ?)`,
      [id, input.name, slug, me.id, input.description ?? null, JSON.stringify(cats), ts, ts],
    )
    const rows = await db.select<WorkspaceRow[]>(
      "SELECT * FROM workspaces WHERE id = ?",
      [id],
    )
    return toWorkspace(rows[0])
  },

  get: async (workspaceId) => {
    const db = await getDb()
    const rows = await db.select<WorkspaceRow[]>(
      "SELECT * FROM workspaces WHERE id = ?",
      [workspaceId],
    )
    if (rows.length === 0) throw new Error(`Workspace not found: ${workspaceId}`)
    return toWorkspace(rows[0])
  },

  update: async (workspaceId, patch) => {
    const db = await getDb()
    const ts = now()
    const sets: string[] = []
    const args: (string | number | null)[] = []
    if (patch.name !== undefined) {
      sets.push("name = ?")
      args.push(patch.name)
    }
    if (patch.description !== undefined) {
      sets.push("description = ?")
      args.push(patch.description ?? null)
    }
    if (patch.avatar_url !== undefined) {
      sets.push("avatar_url = ?")
      args.push(patch.avatar_url ?? null)
    }
    sets.push("updated_at = ?")
    args.push(ts)
    args.push(workspaceId)
    await db.execute(`UPDATE workspaces SET ${sets.join(", ")} WHERE id = ?`, args)
    return workspaces.get(workspaceId)
  },

  delete: async (workspaceId) => {
    const db = await getDb()
    await db.execute("DELETE FROM workspaces WHERE id = ?", [workspaceId])
  },

  enableCategory: async (workspaceId, slug) => {
    const ws = await workspaces.get(workspaceId)
    const next = [...ws.categories.filter((c) => c.slug !== slug), slugifyCategory(slug)]
    const db = await getDb()
    await db.execute(
      "UPDATE workspaces SET categories_json = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify(next), now(), workspaceId],
    )
    return workspaces.get(workspaceId)
  },

  disableCategory: async (workspaceId, slug) => {
    const ws = await workspaces.get(workspaceId)
    const next = ws.categories.filter((c) => c.slug !== slug)
    const db = await getDb()
    await db.execute(
      "UPDATE workspaces SET categories_json = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify(next), now(), workspaceId],
    )
    return workspaces.get(workspaceId)
  },
}
