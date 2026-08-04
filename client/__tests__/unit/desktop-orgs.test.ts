import { beforeEach, describe, expect, it, vi } from "vitest"

import { setAuthToken } from "@/lib/api"
import { UnauthenticatedError } from "@/lib/storage/errors"

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

describe("desktop organizations binding (ADR 0023)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAuthToken(null)
  })

  describe("with no linked account", () => {
    it("reports itself unavailable so the UI hides org affordances", async () => {
      await expect(organizations.isAvailable()).resolves.toBe(false)
    })

    // The regression this guards: the pre-0023 local stub returned [] so the
    // rail showed no org zone. Delegating unconditionally would instead fire an
    // unauthenticated request on every desktop boot.
    it("degrades list-shaped reads to empty without calling the gateway", async () => {
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

    it("refuses writes locally rather than sending a request that can only 401", async () => {
      await expect(organizations.create({ name: "x" })).rejects.toBeInstanceOf(UnauthenticatedError)
      await expect(organizations.get("org-1")).rejects.toBeInstanceOf(UnauthenticatedError)
      await expect(organizations.update("org-1", { name: "y" })).rejects.toBeInstanceOf(UnauthenticatedError)
      await expect(organizations.delete("org-1")).rejects.toBeInstanceOf(UnauthenticatedError)
      await expect(organizations.invite("org-1", "a@b.c", "editor")).rejects.toBeInstanceOf(UnauthenticatedError)
      await expect(organizations.setSeats("org-1", 5)).rejects.toBeInstanceOf(UnauthenticatedError)

      expect(gateway.create).not.toHaveBeenCalled()
      expect(gateway.get).not.toHaveBeenCalled()
      expect(gateway.update).not.toHaveBeenCalled()
      expect(gateway.delete).not.toHaveBeenCalled()
      expect(gateway.invite).not.toHaveBeenCalled()
      expect(gateway.setSeats).not.toHaveBeenCalled()
    })
  })

  describe("with a linked account", () => {
    beforeEach(() => {
      setAuthToken("a-bearer-token")
    })

    it("reports itself available", async () => {
      await expect(organizations.isAvailable()).resolves.toBe(true)
    })

    it("delegates reads to the gateway", async () => {
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
