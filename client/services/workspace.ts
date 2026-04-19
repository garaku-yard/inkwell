/** Workspace service — thin wrappers around the Storage abstraction. */
import { getStorage } from "@/lib/storage"

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
  getStorage().workspaces.listCategories()

export const listUserWorkspaces = (): Promise<WorkspacesResponse> =>
  getStorage().workspaces.list()

export const createPersonalWorkspaces = (
  _userId: string,
  categorySlugs: string[],
): Promise<{ workspaces: Workspace[] }> =>
  getStorage().workspaces.createPersonal(_userId, categorySlugs)

export const createOrgWorkspace = (data: {
  name: string
  description?: string
  category_slugs: string[]
}): Promise<Workspace> => getStorage().workspaces.createOrg(data)

export const getWorkspace = (workspaceId: string): Promise<Workspace> =>
  getStorage().workspaces.get(workspaceId)

export const updateWorkspace = (
  workspaceId: string,
  data: { name?: string; description?: string; avatar_url?: string },
): Promise<Workspace> => getStorage().workspaces.update(workspaceId, data)

export const deleteWorkspace = (workspaceId: string): Promise<void> =>
  getStorage().workspaces.delete(workspaceId)

export const enableCategory = (workspaceId: string, slug: string): Promise<Workspace> =>
  getStorage().workspaces.enableCategory(workspaceId, slug)

export const disableCategory = (workspaceId: string, slug: string): Promise<Workspace> =>
  getStorage().workspaces.disableCategory(workspaceId, slug)

export const listMembers = (workspaceId: string): Promise<WorkspaceMember[]> =>
  getStorage().collaboration.listMembers(workspaceId)

export const inviteMember = (
  workspaceId: string,
  target: string,
  role: string,
): Promise<{ invite_token: string }> =>
  getStorage().collaboration.inviteMember(workspaceId, target, role)

export const removeMember = (workspaceId: string, userId: string): Promise<void> =>
  getStorage().collaboration.removeMember(workspaceId, userId)

export const updateMemberRole = (
  workspaceId: string,
  userId: string,
  role: string,
): Promise<WorkspaceMember> =>
  getStorage().collaboration.updateMemberRole(workspaceId, userId, role)

export const acceptInvite = (token: string): Promise<Workspace> =>
  getStorage().collaboration.acceptWorkspaceInvite(token)

export const declineInvite = (token: string): Promise<void> =>
  getStorage().collaboration.declineWorkspaceInvite(token)
