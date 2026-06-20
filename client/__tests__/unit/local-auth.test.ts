import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CurrentUser } from "@/lib/storage"

// Isolate the desktop auth domain from its real deps so the test doesn't pull
// in @tauri-apps/plugin-sql (via ./shared) or the keychain bridge.
const LOCAL_PROFILE: CurrentUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "you@inkwell.local",
  username: "writer",
  tag: "0001",
  role: "user",
  name: "",
  lastName: "",
  twoFactorEnabled: false,
}

const REMOTE_USER = {
  id: "remote-1",
  email: "me@example.com",
  username: "me",
  usernameTag: "4242",
  name: "Me",
  lastName: "Myself",
  role: "user",
  twoFactorEnabled: true,
  createdAt: "t",
  updatedAt: "t",
}

vi.mock("@/lib/api", () => {
  // Mirror the real ApiError signature (status, code, message, fields?) so
  // `instanceof` checks and constructor calls type-check against @/lib/api.
  class ApiError extends Error {
    status: number
    code: string
    constructor(status: number, code: string, message: string) {
      super(message)
      this.status = status
      this.code = code
    }
  }
  return { apiClient: vi.fn(), getAuthToken: vi.fn(), ApiError }
})
vi.mock("@/lib/desktop-auth", () => ({ persistTokens: vi.fn() }))
vi.mock("@/lib/storage/local/shared", () => ({ ensureUserProfile: vi.fn(async () => LOCAL_PROFILE) }))

import { ApiError, apiClient, getAuthToken } from "@/lib/api"
import { persistTokens } from "@/lib/desktop-auth"
import { auth } from "@/lib/storage/local/auth"

const mockApiClient = vi.mocked(apiClient)
const mockGetToken = vi.mocked(getAuthToken)
const mockPersist = vi.mocked(persistTokens)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("desktop auth domain", () => {
  it("login persists the returned token and returns the user", async () => {
    mockApiClient.mockResolvedValueOnce({ user: REMOTE_USER, accessToken: "jwt-1" })
    const res = await auth.login({ email: "me@example.com", password: "x" })

    expect(mockPersist).toHaveBeenCalledWith("jwt-1", null)
    expect(res.user?.id).toBe("remote-1")
  })

  it("login surfaces totpRequired without persisting a token", async () => {
    mockApiClient.mockResolvedValueOnce({ totpRequired: true })
    const res = await auth.login({ email: "me@example.com", password: "x" })

    expect(res.totpRequired).toBe(true)
    expect(mockPersist).not.toHaveBeenCalled()
  })

  it("me() returns the remote account when the token is valid", async () => {
    mockGetToken.mockReturnValue("jwt-1")
    mockApiClient.mockResolvedValueOnce({ user: REMOTE_USER })

    const me = await auth.me()
    expect(me?.id).toBe("remote-1")
    expect(me?.tag).toBe("4242") // usernameTag mapped to tag
    expect(mockPersist).not.toHaveBeenCalled()
  })

  it("me() clears the token and falls back to the local profile on 401", async () => {
    mockGetToken.mockReturnValue("stale")
    mockApiClient.mockRejectedValueOnce(new ApiError(401, "UNAUTHENTICATED", "unauthorized"))

    const me = await auth.me()
    expect(mockPersist).toHaveBeenCalledWith(null, null) // unlinked
    expect(me?.id).toBe(LOCAL_PROFILE.id) // local-first fallback
  })

  it("me() keeps the token on a transient error and still returns the local profile", async () => {
    mockGetToken.mockReturnValue("good")
    mockApiClient.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "unavailable"))

    const me = await auth.me()
    expect(mockPersist).not.toHaveBeenCalled() // token retained for retry
    expect(me?.id).toBe(LOCAL_PROFILE.id)
  })

  it("me() returns the local profile when not linked (no token)", async () => {
    mockGetToken.mockReturnValue(null)

    const me = await auth.me()
    expect(me?.id).toBe(LOCAL_PROFILE.id)
    expect(mockApiClient).not.toHaveBeenCalled() // no network when signed out
  })

  it("logout clears the token even if the server revoke fails", async () => {
    mockApiClient.mockRejectedValueOnce(new Error("offline"))
    await auth.logout()
    expect(mockPersist).toHaveBeenCalledWith(null, null)
  })

  it("listSessions short-circuits to empty when not linked", async () => {
    mockGetToken.mockReturnValue(null)
    const sessions = await auth.listSessions()
    expect(sessions).toEqual([])
    expect(mockApiClient).not.toHaveBeenCalled()
  })
})
