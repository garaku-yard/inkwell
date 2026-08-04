/** Organization service — thin wrappers around the Storage abstraction.
 *
 * Organizations are the hosted, GitHub-style team entity: one login, members
 * connected by role, a shared pool of org-owned projects. Distinct from a
 * personal workspace (which is a per-user category-filter bundle). */
import { getStorage } from "@/lib/storage"
import type { Project } from "@/services/project"

export type OrgRole = "owner" | "admin" | "editor" | "viewer"

export interface Organization {
  id: string
  name: string
  slug: string
  owner_id: string
  avatar_url?: string
  description?: string
  /** The requesting user's role in this org, when known (list/get). */
  member_role?: OrgRole
}

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
  invited_by?: string
  /** Identity-resolved display fields (gateway-enriched). Absent if the
   *  identity lookup failed. */
  name?: string
  email?: string
  avatar_url?: string
}

/** Org seat usage: members in use + pending invites (which also hold a seat),
 *  against the total purchased. */
export interface OrgSeatInfo {
  members: number
  pending: number
  total: number
}

/** A pending org invitation addressed to the current user. */
export interface IncomingOrgInvite {
  token: string
  org_id: string
  org_name: string
  role: OrgRole
}

/** Whether orgs can be used right now. Always true on the web build; on the
 *  desktop it additionally requires a linked cloud account, since orgs are the
 *  one desktop domain served by the gateway (ADR 0023). Check this alongside
 *  the `organizations` capability before showing any org affordance. */
export const isOrgAvailable = (): Promise<boolean> =>
  getStorage().organizations.isAvailable()

/** Lists every organization the authenticated user belongs to. */
export const listOrganizations = (): Promise<Organization[]> =>
  getStorage().organizations.list()

export const getOrganization = (orgId: string): Promise<Organization> =>
  getStorage().organizations.get(orgId)

export const createOrganization = (input: { name: string; description?: string }): Promise<Organization> =>
  getStorage().organizations.create(input)

export const updateOrganization = (
  orgId: string,
  patch: { name?: string; description?: string; avatar_url?: string },
): Promise<Organization> => getStorage().organizations.update(orgId, patch)

export const deleteOrganization = (orgId: string): Promise<void> =>
  getStorage().organizations.delete(orgId)

export const listOrgMembers = (orgId: string): Promise<OrgMember[]> =>
  getStorage().organizations.listMembers(orgId)

export const inviteOrgMember = (
  orgId: string,
  target: string,
  role: OrgRole,
): Promise<{ invite_token: string }> => getStorage().organizations.invite(orgId, target, role)

export const updateOrgMemberRole = (
  orgId: string,
  userId: string,
  role: OrgRole,
): Promise<OrgMember> => getStorage().organizations.updateMemberRole(orgId, userId, role)

export const removeOrgMember = (orgId: string, userId: string): Promise<void> =>
  getStorage().organizations.removeMember(orgId, userId)

export const acceptOrgInvite = (token: string): Promise<Organization> =>
  getStorage().organizations.acceptInvite(token)

export const declineOrgInvite = (token: string): Promise<void> =>
  getStorage().organizations.declineInvite(token)

export const getOrgSeats = (orgId: string): Promise<OrgSeatInfo> =>
  getStorage().organizations.seats(orgId)

export const setOrgSeats = (orgId: string, seats: number): Promise<OrgSeatInfo> =>
  getStorage().organizations.setSeats(orgId, seats)

export const listIncomingOrgInvites = (): Promise<IncomingOrgInvite[]> =>
  getStorage().organizations.listIncomingInvites()

export const listOrgProjects = (orgId: string): Promise<Project[]> =>
  getStorage().organizations.listProjects(orgId)
