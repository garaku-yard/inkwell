/** Invites service — fetch, accept, and decline project collaboration invitations. */
import { apiClient } from "@/lib/api";

/** A pending collaboration invitation sent to the current user. */
export interface Invitation {
  /** UUID of the invitation record. */
  id: string;
  /** UUID of the project the user is being invited to. */
  projectId: string;
  /** Display title of the project. */
  projectName: string;
  /** Username or email of the person who sent the invitation. */
  invitedBy: string;
  /** ISO 8601 timestamp of when the invitation was created. */
  createdAt: string;
  /** Role that will be granted on acceptance (e.g. `"editor"`, `"viewer"`). */
  role?: string;
  /** Current lifecycle state of the invitation. */
  status?: string;
}

/**
 * Fetches all pending invitations for the authenticated user. Invitations that
 * have been accepted or declined are excluded.
 *
 * @returns A promise that resolves to the list of pending invitations.
 * @throws {Error} When the user is not authenticated.
 *
 * @example
 * ```ts
 * const invites = await getPendingInvites();
 * console.log(`You have ${invites.length} pending invitation(s).`);
 * ```
 */
export const getPendingInvites = (): Promise<Invitation[]> => {
  return apiClient<Invitation[]>("invitations");
};

/**
 * Accepts a pending invitation, granting the authenticated user access to the
 * project with the role specified in the invitation.
 *
 * @param invitationId - UUID of the invitation to accept.
 * @returns A promise that resolves when the invitation has been accepted.
 * @throws {Error} When the invitation has already been accepted or declined.
 */
export const acceptInvite = (invitationId: string): Promise<void> => {
  return apiClient<void>("invitations/accept", {
    method: "POST",
    body: { id: invitationId },
  });
};

/**
 * Declines a pending invitation without joining the project.
 *
 * @param invitationId - UUID of the invitation to decline.
 * @returns A promise that resolves when the invitation has been declined.
 */
export const declineInvite = (invitationId: string): Promise<void> => {
  return apiClient<void>("invitations/decline", {
    method: "POST",
    body: { id: invitationId },
  });
};
