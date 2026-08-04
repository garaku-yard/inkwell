import { beforeEach, describe, expect, it, vi } from "vitest"

import { setAuthToken } from "@/lib/api"
import { UnauthenticatedError } from "@/lib/storage/errors"

// The desktop binds the *gateway* org implementation (ADR 0023). Stub it so
// these tests assert the linked-account gate rather than the HTTP wire format.
// This module is the one part of `local/` that loads outside a Tauri webview —
// it pulls in no @tauri-apps/plugin-sql, only the HTTP client.
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
      await expect(organizations.listProjects("org-1")).resolves.toEqual([])
      await expect(organizations.seats("org-1")).resolves.toEqual({
        members: 0,
        pending: 0,
        total: 0,
      })

      expect(gateway.list).not.toHaveBeenCalled()
      expect(gateway.listIncomingInvites).not.toHaveBeenCalled()
      expect(gateway.listMembers).not.toHaveBeenCalled()
      expect(gateway.listProjects).not.toHaveBeenCalled()
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
