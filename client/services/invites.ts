/** Invites service — fetch, accept, and decline project collaboration invitations. */
import { apiClient } from "@/lib/api";

export interface Invitation {
  id: string;
  projectId: string;
  projectName: string;
  invitedBy: string;
  createdAt: string;
  role?: string;
  status?: string;
}

/**
 * Fetches all pending invitations for the current user.
 */
export const getPendingInvites = (): Promise<Invitation[]> => {
  return apiClient<Invitation[]>("invitations");
};

/**
 * Accepts a pending invitation by its invitation ID.
 */
export const acceptInvite = (invitationId: string): Promise<void> => {
  return apiClient<void>("invitations/accept", {
    method: "POST",
    body: { id: invitationId },
  });
};

/**
 * Declines a pending invitation by its invitation ID.
 */
export const declineInvite = (invitationId: string): Promise<void> => {
  return apiClient<void>("invitations/decline", {
    method: "POST",
    body: { id: invitationId },
  });
};
