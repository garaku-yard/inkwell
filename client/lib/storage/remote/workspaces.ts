import { apiClient } from "@/lib/api"

import type { Category, Workspace, WorkspacesResponse } from "@/lib/storage"

// ─── Workspaces ───────────────────────────────────────────────────────────

export const workspaces = {
  listCategories: () => apiClient<Category[]>("categories"),
  list: () => apiClient<WorkspacesResponse>("workspaces"),
  createPersonal: (_userId: string, categorySlugs: string[]) =>
    apiClient<{ workspaces: Workspace[] }>("workspaces/personal", {
      method: "POST",
      body: { category_slugs: categorySlugs },
    }),
  createOrg: (input: { name: string; description?: string; category_slugs?: string[] }) =>
    apiClient<Workspace>("workspaces/org", {
      method: "POST",
      body: {
        name: input.name,
        description: input.description,
        category_slugs: input.category_slugs ?? [],
      },
    }),
  get: (workspaceId: string) => apiClient<Workspace>(`workspaces/${workspaceId}`),
  update: (
    workspaceId: string,
    patch: { name?: string; description?: string; avatar_url?: string },
  ) =>
    apiClient<Workspace>(`workspaces/${workspaceId}`, {
      method: "PATCH",
      body: patch,
    }),
  delete: async (workspaceId: string) => {
    await apiClient<void>(`workspaces/${workspaceId}`, { method: "DELETE" })
  },
  enableCategory: (workspaceId: string, slug: string) =>
    apiClient<Workspace>(`workspaces/${workspaceId}/categories/${slug}`, {
      method: "POST",
    }),
  disableCategory: (workspaceId: string, slug: string) =>
    apiClient<Workspace>(`workspaces/${workspaceId}/categories/${slug}`, {
      method: "DELETE",
    }),
}
