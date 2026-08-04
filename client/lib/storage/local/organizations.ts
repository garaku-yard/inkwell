import { getAuthToken } from "@/lib/api"

import type { OrganizationStorage } from "@/lib/storage"
import { UnauthenticatedError } from "../errors"
import { organizations as gatewayOrganizations } from "../remote/organizations"

// ─── Organizations — the one domain the desktop serves remotely ──────────────
// An org is shared, multi-user tenancy (members, seats, invites); there is
// nothing coherent to model in a single-user local database, so the desktop
// binds the *gateway* implementation here instead of a SQLite one. This is the
// single deliberate exception to "Tauri binds local/" (ADR 0023) — every other
// domain in this folder is still pure local SQLite.
//
// The transport is already in place: `initDesktopAuth()` marks the HTTP client
// native, applies the stored gateway URL and reloads the keychain bearer token
// before this module is ever imported, so `apiClient` calls authenticate the
// same way the desktop's own login/sync calls do.
//
// Everything is gated on a linked account, because the desktop is usable — and
// commonly used — signed out:
//
//   * **Reads degrade to empty.** The rail lists orgs on every boot; without
//     this guard an unlinked desktop would fire an unauthenticated request each
//     time and render an error where it used to render nothing. Empty results
//     keep the pre-ADR-0023 behaviour ("no org zone") for signed-out users.
//   * **Writes refuse locally** with UnauthenticatedError rather than sending a
//     request that can only 401. These are defensive: the UI gates the
//     affordances on `isAvailable` first, so a user should never reach them.

const linked = (): boolean => getAuthToken() !== null

export const organizations: OrganizationStorage = {
  isAvailable: async () => linked(),

  // Reads — safe empties when there is no linked account.
  list: async () => (linked() ? gatewayOrganizations.list() : []),
  listMembers: async (orgId) => (linked() ? gatewayOrganizations.listMembers(orgId) : []),
  listIncomingInvites: async () => (linked() ? gatewayOrganizations.listIncomingInvites() : []),
  listProjects: async (orgId) => (linked() ? gatewayOrganizations.listProjects(orgId) : []),
  seats: async (orgId) =>
    linked() ? gatewayOrganizations.seats(orgId) : { members: 0, pending: 0, total: 0 },

  // Reads that identify a specific org — no meaningful empty value.
  get: async (orgId) => {
    if (!linked()) throw new UnauthenticatedError()
    return gatewayOrganizations.get(orgId)
  },

  // Writes.
  create: async (input) => {
    if (!linked()) throw new UnauthenticatedError()
    return gatewayOrganizations.create(input)
  },
  update: async (orgId, patch) => {
    if (!linked()) throw new UnauthenticatedError()
    return gatewayOrganizations.update(orgId, patch)
  },
  delete: async (orgId) => {
    if (!linked()) throw new UnauthenticatedError()
    return gatewayOrganizations.delete(orgId)
  },
  invite: async (orgId, target, role) => {
    if (!linked()) throw new UnauthenticatedError()
    return gatewayOrganizations.invite(orgId, target, role)
  },
  updateMemberRole: async (orgId, userId, role) => {
    if (!linked()) throw new UnauthenticatedError()
    return gatewayOrganizations.updateMemberRole(orgId, userId, role)
  },
  removeMember: async (orgId, userId) => {
    if (!linked()) throw new UnauthenticatedError()
    return gatewayOrganizations.removeMember(orgId, userId)
  },
  acceptInvite: async (token) => {
    if (!linked()) throw new UnauthenticatedError()
    return gatewayOrganizations.acceptInvite(token)
  },
  declineInvite: async (token) => {
    if (!linked()) throw new UnauthenticatedError()
    return gatewayOrganizations.declineInvite(token)
  },
  setSeats: async (orgId, seats) => {
    if (!linked()) throw new UnauthenticatedError()
    return gatewayOrganizations.setSeats(orgId, seats)
  },
}
