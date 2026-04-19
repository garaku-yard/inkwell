/** Invites service — pending collaboration invitations. Thin wrappers over
 *  the Storage abstraction. */
import { getStorage } from "@/lib/storage"

export interface Invitation {
  id: string
  projectId: string
  projectName: string
  invitedBy: string
  createdAt: string
  role?: string
  status?: string
}

export const getPendingInvites = (): Promise<Invitation[]> =>
  getStorage().collaboration.listPendingInvitations()

export const acceptInvite = (invitationId: string): Promise<void> =>
  getStorage().collaboration.acceptInvitation(invitationId)

export const declineInvite = (invitationId: string): Promise<void> =>
  getStorage().collaboration.declineInvitation(invitationId)
