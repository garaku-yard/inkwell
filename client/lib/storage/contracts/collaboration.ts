import type { Comment, ProjectCollaborator } from "@/services/project"
import type { WorkspaceMember, Workspace } from "@/services/workspace"
import type { Invitation } from "@/services/invites"

// ─── Collaboration (collaborators, invites, comments) ─────────────────────

/**
 * A durable advisory edit lock: a persisted record that a user has a project
 * open for editing, and which element they are currently focused on. Unlike the
 * live presence roster (which lives only for the length of a WebSocket
 * connection), this survives a reconnect or a gateway restart, so the client can
 * seed soft-lock markers on open and keep showing an editor across a brief blip.
 */
export interface DurableEditSession {
  /** The edit-session row id. */
  sessionId: string
  /** The account that holds the session. */
  userId: string
  /** Display name (full name, falling back to username). */
  name: string
  /** The element the user is focused on, or "" when idle. */
  elementId: string
  /** ISO timestamp of the session's last heartbeat. */
  lastActivity: string
}

export interface CollaborationStorage {
  // Project-level collaborators
  addCollaborator(projectId: string, email: string, role: string): Promise<ProjectCollaborator>
  listCollaborators(projectId: string): Promise<ProjectCollaborator[]>

  /**
   * Durable advisory edit locks for a project — persisted "who has this open,
   * and where". Returns an empty list on builds without the realtime capability
   * (desktop), where editing is local-only.
   */
  getEditSessions(projectId: string): Promise<DurableEditSession[]>

  updateCollaboratorRole(collaboratorId: string, role: string): Promise<ProjectCollaborator>
  removeCollaborator(collaboratorId: string): Promise<void>

  // Comments
  addComment(input: {
    projectId: string
    screenplayId: string
    content: string
    lineNumber: number
    scriptElementId?: string
    sceneId?: string
    parentId?: string
  }): Promise<Comment>
  listComments(screenplayId: string): Promise<Comment[]>
  updateComment(commentId: string, patch: { content?: string; isResolved?: boolean }): Promise<Comment>
  deleteComment(commentId: string): Promise<void>

  // Workspace members
  listMembers(workspaceId: string): Promise<WorkspaceMember[]>
  inviteMember(workspaceId: string, target: string, role: string): Promise<{ invite_token: string }>
  removeMember(workspaceId: string, userId: string): Promise<void>
  updateMemberRole(workspaceId: string, userId: string, role: string): Promise<WorkspaceMember>

  // Workspace invites
  acceptWorkspaceInvite(token: string): Promise<Workspace>
  declineWorkspaceInvite(token: string): Promise<void>

  // Generic project-invite inbox
  listPendingInvitations(): Promise<Invitation[]>
  acceptInvitation(invitationId: string): Promise<void>
  declineInvitation(invitationId: string): Promise<void>
}
