import type { Project } from "@/services/project"
import type {
  IncomingOrgInvite,
  Organization,
  OrgMember,
  OrgRole,
  OrgSeatInfo,
} from "@/services/organization"

// ─── Organizations ──────────────────────────────────────────────────────────

/** Organizations are a hosted-only, first-class team entity (distinct from a
 *  personal workspace). The local/desktop build rejects every method with
 *  NotSupportedError — the UI gates the org rail on the `organizations`
 *  capability. */
export interface OrganizationStorage {
  list(): Promise<Organization[]>
  get(orgId: string): Promise<Organization>
  create(input: { name: string; description?: string }): Promise<Organization>
  update(orgId: string, patch: { name?: string; description?: string; avatar_url?: string }): Promise<Organization>
  delete(orgId: string): Promise<void>

  listMembers(orgId: string): Promise<OrgMember[]>
  /** `target` accepts a plain email, an `@username`, or a `username#tag`. */
  invite(orgId: string, target: string, role: OrgRole): Promise<{ invite_token: string }>
  updateMemberRole(orgId: string, userId: string, role: OrgRole): Promise<OrgMember>
  removeMember(orgId: string, userId: string): Promise<void>
  acceptInvite(token: string): Promise<Organization>
  declineInvite(token: string): Promise<void>
  /** Pending org invitations addressed to the current user. */
  listIncomingInvites(): Promise<IncomingOrgInvite[]>

  seats(orgId: string): Promise<OrgSeatInfo>
  /** The projects owned by the organization (the org's shared project pool). */
  listProjects(orgId: string): Promise<Project[]>
}
