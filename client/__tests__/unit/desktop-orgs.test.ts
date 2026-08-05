import { beforeEach, describe, expect, it, vi } from "vitest"

import { setAuthToken } from "@/lib/api"

// The desktop binds the *gateway* org implementation for org administration
// (ADR 0023). Stub it so these tests assert the linked-account gate rather than
// the HTTP wire format.
vi.mock("@/lib/storage/remote/organizations", () => ({
  organizations: {
    isAvailable: vi.fn(async () => true),
    list: vi.fn(async () => [{ id: "org-1" }]),
    get: vi.fn(async () => ({ id: "org-1" })),
    create: vi.fn(async () => ({ id: "org-1" })),
    update: vi.fn(async () => ({ id: "org-1" })),
    delete: vi.fn(async () => undefined),
    listMembers: vi.fn(async () => [{ id: "member-1" }]),
    invite: vi.fn(async () => ({ invite_token: "tok" })),
    updateMemberRole: vi.fn(async () => ({ id: "member-1" })),
    removeMember: vi.fn(async () => undefined),
    acceptInvite: vi.fn(async () => ({ id: "org-1" })),
    declineInvite: vi.fn(async () => undefined),
    listIncomingInvites: vi.fn(async () => [{ token: "tok" }]),
    seats: vi.fn(async () => ({ members: 3, pending: 1, total: 5 })),
    setSeats: vi.fn(async () => ({ members: 3, pending: 1, total: 5 })),
    listProjects: vi.fn(async () => [{ id: "project-1" }]),
  },
}))

// Org *projects* are local rows, not a gateway call (ADR 0024), so this module
// now reaches SQLite. Stub the connection rather than the whole shared module,
// so toProject stays real and the mapping is genuinely exercised.
const select = vi.fn<(sql: string, args?: unknown[]) => Promise<unknown[]>>(async () => [])
vi.mock("@/lib/storage/local/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/local/shared")>()
  return { ...actual, getDb: async () => ({ select }) }
})

import { organizations } from "@/lib/storage/local/organizations"
import { organizations as gateway } from "@/lib/storage/remote/organizations"

describe("desktop organizations binding (ADR 0023, amended by 0026)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAuthToken(null)
  })

  describe("with no linked account", () => {
    // 0026 reverses 0023 here: an org signed out is a local object, so the
    // affordances stay rather than hiding behind a sign-in the writer doesn't
    // need to organise files on their own disk.
    it("reports itself available, because a signed-out org is a local one", async () => {
      await expect(organizations.isAvailable()).resolves.toBe(true)
    })

    // The regression this guards: delegating unconditionally would fire an
    // unauthenticated request on every desktop boot. Post-0026 the reads are
    // answered from SQLite instead of refused — with no org rows on disk the
    // answers are still empty, and still never touch the gateway.
    it("answers list-shaped reads locally without calling the gateway", async () => {
      await expect(organizations.list()).resolves.toEqual([])
      await expect(organizations.listIncomingInvites()).resolves.toEqual([])
      await expect(organizations.listMembers("org-1")).resolves.toEqual([])
      await expect(organizations.seats("org-1")).resolves.toEqual({
        members: 0,
        pending: 0,
        total: 0,
      })

      expect(gateway.list).not.toHaveBeenCalled()
      expect(gateway.listIncomingInvites).not.toHaveBeenCalled()
      expect(gateway.listMembers).not.toHaveBeenCalled()
      expect(gateway.seats).not.toHaveBeenCalled()
    })

    // What 0026 keeps from 0023: membership is the part that genuinely needs a
    // server. Those still refuse on a local org — but with NotSupportedError
    // ("this org lives on this device"), which is the true reason, rather than
    // UnauthenticatedError, which would tell the writer to sign in for
    // something signing in cannot give them.
    it("refuses membership operations on a local org, naming the real reason", async () => {
      select.mockResolvedValue([{
        id: "org-1", name: "Local", slug: "local", type: "org",
        owner_id: "u1", avatar_url: null, description: null, categories_json: "[]",
      }])

      await expect(organizations.invite("org-1", "a@b.c", "editor")).rejects.toThrow(/lives on this device/)
      await expect(organizations.setSeats("org-1", 5)).rejects.toThrow(/lives on this device/)
      await expect(organizations.updateMemberRole("org-1", "u2", "editor")).rejects.toThrow(/lives on this device/)
      await expect(organizations.removeMember("org-1", "u2")).rejects.toThrow(/lives on this device/)

      expect(gateway.invite).not.toHaveBeenCalled()
      expect(gateway.setSeats).not.toHaveBeenCalled()
      expect(gateway.updateMemberRole).not.toHaveBeenCalled()
      expect(gateway.removeMember).not.toHaveBeenCalled()
    })
  })

  describe("with a linked account", () => {
    beforeEach(() => {
      setAuthToken("a-bearer-token")
      // clearAllMocks resets calls, not implementations: without this the org
      // row from the local test above would still be on "disk" here.
      select.mockResolvedValue([])
    })

    it("reports itself available", async () => {
      await expect(organizations.isAvailable()).resolves.toBe(true)
    })

    it("delegates reads to the gateway, alongside any local orgs", async () => {
      await expect(organizations.list()).resolves.toEqual([{ id: "org-1" }])
      expect(gateway.list).toHaveBeenCalledOnce()

      await expect(organizations.seats("org-1")).resolves.toEqual({
        members: 3,
        pending: 1,
        total: 5,
      })
      expect(gateway.seats).toHaveBeenCalledWith("org-1")
    })

    it("delegates writes to the gateway with their arguments intact", async () => {
      await organizations.create({ name: "Garaku Yard Studios", description: "Junk." })
      expect(gateway.create).toHaveBeenCalledWith({
        name: "Garaku Yard Studios",
        description: "Junk.",
      })

      await organizations.invite("org-1", "someone@example.com", "editor")
      expect(gateway.invite).toHaveBeenCalledWith("org-1", "someone@example.com", "editor")
    })
  })
})

// ADR 0024: an org project is an ordinary local project carrying the org's id.
// The desktop must therefore answer "this org's projects" from disk — never the
// gateway — so it works signed out and offline like everything else here.
describe("org projects are local (ADR 0024)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    select.mockResolvedValue([])
  })

  it("reads this org's projects from SQLite, not the gateway", async () => {
    setAuthToken("a-bearer-token") // linked: still must not go to the network
    select.mockResolvedValue([
      {
        id: "p1",
        workspace_id: null,
        org_id: "org-1",
        title: "Team script",
        description: "",
        owner_id: "u1",
        category: "screenplay",
        status: "draft",
        is_starred: 0,
        created_at: "2026-08-04T00:00:00Z",
        updated_at: "2026-08-04T00:00:00Z",
      },
    ])

    const projects = await organizations.listProjects("org-1")

    expect(gateway.listProjects).not.toHaveBeenCalled()
    expect(projects).toHaveLength(1)
    expect(projects[0]).toMatchObject({ id: "p1", title: "Team script", org_id: "org-1" })

    const [sql, args] = select.mock.calls.at(-1)!
    expect(sql).toContain("org_id = ?")
    expect(sql).toContain("deleted_at IS NULL")
    expect(args).toEqual(["org-1"])
  })

  it("works with no linked account, since nothing about it needs one", async () => {
    setAuthToken(null)
    await expect(organizations.listProjects("org-1")).resolves.toEqual([])
    expect(gateway.listProjects).not.toHaveBeenCalled()
  })
})
