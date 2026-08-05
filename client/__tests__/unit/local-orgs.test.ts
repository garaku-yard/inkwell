import { describe, expect, it, vi, beforeEach } from "vitest"

/**
 * Local organizations (ADR 0026). The risk this covers is routing: one call
 * has to reach SQLite or the gateway depending on which kind of org it names,
 * and a wrong guess sends a local org's rename to a server that has never
 * heard of it.
 */
const h = vi.hoisted(() => ({
  token: null as string | null,
  rows: [] as Array<Record<string, unknown>>,
  projectRows: [] as Array<Record<string, unknown>>,
  execute: vi.fn(),
  gateway: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    invite: vi.fn(),
    listMembers: vi.fn(),
    seats: vi.fn(),
    setSeats: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
    acceptInvite: vi.fn(),
    declineInvite: vi.fn(),
    listIncomingInvites: vi.fn(),
  },
}))

vi.mock("@/lib/api", () => ({ getAuthToken: () => h.token }))

vi.mock("@/lib/storage/remote/organizations", () => ({ organizations: h.gateway }))

vi.mock("@/lib/storage/local/shared", () => ({
  newId: () => "new-org",
  now: () => "2026-08-05T00:00:00.000Z",
  ensureUserProfile: async () => ({
    id: "local-user",
    name: "Writer",
    email: "you@inkwell.local",
  }),
  toProject: (row: Record<string, unknown>) => row,
  getDb: async () => ({
    select: async (sql: string) => {
      if (sql.includes("FROM projects")) return h.projectRows
      if (sql.includes("id = ?") && sql.includes("type = 'org'")) return h.rows.slice(0, 1)
      return h.rows
    },
    execute: h.execute,
  }),
}))

import { organizations } from "@/lib/storage/local/organizations"

const orgRow = {
  id: "local-1",
  name: "Garaku Yard",
  slug: "garaku-yard",
  type: "org",
  owner_id: "local-user",
  avatar_url: null,
  description: "mine",
  categories_json: "[]",
}

beforeEach(() => {
  h.token = null
  h.rows = []
  h.projectRows = []
  h.execute.mockReset().mockResolvedValue({ rowsAffected: 1 })
  for (const fn of Object.values(h.gateway)) fn.mockReset()
})

describe("signed out", () => {
  it("offers orgs at all — the point of 0026", async () => {
    await expect(organizations.isAvailable()).resolves.toBe(true)
  })

  it("lists the orgs held on this device without touching the gateway", async () => {
    h.rows = [orgRow]
    const list = await organizations.list()
    expect(list).toEqual([
      expect.objectContaining({ id: "local-1", name: "Garaku Yard", member_role: "owner" }),
    ])
    expect(h.gateway.list).not.toHaveBeenCalled()
  })

  it("creates the org locally instead of refusing", async () => {
    h.rows = [orgRow]
    const created = await organizations.create({ name: "Garaku Yard" })
    expect(h.gateway.create).not.toHaveBeenCalled()
    expect(created.id).toBe("local-1")
    const [sql, args] = h.execute.mock.calls[0]
    expect(sql).toContain("INSERT INTO workspaces")
    expect(args).toContain("garaku-yard")
  })

  it("reports the writer as the org's sole owner", async () => {
    h.rows = [orgRow]
    const members = await organizations.listMembers("local-1")
    expect(members).toEqual([expect.objectContaining({ user_id: "local-user", role: "owner" })])
    await expect(organizations.seats("local-1")).resolves.toEqual({
      members: 1,
      pending: 0,
      total: 1,
    })
  })

  it("refuses to invite into a local org, with a reason", async () => {
    h.rows = [orgRow]
    await expect(organizations.invite("local-1", "someone@example.com", "editor")).rejects.toThrow(
      /lives on this device/,
    )
    expect(h.gateway.invite).not.toHaveBeenCalled()
  })

  it("frees the org's projects rather than deleting the writing with it", async () => {
    h.rows = [orgRow]
    await organizations.delete("local-1")
    const statements = h.execute.mock.calls.map(([sql]) => sql as string)
    expect(statements.some((s) => s.includes("UPDATE projects SET org_id = NULL"))).toBe(true)
    expect(statements.some((s) => s.includes("DELETE FROM workspaces"))).toBe(true)
    // Nothing here may delete a project row.
    expect(statements.some((s) => /DELETE FROM projects/i.test(s))).toBe(false)
  })

  it("still reads an org's projects from this disk", async () => {
    h.projectRows = [{ id: "p1", org_id: "local-1" }]
    await expect(organizations.listProjects("local-1")).resolves.toHaveLength(1)
  })
})

describe("signed in", () => {
  beforeEach(() => {
    h.token = "token"
  })

  it("shows local and remote orgs side by side, so linking hides nothing", async () => {
    h.rows = [orgRow]
    h.gateway.list.mockResolvedValue([{ id: "remote-1", name: "Real Org", slug: "real" }])
    const list = await organizations.list()
    expect(list.map((o) => o.id)).toEqual(["local-1", "remote-1"])
  })

  it("keeps local orgs listed when the gateway is unreachable", async () => {
    h.rows = [orgRow]
    h.gateway.list.mockRejectedValue(new Error("Can't reach the Inkwell server"))
    await expect(organizations.list()).resolves.toHaveLength(1)
  })

  it("still creates real orgs on the gateway", async () => {
    h.gateway.create.mockResolvedValue({ id: "remote-1", name: "Real Org" })
    await organizations.create({ name: "Real Org" })
    expect(h.gateway.create).toHaveBeenCalled()
    expect(h.execute).not.toHaveBeenCalled()
  })

  it("routes a write by which org it names, not by being signed in", async () => {
    h.rows = [orgRow]
    await organizations.update("local-1", { name: "Renamed" })
    expect(h.gateway.update).not.toHaveBeenCalled()
    expect(h.execute.mock.calls[0][0]).toContain("UPDATE workspaces")
  })

  it("sends a write for an org it doesn't hold to the gateway", async () => {
    h.rows = [] // no local org matches
    h.gateway.update.mockResolvedValue({ id: "remote-1", name: "Renamed" })
    await organizations.update("remote-1", { name: "Renamed" })
    expect(h.gateway.update).toHaveBeenCalledWith("remote-1", { name: "Renamed" })
  })
})
