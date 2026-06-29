import { apiClient } from "@/lib/api"

import type { OrganizationStorage } from "@/lib/storage"
import type {
  IncomingOrgInvite,
  Organization,
  OrgMember,
  OrgRole,
  OrgSeatInfo,
} from "@/services/organization"
import type { Project } from "@/services/project"

// ─── Organizations ──────────────────────────────────────────────────────────

/** The gateway serialises org responses with proto3 JSON, which renders an
 *  empty repeated field as `null` rather than `[]`. The list endpoints coerce
 *  to `[]` at this boundary so callers never trip over a null array (same class
 *  of bug as the empty-categories crash). */
export const organizations: OrganizationStorage = {
  list: async () => (await apiClient<Organization[] | null>("organizations")) ?? [],
  get: (orgId) => apiClient<Organization>(`organizations/${orgId}`),
  create: (input) =>
    apiClient<Organization>("organizations", { method: "POST", body: input }),
  update: (orgId, patch) =>
    apiClient<Organization>(`organizations/${orgId}`, { method: "PATCH", body: patch }),
  delete: async (orgId) => {
    await apiClient<void>(`organizations/${orgId}`, { method: "DELETE" })
  },

  listMembers: async (orgId) => (await apiClient<OrgMember[] | null>(`organizations/${orgId}/members`)) ?? [],
  invite: (orgId, target, role: OrgRole) =>
    apiClient<{ invite_token: string }>(`organizations/${orgId}/members/invite`, {
      method: "POST",
      body: { target, role },
    }),
  updateMemberRole: (orgId, userId, role: OrgRole) =>
    apiClient<OrgMember>(`organizations/${orgId}/members/${userId}/role`, {
      method: "PATCH",
      body: { role },
    }),
  removeMember: async (orgId, userId) => {
    await apiClient<void>(`organizations/${orgId}/members/${userId}`, { method: "DELETE" })
  },
  acceptInvite: (token) =>
    apiClient<Organization>(`organizations/invites/${token}/accept`, { method: "POST" }),
  declineInvite: async (token) => {
    await apiClient<void>(`organizations/invites/${token}/decline`, { method: "POST" })
  },
  listIncomingInvites: async () =>
    (await apiClient<IncomingOrgInvite[] | null>("organizations/invites/incoming")) ?? [],

  seats: (orgId) => apiClient<OrgSeatInfo>(`organizations/${orgId}/seats`),
  listProjects: async (orgId) => {
    const res = await apiClient<{ projects: Project[] }>(`organizations/${orgId}/projects`)
    return res.projects ?? []
  },
}
