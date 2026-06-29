import { apiClient } from "@/lib/api"

import type { Category, Workspace, WorkspacesResponse } from "@/lib/storage"

// ─── Workspaces ───────────────────────────────────────────────────────────

/** The gateway serialises workspaces with proto3 JSON, which omits empty
 *  repeated fields — a workspace with no enabled categories comes back with
 *  no `categories` key at all. Coerce it to `[]` at the storage boundary so
 *  the `Workspace` type's `categories: Category[]` stays honest and callers
 *  never trip over an undefined array. */
function normalizeWorkspace(w: Workspace): Workspace {
  return { ...w, categories: w.categories ?? [] }
}

export const workspaces = {
  listCategories: () => apiClient<Category[]>("categories"),
  list: async (): Promise<WorkspacesResponse> => {
    const res = await apiClient<WorkspacesResponse>("workspaces")
    return {
      personal: (res.personal ?? []).map(normalizeWorkspace),
      org: (res.org ?? []).map(normalizeWorkspace),
    }
  },
  createPersonal: async (_userId: string, categorySlugs: string[]) => {
    const res = await apiClient<{ workspaces: Workspace[] }>("workspaces/personal", {
      method: "POST",
      body: { category_slugs: categorySlugs },
    })
    return { workspaces: (res.workspaces ?? []).map(normalizeWorkspace) }
  },
  createOrg: async (input: { name: string; description?: string; category_slugs?: string[] }) =>
    normalizeWorkspace(
      await apiClient<Workspace>("workspaces/org", {
        method: "POST",
        body: {
          name: input.name,
          description: input.description,
          category_slugs: input.category_slugs ?? [],
        },
      }),
    ),
  get: async (workspaceId: string) =>
    normalizeWorkspace(await apiClient<Workspace>(`workspaces/${workspaceId}`)),
  update: async (
    workspaceId: string,
    patch: { name?: string; description?: string; avatar_url?: string },
  ) =>
    normalizeWorkspace(
      await apiClient<Workspace>(`workspaces/${workspaceId}`, {
        method: "PATCH",
        body: patch,
      }),
    ),
  delete: async (workspaceId: string) => {
    await apiClient<void>(`workspaces/${workspaceId}`, { method: "DELETE" })
  },
  enableCategory: async (workspaceId: string, slug: string) =>
    normalizeWorkspace(
      await apiClient<Workspace>(`workspaces/${workspaceId}/categories/${slug}`, {
        method: "POST",
      }),
    ),
  disableCategory: async (workspaceId: string, slug: string) =>
    normalizeWorkspace(
      await apiClient<Workspace>(`workspaces/${workspaceId}/categories/${slug}`, {
        method: "DELETE",
      }),
    ),
}
