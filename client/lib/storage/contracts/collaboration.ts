import type { Comment, ProjectCollaborator } from "@/services/project"
import type { WorkspaceMember, Workspace } from "@/services/workspace"
import type { Invitation } from "@/services/invites"

// ─── Collaboration (collaborators, invites, comments) ─────────────────────

export interface CollaborationStorage {
  // Project-level collaborators
  addCollaborator(projectId: string, email: string, role: string): Promise<ProjectCollaborator>
  listCollaborators(projectId: string): Promise<ProjectCollaborator[]>
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
