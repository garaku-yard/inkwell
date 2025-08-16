import { apiClient } from "@/lib/api";

export interface Invitation {
  projectId: string;
  projectName: string;
  invitedBy: string;
  createdAt: string;
}

/**
 * Fetches all pending invitations for the current user.
 */
export const getPendingInvites = (): Promise<Invitation[]> => {
  return apiClient<Invitation[]>("invitations");
};

/**
 * Responds to a pending invitation.
 * @param projectId The ID of the project for the invitation.
 * @param accepted True to accept the invitation, false to decline.
 */
export const respondToInvite = (projectId: string, accepted: boolean): Promise<void> => {
  return apiClient<void>(`invitations/${projectId}`, {
    method: "PATCH",
    body: { accepted },
  });
};
