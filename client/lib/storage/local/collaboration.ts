import type { CollaborationStorage } from "@/lib/storage"
import { reject } from "./shared"

// ─── Collaboration — not supported locally ───────────────────────────────

export const collaboration: CollaborationStorage = {
  addCollaborator: () => reject("collaboration"),
  listCollaborators: async () => [],
  updateCollaboratorRole: () => reject("collaboration"),
  removeCollaborator: () => reject("collaboration"),
  addComment: () => reject("collaboration"),
  listComments: async () => [],
  updateComment: () => reject("collaboration"),
  deleteComment: async () => {
    /* no-op */
  },
  listMembers: async () => [],
  inviteMember: () => reject("collaboration"),
  removeMember: () => reject("collaboration"),
  updateMemberRole: () => reject("collaboration"),
  acceptWorkspaceInvite: () => reject("collaboration"),
  declineWorkspaceInvite: () => reject("collaboration"),
  listPendingInvitations: async () => [],
  acceptInvitation: () => reject("collaboration"),
  declineInvitation: () => reject("collaboration"),
}
