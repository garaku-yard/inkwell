import type { OrganizationStorage } from "@/lib/storage"
import { reject } from "./shared"

// ─── Organizations — hosted-only, not supported locally ──────────────────────
// The desktop build is personal/local-first; orgs require the hosted backend.
// `list` returns empty so the rail simply shows no org zone instead of erroring.

export const organizations: OrganizationStorage = {
  list: async () => [],
  get: () => reject("organizations"),
  create: () => reject("organizations"),
  update: () => reject("organizations"),
  delete: () => reject("organizations"),
  listMembers: async () => [],
  invite: () => reject("organizations"),
  updateMemberRole: () => reject("organizations"),
  removeMember: () => reject("organizations"),
  acceptInvite: () => reject("organizations"),
  declineInvite: () => reject("organizations"),
  seats: async () => 0,
  listProjects: async () => [],
}
