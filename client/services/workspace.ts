/** Workspace service — workspace and category management API calls. */
import { apiClient } from "@/lib/api"

export interface Category {
  id: string
  slug: string
  name: string
  description: string
  icon: string
}

export interface Workspace {
  id: string
  name: string
  slug: string
  type: "personal" | "org"
  owner_id: string
  avatar_url?: string
  description?: string
  categories: Category[]
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: "owner" | "admin" | "editor" | "viewer"
  invited_by?: string
}

export interface WorkspacesResponse {
  personal: Workspace[]
  org: Workspace[]
}

export const listCategories = (): Promise<Category[]> =>
  apiClient<Category[]>("categories")

export const listUserWorkspaces = (): Promise<WorkspacesResponse> =>
  apiClient<WorkspacesResponse>("workspaces")

export const createPersonalWorkspaces = (_userId: string, categorySlugs: string[]): Promise<{ workspaces: Workspace[] }> =>
  apiClient<{ workspaces: Workspace[] }>("workspaces/personal", {
    method: "POST",
    body: { category_slugs: categorySlugs },
  })

export const createOrgWorkspace = (data: {
  name: string
  description?: string
  category_slugs: string[]
}): Promise<Workspace> =>
  apiClient<Workspace>("workspaces/org", {
    method: "POST",
    body: data,
  })

export const getWorkspace = (workspaceId: string): Promise<Workspace> =>
  apiClient<Workspace>(`workspaces/${workspaceId}`)

export const updateWorkspace = (workspaceId: string, data: {
  name?: string
  description?: string
  avatar_url?: string
}): Promise<Workspace> =>
  apiClient<Workspace>(`workspaces/${workspaceId}`, {
    method: "PATCH",
    body: data,
  })

export const deleteWorkspace = (workspaceId: string): Promise<void> =>
  apiClient<void>(`workspaces/${workspaceId}`, { method: "DELETE" })

export const enableCategory = (workspaceId: string, slug: string): Promise<Workspace> =>
  apiClient<Workspace>(`workspaces/${workspaceId}/categories/${slug}`, { method: "POST" })

export const disableCategory = (workspaceId: string, slug: string): Promise<Workspace> =>
  apiClient<Workspace>(`workspaces/${workspaceId}/categories/${slug}`, { method: "DELETE" })

export const listMembers = (workspaceId: string): Promise<WorkspaceMember[]> =>
  apiClient<WorkspaceMember[]>(`workspaces/${workspaceId}/members`)

export const inviteMember = (workspaceId: string, email: string, role: string): Promise<{ invite_token: string }> =>
  apiClient<{ invite_token: string }>(`workspaces/${workspaceId}/members/invite`, {
    method: "POST",
    body: { email, role },
  })

export const removeMember = (workspaceId: string, userId: string): Promise<void> =>
  apiClient<void>(`workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" })

export const updateMemberRole = (workspaceId: string, userId: string, role: string): Promise<WorkspaceMember> =>
  apiClient<WorkspaceMember>(`workspaces/${workspaceId}/members/${userId}/role`, {
    method: "PATCH",
    body: { role },
  })

export const acceptInvite = (token: string): Promise<Workspace> =>
  apiClient<Workspace>(`workspaces/invites/${token}/accept`, { method: "POST" })

export const declineInvite = (token: string): Promise<void> =>
  apiClient<void>(`workspaces/invites/${token}/decline`, { method: "POST" })
