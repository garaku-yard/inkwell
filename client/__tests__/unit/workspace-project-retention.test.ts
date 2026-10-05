import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  timestamp: "2026-10-02T00:00:00.000Z",
  workspaces: [] as Array<{ categories_json: string }>,
  projects: [] as Array<{ id: string; category: string; workspace_removed_at: string | null; deleted_at: string | null; org_id: string | null }>,
  syncEnabled: false,
  execute: vi.fn(),
  markDirty: vi.fn(),
  softDeleteProjectChildren: vi.fn(),
}))

vi.mock("@/lib/storage/local/shared", () => ({
  now: () => h.timestamp,
  toWorkspace: (row: { categories_json: string }) => ({ categories: JSON.parse(row.categories_json) }),
  markDirty: h.markDirty,
  softDeleteProjectChildren: h.softDeleteProjectChildren,
  SYNCED_PROJECT_CHILD_TABLES: [{ table: "scenes" }],
  getDb: async () => ({
    select: async (sql: string) => {
      if (sql.includes("FROM workspaces")) return h.workspaces
      if (sql.includes("FROM sync_state")) return h.syncEnabled ? [{ enabled: 1 }] : []
      if (sql.includes("LEFT JOIN sync_state")) return h.projects.filter((project) => project.deleted_at).map((project) => ({ id: project.id, enabled: h.syncEnabled ? 1 : 0 }))
      if (sql.includes("FROM projects")) return h.projects.filter((project) => !project.deleted_at && !project.org_id)
      return []
    },
    execute: h.execute,
  }),
}))

import { reconcileWorkspaceProjects } from "@/lib/storage/local/workspace-project-retention"

const project = (id: string, category = "poetry", removedAt: string | null = null) => ({
  id, category, workspace_removed_at: removedAt, deleted_at: null, org_id: null,
})

beforeEach(() => {
  h.workspaces = []
  h.projects = []
  h.syncEnabled = false
  h.execute.mockReset().mockImplementation(async (sql: string, args: unknown[]) => {
    const row = h.projects.find((item) => item.id === (sql.includes("UPDATE projects SET deleted_at") ? args[2] : args.at(-1)))
    if (sql.includes("SET workspace_removed_at = ?") && row) row.workspace_removed_at = args[0] as string
    if (sql.includes("SET deleted_at = ?") && row) row.deleted_at = args[0] as string
    if (sql.includes("DELETE FROM projects")) h.projects = h.projects.filter((item) => item.id !== args[0])
  })
  h.markDirty.mockReset()
  h.softDeleteProjectChildren.mockReset()
})

describe("personal workspace project recovery", () => {
  it("keeps deleted-workspace projects hidden when a new workspace for the format appears", async () => {
    h.projects = [project("poem"), project("org-poem")]
    h.projects[1].org_id = "org"
    await reconcileWorkspaceProjects()
    expect(h.projects[0].workspace_removed_at).toBe(h.timestamp)
    expect(h.projects[1].workspace_removed_at).toBeNull()
    expect(h.projects[0].deleted_at).toBeNull()

    h.workspaces = [{ categories_json: '[{"slug":"poetry"}]' }]
    h.projects.push(project("new-poem"))
    await reconcileWorkspaceProjects()
    expect(h.projects[0].workspace_removed_at).toBe(h.timestamp)
    expect(h.projects[2].workspace_removed_at).toBeNull()
    expect(h.projects).toHaveLength(3)
  })

  it("treats a personal workspace with no category restriction as covering all formats", async () => {
    h.workspaces = [{ categories_json: "[]" }]
    h.projects = [project("poem"), project("script", "interactive_fiction"), project("deleted", "poetry", h.timestamp)]
    await reconcileWorkspaceProjects()
    expect(h.projects[0].workspace_removed_at).toBeNull()
    expect(h.projects[1].workspace_removed_at).toBeNull()
    expect(h.projects[2].workspace_removed_at).toBe(h.timestamp)
  })

  it("permanently removes an unsynced project after 30 days", async () => {
    h.projects = [project("old", "poetry", "2026-08-01T00:00:00.000Z")]
    await reconcileWorkspaceProjects()
    expect(h.projects).toHaveLength(0)
    expect(h.softDeleteProjectChildren).toHaveBeenCalledWith(expect.anything(), "old", h.timestamp)
    expect(h.execute.mock.calls.some(([sql]) => sql.includes("DELETE FROM scenes"))).toBe(true)
  })

  it("keeps a synced tombstone until its deletion can be sent", async () => {
    h.syncEnabled = true
    h.projects = [project("old", "poetry", "2026-08-01T00:00:00.000Z")]
    await expect(reconcileWorkspaceProjects()).resolves.toEqual(["old"])
    expect(h.projects[0].deleted_at).toBe(h.timestamp)
    expect(h.markDirty).toHaveBeenCalledWith(expect.anything(), "project", "old", "old", "delete")
    expect(h.execute.mock.calls.some(([sql]) => sql.includes("DELETE FROM projects"))).toBe(false)
  })

  it("retries an expired synced deletion after a previous offline attempt", async () => {
    h.syncEnabled = true
    h.projects = [project("old", "poetry", "2026-08-01T00:00:00.000Z")]
    h.projects[0].deleted_at = "2026-09-01T00:00:00.000Z"
    await expect(reconcileWorkspaceProjects()).resolves.toEqual(["old"])
    expect(h.projects).toHaveLength(1)
  })
})
