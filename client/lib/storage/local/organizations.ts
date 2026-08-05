import { getAuthToken } from "@/lib/api"

import type { Organization } from "@/services/organization"
import type { OrganizationStorage } from "@/lib/storage"
import { StorageError } from "../errors"
import { organizations as gatewayOrganizations } from "../remote/organizations"
import {
  ensureUserProfile,
  getDb,
  newId,
  now,
  toProject,
  type ProjectRow,
  type WorkspaceRow,
} from "./shared"

// ─── Organizations — local first, extended by an account ─────────────────────
// An org is a local object that a cloud account can extend, not a remote object
// the desktop borrows (ADR 0026, amending 0023). Signed out, the desktop serves
// orgs from its own SQLite so the writer can group their work without a server;
// signed in, the account's remote orgs appear alongside them and 0023's gateway
// path is untouched.
//
// Local orgs are the org workspace rows that already existed
// (`workspaces.type = 'org'`), so there is no second table and no migration: an
// org's id *is* its workspace id, which is what `projects.org_id` already points
// at (ADR 0024). Membership is the one part that genuinely needs a server —
// inviting, roles, seats — and on a local org those refuse with a reason.

/** Membership operations a single-device org cannot honour.
 *
 *  A plain StorageError, not NotSupportedError: the build supports invites
 *  perfectly well for an org that came from an account — it is *this* org that
 *  has nowhere to send one. NotSupportedError also wraps its argument as a
 *  feature name, and this text reaches the org UI verbatim. */
const LOCAL_ORG_IS_SOLO =
  "This organisation lives on this device. Sign in to an Inkwell account to " +
  "invite people or manage seats."

const linked = (): boolean => getAuthToken() !== null

function toOrganization(row: WorkspaceRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    owner_id: row.owner_id,
    avatar_url: row.avatar_url ?? undefined,
    description: row.description ?? undefined,
    // The only member, by construction.
    member_role: "owner",
  }
}

async function localOrgRows(): Promise<WorkspaceRow[]> {
  const db = await getDb()
  return db.select<WorkspaceRow[]>(
    "SELECT * FROM workspaces WHERE type = 'org' ORDER BY name",
  )
}

async function localOrg(orgId: string): Promise<WorkspaceRow | null> {
  const db = await getDb()
  const rows = await db.select<WorkspaceRow[]>(
    "SELECT * FROM workspaces WHERE id = ? AND type = 'org'",
    [orgId],
  )
  return rows[0] ?? null
}

/** Whether this id names an org held on this device. Every write consults it
 *  first: the same call routes locally or to the gateway depending on which
 *  kind of org it names, and deciding from the sign-in state alone would send
 *  a local org's rename to a server that has never heard of it. */
async function isLocal(orgId: string): Promise<boolean> {
  return (await localOrg(orgId)) !== null
}

export const organizations: OrganizationStorage = {
  // Orgs are always usable now: without an account they are local, with one
  // they are both. The UI gates its org affordances on this.
  isAvailable: async () => true,

  // Local orgs always; the account's remote ones as well when linked. A remote
  // failure is swallowed so an unreachable gateway can't blank the rail of orgs
  // that live on this disk.
  list: async () => {
    const local = (await localOrgRows()).map(toOrganization)
    if (!linked()) return local
    const remote = await gatewayOrganizations.list().catch(() => [] as Organization[])
    return [...local, ...remote]
  },

  get: async (orgId) => {
    const row = await localOrg(orgId)
    if (row) return toOrganization(row)
    return gatewayOrganizations.get(orgId)
  },

  // Signed out this makes a local org; signed in the gateway still makes a real
  // one, so linking an account doesn't silently change what "create" means.
  create: async (input) => {
    if (linked()) return gatewayOrganizations.create(input)

    const me = await ensureUserProfile()
    const db = await getDb()
    const id = newId()
    const ts = now()
    const slug = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
    await db.execute(
      `INSERT INTO workspaces (id, name, slug, type, owner_id, avatar_url, description, categories_json, created_at, updated_at)
       VALUES (?, ?, ?, 'org', ?, NULL, ?, ?, ?, ?)`,
      // No categories: an org is a flat pool spanning every format, which is
      // what the dashboard already assumes in org context.
      [id, input.name, slug, me.id, input.description ?? null, "[]", ts, ts],
    )
    const row = await localOrg(id)
    if (!row) throw new Error("Could not create the organisation.")
    return toOrganization(row)
  },

  update: async (orgId, patch) => {
    if (!(await isLocal(orgId))) return gatewayOrganizations.update(orgId, patch)
    const db = await getDb()
    await db.execute(
      `UPDATE workspaces
          SET name = COALESCE(?, name),
              description = COALESCE(?, description),
              avatar_url = COALESCE(?, avatar_url),
              updated_at = ?
        WHERE id = ?`,
      [patch.name ?? null, patch.description ?? null, patch.avatar_url ?? null, now(), orgId],
    )
    const row = await localOrg(orgId)
    if (!row) throw new Error(`Organisation ${orgId} not found.`)
    return toOrganization(row)
  },

  // Deleting the org leaves its projects on disk, un-orged, rather than taking
  // the writing with it. They rejoin the personal lists, which is recoverable;
  // deleting them would not be.
  delete: async (orgId) => {
    if (!(await isLocal(orgId))) return gatewayOrganizations.delete(orgId)
    const db = await getDb()
    await db.execute("UPDATE projects SET org_id = NULL, updated_at = ? WHERE org_id = ?", [
      now(),
      orgId,
    ])
    await db.execute("DELETE FROM workspaces WHERE id = ? AND type = 'org'", [orgId])
  },

  // Read from this disk, not the gateway (ADR 0024). An org project is created
  // and edited locally like any other, so the org's pool *on this device* is
  // exactly the local rows carrying its id — and it must work signed out and
  // offline, same as the rest of the desktop. Projects other members created
  // appear once sync carries them down; that is sync's job, not this call's.
  listProjects: async (orgId) => {
    const db = await getDb()
    const rows = await db.select<ProjectRow[]>(
      "SELECT * FROM projects WHERE deleted_at IS NULL AND org_id = ? ORDER BY updated_at DESC",
      [orgId],
    )
    return rows.map(toProject)
  },

  // A local org has exactly one member: the person at this keyboard.
  listMembers: async (orgId) => {
    if (!(await isLocal(orgId))) {
      return linked() ? gatewayOrganizations.listMembers(orgId) : []
    }
    const me = await ensureUserProfile()
    return [
      {
        id: me.id,
        org_id: orgId,
        user_id: me.id,
        role: "owner" as const,
        name: me.name,
        email: me.email,
      },
    ]
  },

  seats: async (orgId) => {
    if (await isLocal(orgId)) return { members: 1, pending: 0, total: 1 }
    return linked()
      ? gatewayOrganizations.seats(orgId)
      : { members: 0, pending: 0, total: 0 }
  },

  // Invitations are addressed to an account, so there are none without one.
  listIncomingInvites: async () =>
    linked() ? gatewayOrganizations.listIncomingInvites() : [],

  // ── Membership: the part that genuinely needs a server ────────────────────
  // On a local org these refuse with a reason instead of pretending. 0023's
  // gateway path is unchanged for orgs that came from an account.

  invite: async (orgId, target, role) => {
    if (await isLocal(orgId)) throw new StorageError(LOCAL_ORG_IS_SOLO)
    return gatewayOrganizations.invite(orgId, target, role)
  },
  updateMemberRole: async (orgId, userId, role) => {
    if (await isLocal(orgId)) throw new StorageError(LOCAL_ORG_IS_SOLO)
    return gatewayOrganizations.updateMemberRole(orgId, userId, role)
  },
  removeMember: async (orgId, userId) => {
    if (await isLocal(orgId)) throw new StorageError(LOCAL_ORG_IS_SOLO)
    return gatewayOrganizations.removeMember(orgId, userId)
  },
  setSeats: async (orgId, seats) => {
    if (await isLocal(orgId)) throw new StorageError(LOCAL_ORG_IS_SOLO)
    return gatewayOrganizations.setSeats(orgId, seats)
  },

  // Accepting an invitation is inherently an account action — there is no local
  // org to route it to, so these stay gateway-only.
  acceptInvite: async (token) => gatewayOrganizations.acceptInvite(token),
  declineInvite: async (token) => gatewayOrganizations.declineInvite(token),
}
