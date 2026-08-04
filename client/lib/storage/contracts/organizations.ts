import type { Project } from "@/services/project"
import type {
  IncomingOrgInvite,
  Organization,
  OrgMember,
  OrgRole,
  OrgSeatInfo,
} from "@/services/organization"

// ─── Organizations ──────────────────────────────────────────────────────────

/** Organizations are a first-class team entity (distinct from a personal
 *  workspace) and always live on the gateway — an org is shared, multi-user
 *  tenancy with seats and invites, so there is nothing coherent to model in a
 *  single-user local database.
 *
 *  Both builds bind the same gateway-backed implementation: the desktop serves
 *  this one domain remotely while everything else stays local SQLite
 *  (ADR 0023). Because that makes orgs the only desktop domain requiring a
 *  network *and* a linked account, the `organizations` capability alone is not
 *  enough to show org UI — callers must also check {@link isAvailable}, the
 *  same two-step gate `sync` uses. */
export interface OrganizationStorage {
  /** Whether orgs can be used right now (a cloud account is linked). Always
   *  true on the web build, where the session cookie *is* the account. */
  isAvailable(): Promise<boolean>

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
  /** Set the org's seat count (owner only). Cannot drop below current members. */
  setSeats(orgId: string, seats: number): Promise<OrgSeatInfo>
  /** The projects owned by the organization (the org's shared project pool). */
  listProjects(orgId: string): Promise<Project[]>
}
