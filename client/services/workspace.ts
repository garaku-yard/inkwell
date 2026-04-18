/** Workspace service — workspace and category management API calls. */
import { apiClient } from "@/lib/api"

/** A content category that can be enabled on a workspace (e.g. screenplay, prose). */
export interface Category {
  /** UUID of the category. */
  id: string;
  /** URL-safe identifier used in API paths (e.g. `"screenplay"`). */
  slug: string;
  /** Human-readable display name (e.g. `"Screenplay"`). */
  name: string;
  /** Short description shown in category pickers. */
  description: string;
  /** Icon identifier used by the UI (e.g. a Lucide icon name). */
  icon: string;
}

/** A workspace groups projects by content type and team. */
export interface Workspace {
  /** UUID of the workspace. */
  id: string;
  /** Display name of the workspace. */
  name: string;
  /** URL-safe slug derived from the workspace name. */
  slug: string;
  /** `"personal"` for individual workspaces; `"org"` for team workspaces. */
  type: "personal" | "org";
  /** UUID of the user who owns this workspace. */
  owner_id: string;
  /** Optional URL to the workspace's avatar image. */
  avatar_url?: string;
  /** Optional description shown on the workspace settings page. */
  description?: string;
  /** Content categories currently enabled on this workspace. */
  categories: Category[];
}

/** A user's membership record within a workspace. */
export interface WorkspaceMember {
  /** UUID of the membership record. */
  id: string;
  /** UUID of the workspace this membership belongs to. */
  workspace_id: string;
  /** UUID of the member user. */
  user_id: string;
  /** The member's access level within the workspace. */
  role: "owner" | "admin" | "editor" | "viewer";
  /** UUID of the user who sent the invitation, if the member was invited. */
  invited_by?: string;
}

/** Response shape from the list-workspaces endpoint. */
export interface WorkspacesResponse {
  /** Personal workspaces owned by the authenticated user. */
  personal: Workspace[];
  /** Organisation workspaces the user belongs to. */
  org: Workspace[];
}

/**
 * Fetches all available content categories from the server.
 *
 * @returns A promise that resolves to the list of global categories.
 *
 * @example
 * ```ts
 * const categories = await listCategories();
 * // [{ id: "...", slug: "screenplay", name: "Screenplay", ... }, ...]
 * ```
 */
export const listCategories = (): Promise<Category[]> =>
  apiClient<Category[]>("categories")

/**
 * Fetches the authenticated user's personal and organisation workspaces.
 *
 * @returns A promise that resolves to an object with `personal` and `org` arrays.
 * @throws {Error} When the user is not authenticated.
 *
 * @example
 * ```ts
 * const { personal, org } = await listUserWorkspaces();
 * ```
 */
export const listUserWorkspaces = (): Promise<WorkspacesResponse> =>
  apiClient<WorkspacesResponse>("workspaces")

/**
 * Creates one personal workspace per category slug provided. Typically called
 * during onboarding to seed the user's initial workspace set.
 *
 * @param _userId - Unused; the gateway derives the user from the JWT.
 * @param categorySlugs - Array of category slugs (e.g. `["screenplay", "prose"]`).
 * @returns A promise that resolves to the list of newly created workspaces.
 *
 * @example
 * ```ts
 * const { workspaces } = await createPersonalWorkspaces("", ["screenplay"]);
 * ```
 */
export const createPersonalWorkspaces = (_userId: string, categorySlugs: string[]): Promise<{ workspaces: Workspace[] }> =>
  apiClient<{ workspaces: Workspace[] }>("workspaces/personal", {
    method: "POST",
    body: { category_slugs: categorySlugs },
  })

/**
 * Creates a new organisation workspace owned by the authenticated user.
 *
 * @param data - Name, optional description, and initial category slugs.
 * @returns A promise that resolves to the newly created workspace.
 * @throws {Error} When the workspace name is already taken.
 *
 * @example
 * ```ts
 * const ws = await createOrgWorkspace({ name: "Acme Films", category_slugs: ["screenplay"] });
 * ```
 */
export const createOrgWorkspace = (data: {
  name: string
  description?: string
  category_slugs: string[]
}): Promise<Workspace> =>
  apiClient<Workspace>("workspaces/org", {
    method: "POST",
    body: data,
  })

/**
 * Fetches a single workspace by its UUID.
 *
 * @param workspaceId - UUID of the workspace to retrieve.
 * @returns A promise that resolves to the workspace.
 * @throws {Error} When the workspace does not exist.
 */
export const getWorkspace = (workspaceId: string): Promise<Workspace> =>
  apiClient<Workspace>(`workspaces/${workspaceId}`)

/**
 * Applies partial updates to a workspace's name, description, or avatar URL.
 * Only fields that are present in `data` are updated.
 *
 * @param workspaceId - UUID of the workspace to update.
 * @param data - Subset of workspace fields to change.
 * @returns A promise that resolves to the updated workspace.
 * @throws {Error} When the workspace is not found or the caller is not the owner.
 */
export const updateWorkspace = (workspaceId: string, data: {
  name?: string
  description?: string
  avatar_url?: string
}): Promise<Workspace> =>
  apiClient<Workspace>(`workspaces/${workspaceId}`, {
    method: "PATCH",
    body: data,
  })

/**
 * Permanently deletes a workspace. Only the workspace owner may call this.
 *
 * @param workspaceId - UUID of the workspace to delete.
 * @returns A promise that resolves when the deletion is complete.
 * @throws {Error} When the caller is not the owner.
 */
export const deleteWorkspace = (workspaceId: string): Promise<void> =>
  apiClient<void>(`workspaces/${workspaceId}`, { method: "DELETE" })

/**
 * Adds a content category to a workspace by its slug, making it available
 * for organising projects within that workspace.
 *
 * @param workspaceId - UUID of the workspace.
 * @param slug - Category slug to enable (e.g. `"prose"`).
 * @returns A promise that resolves to the updated workspace.
 */
export const enableCategory = (workspaceId: string, slug: string): Promise<Workspace> =>
  apiClient<Workspace>(`workspaces/${workspaceId}/categories/${slug}`, { method: "POST" })

/**
 * Removes a content category from a workspace by its slug.
 *
 * @param workspaceId - UUID of the workspace.
 * @param slug - Category slug to disable.
 * @returns A promise that resolves to the updated workspace.
 */
export const disableCategory = (workspaceId: string, slug: string): Promise<Workspace> =>
  apiClient<Workspace>(`workspaces/${workspaceId}/categories/${slug}`, { method: "DELETE" })

/**
 * Fetches all current members of a workspace.
 *
 * @param workspaceId - UUID of the workspace.
 * @returns A promise that resolves to the list of membership records.
 */
export const listMembers = (workspaceId: string): Promise<WorkspaceMember[]> =>
  apiClient<WorkspaceMember[]>(`workspaces/${workspaceId}/members`)

/**
 * Generates an invitation token for the given email address and role. The token
 * should be delivered to the invitee out-of-band (e.g. by email).
 *
 * @param workspaceId - UUID of the workspace to invite the user to.
 * @param email - Email address of the person being invited.
 * @param role - Role to assign when the invitation is accepted.
 * @returns A promise that resolves to an object containing the `invite_token`.
 *
 * @example
 * ```ts
 * const { invite_token } = await inviteMember(wsId, "bob@example.com", "editor");
 * ```
 */
export const inviteMember = (workspaceId: string, email: string, role: string): Promise<{ invite_token: string }> =>
  apiClient<{ invite_token: string }>(`workspaces/${workspaceId}/members/invite`, {
    method: "POST",
    body: { email, role },
  })

/**
 * Removes a user from a workspace. The workspace owner cannot be removed.
 *
 * @param workspaceId - UUID of the workspace.
 * @param userId - UUID of the member to remove.
 * @returns A promise that resolves when the member has been removed.
 * @throws {Error} When attempting to remove the workspace owner.
 */
export const removeMember = (workspaceId: string, userId: string): Promise<void> =>
  apiClient<void>(`workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" })

/**
 * Changes the role of an existing workspace member.
 *
 * @param workspaceId - UUID of the workspace.
 * @param userId - UUID of the member whose role should change.
 * @param role - New role to assign.
 * @returns A promise that resolves to the updated membership record.
 */
export const updateMemberRole = (workspaceId: string, userId: string, role: string): Promise<WorkspaceMember> =>
  apiClient<WorkspaceMember>(`workspaces/${workspaceId}/members/${userId}/role`, {
    method: "PATCH",
    body: { role },
  })

/**
 * Redeems an invitation token, adding the authenticated user to the workspace.
 *
 * @param token - The invitation token received out-of-band.
 * @returns A promise that resolves to the workspace the user has joined.
 * @throws {Error} When the token has expired or has already been used.
 */
export const acceptInvite = (token: string): Promise<Workspace> =>
  apiClient<Workspace>(`workspaces/invites/${token}/accept`, { method: "POST" })

/**
 * Invalidates an invitation token without adding the user to the workspace.
 *
 * @param token - The invitation token to decline.
 * @returns A promise that resolves when the token has been invalidated.
 */
export const declineInvite = (token: string): Promise<void> =>
  apiClient<void>(`workspaces/invites/${token}/decline`, { method: "POST" })
