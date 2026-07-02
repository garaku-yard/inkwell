import { apiClient } from "@/lib/api"
import { type CollaboratorRole } from "@/models/constants/collaboratorRoles"

import type {
  CollaborationStorage,
  Invitation,
  ProjectCollaborator,
  Workspace,
  WorkspaceMember,
} from "@/lib/storage"
import { projectsHelpers } from "./shared"

// ─── Collaboration ────────────────────────────────────────────────────────

export const collaboration: CollaborationStorage = {
  addCollaborator: async (projectId, email, role) => {
    const response = await apiClient<{
      id: string
      user_id: string
      role: string
      status: string
      invited_at: string
      joined_at?: string
    }>("collaborators", {
      method: "POST",
      body: { project_id: projectId, email, role },
    })
    const collab: ProjectCollaborator = {
      id: response.id,
      name: email.split("@")[0],
      email,
      usernameWithTag: email,
      role: response.role as CollaboratorRole,
      status: response.status === "active" ? "active" : "pending",
      joinedAt: response.joined_at || response.invited_at,
      userId: response.user_id,
    }
    return collab
  },

  listCollaborators: async (projectId) => {
    const rows = await apiClient<Array<{
      id: string
      user_id: string
      name?: string
      email?: string
      username_with_tag?: string
      role: string
      status: string
      invited_at: string
      joined_at?: string
    }>>(`collaborators?project_id=${projectId}`, { method: "GET" })
    return rows.map((r) => ({
      id: r.id,
      email: (r.email || "").trim() || `user-${r.user_id.slice(0, 8)}@example.com`,
      name: (r.name || "").trim() || (r.email ? r.email.split("@")[0] : `User ${r.user_id.slice(0, 8)}`),
      usernameWithTag: (r.username_with_tag || "").trim() || (r.email ? r.email.split("@")[0] : `user-${r.user_id.slice(0, 8)}`),
      role: r.role as CollaboratorRole,
      status: r.status === "active" ? "active" : "pending",
      joinedAt: r.joined_at || r.invited_at,
      userId: r.user_id,
    }))
  },

  getEditSessions: async (projectId) => {
    const rows = await apiClient<Array<{
      session_id: string
      user_id: string
      name?: string
      element_id?: string
      last_activity: string
    }>>(`projects/${projectId}/edit-sessions`, { method: "GET" })
    return rows.map((r) => ({
      sessionId: r.session_id,
      userId: r.user_id,
      name: (r.name || "").trim() || `User ${r.user_id.slice(0, 8)}`,
      elementId: r.element_id || "",
      lastActivity: r.last_activity,
    }))
  },

  updateCollaboratorRole: async (collaboratorId, role) => {
    const response = await apiClient<{
      id: string
      user_id: string
      role: string
      status: string
      invited_at: string
      joined_at?: string
    }>(`collaborators/${collaboratorId}`, { method: "PATCH", body: { role } })
    return {
      id: response.id,
      name: `User ${response.user_id.slice(0, 8)}`,
      email: `user-${response.user_id.slice(0, 8)}@example.com`,
      usernameWithTag: `user-${response.user_id.slice(0, 8)}`,
      role: response.role as CollaboratorRole,
      status: response.status === "active" ? "active" : "pending",
      joinedAt: response.joined_at || response.invited_at,
      userId: response.user_id,
    }
  },

  removeCollaborator: async (collaboratorId) => {
    await apiClient(`collaborators/${collaboratorId}`, { method: "DELETE" })
  },

  addComment: async (input) => {
    const response = await apiClient<{
      id: string
      user_id: string
      username: string
      content: string
      is_resolved: boolean
      created_at: string
    }>("comments", {
      method: "POST",
      body: {
        project_id: input.projectId,
        screenplay_id: input.screenplayId,
        content: input.content,
        line_number: input.lineNumber,
        char_position: 0,
        script_element_id: input.scriptElementId,
        scene_id: input.sceneId,
        parent_id: input.parentId,
      },
    })
    return {
      id: response.id,
      userName: response.username,
      content: response.content,
      timestamp: response.created_at,
      isResolved: response.is_resolved,
    }
  },

  listComments: (screenplayId) => projectsHelpers.listCommentArray(screenplayId),

  updateComment: async (commentId, patch) => {
    const body: { content?: string; is_resolved?: boolean } = {}
    if (patch.content !== undefined) body.content = patch.content
    if (patch.isResolved !== undefined) body.is_resolved = patch.isResolved
    const response = await apiClient<{
      id: string
      user_id: string
      content: string
      is_resolved: boolean
      created_at: string
    }>(`comments/${commentId}`, { method: "PATCH", body })
    return {
      id: response.id,
      userName: `User ${response.user_id.slice(0, 8)}`,
      content: response.content,
      timestamp: response.created_at,
      isResolved: response.is_resolved,
    }
  },

  deleteComment: async (commentId) => {
    await apiClient(`comments/${commentId}`, { method: "DELETE" })
  },

  listMembers: (workspaceId) =>
    apiClient<WorkspaceMember[]>(`workspaces/${workspaceId}/members`),

  inviteMember: (workspaceId, target, role) =>
    apiClient<{ invite_token: string }>(`workspaces/${workspaceId}/members/invite`, {
      method: "POST",
      body: { target, role },
    }),

  removeMember: async (workspaceId, userId) => {
    await apiClient<void>(`workspaces/${workspaceId}/members/${userId}`, {
      method: "DELETE",
    })
  },

  updateMemberRole: (workspaceId, userId, role) =>
    apiClient<WorkspaceMember>(`workspaces/${workspaceId}/members/${userId}/role`, {
      method: "PATCH",
      body: { role },
    }),

  acceptWorkspaceInvite: (token) =>
    apiClient<Workspace>(`workspaces/invites/${token}/accept`, { method: "POST" }),
  declineWorkspaceInvite: async (token) => {
    await apiClient<void>(`workspaces/invites/${token}/decline`, { method: "POST" })
  },

  listPendingInvitations: () => apiClient<Invitation[]>("invitations"),

  acceptInvitation: async (invitationId) => {
    await apiClient<void>("invitations/accept", {
      method: "POST",
      body: { id: invitationId },
    })
  },

  declineInvitation: async (invitationId) => {
    await apiClient<void>("invitations/decline", {
      method: "POST",
      body: { id: invitationId },
    })
  },
}
