import { afterEach, describe, expect, it, vi } from "vitest"

import {
  apiClient,
  getApiBaseUrl,
  getAuthToken,
  getRefreshToken,
  setApiBaseUrl,
  setAuthToken,
  setNativeClient,
  setRefreshToken,
} from "@/lib/api"

/** Captures the most recent fetch call so assertions can inspect URL + init. */
function mockFetch(status = 200, body: unknown = {}) {
  const fn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  )
  vi.stubGlobal("fetch", fn)
  return fn
}

function lastInit(fn: ReturnType<typeof vi.fn>): RequestInit {
  return fn.mock.calls.at(-1)?.[1] as RequestInit
}

function header(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name)
}

afterEach(() => {
  // Reset module state between cases so they don't leak into each other.
  setNativeClient(false)
  setAuthToken(null)
  setRefreshToken(null)
  setApiBaseUrl(null)
  vi.unstubAllGlobals()
})

describe("api auth transport", () => {
  it("web client uses cookies and sends no auth headers", async () => {
    const fn = mockFetch()
    setNativeClient(false)
    await apiClient("projects")

    const init = lastInit(fn)
    expect(init.credentials).toBe("include")
    expect(header(init, "X-Inkwell-Client")).toBeNull()
    expect(header(init, "Authorization")).toBeNull()
  })

  it("native client sends the desktop header and omits cookies even with no token", async () => {
    const fn = mockFetch()
    setNativeClient(true)
    await apiClient("login", { body: { email: "a@b.c", password: "x" } })

    const init = lastInit(fn)
    expect(init.credentials).toBe("omit")
    expect(header(init, "X-Inkwell-Client")).toBe("desktop")
    // No token yet (pre-login): Authorization must be absent.
    expect(header(init, "Authorization")).toBeNull()
  })

  it("native client attaches the bearer token once set", async () => {
    const fn = mockFetch()
    setNativeClient(true)
    setAuthToken("jwt-123")
    await apiClient("users/me")

    const init = lastInit(fn)
    expect(init.credentials).toBe("omit")
    expect(header(init, "Authorization")).toBe("Bearer jwt-123")
    expect(header(init, "X-Inkwell-Client")).toBe("desktop")
  })

  it("base URL override repoints requests and resets to default on clear", async () => {
    const fn = mockFetch()
    setApiBaseUrl("https://gw.example.com/")
    expect(getApiBaseUrl()).toBe("https://gw.example.com") // trailing slash trimmed
    await apiClient("projects")
    expect(fn.mock.calls.at(-1)?.[0]).toBe("https://gw.example.com/api/v1/projects")

    setApiBaseUrl(null)
    expect(getApiBaseUrl()).not.toBe("https://gw.example.com")
  })
})

describe("api token refresh on 401", () => {
  it("native client refreshes the token and retries once, rotating both tokens", async () => {
    setNativeClient(true)
    setAuthToken("expired")
    setRefreshToken("refresh-1")

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/auth/refresh")) {
        return new Response(JSON.stringify({ accessToken: "new-token", refreshToken: "refresh-2" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }
      // First call carries the expired token → 401; the retry carries the new one.
      const auth = new Headers(init?.headers).get("Authorization")
      if (auth === "Bearer expired") return new Response("", { status: 401 })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await apiClient<{ ok: boolean }>("projects")
    expect(result).toEqual({ ok: true })
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith("/auth/refresh"))).toBe(true)
    expect(getAuthToken()).toBe("new-token")
    expect(getRefreshToken()).toBe("refresh-2")
  })

  it("gives up (throws 401) when the refresh itself fails", async () => {
    setNativeClient(true)
    setAuthToken("expired")
    setRefreshToken("bad")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 401 })),
    )
    await expect(apiClient("projects")).rejects.toMatchObject({ status: 401 })
  })

  it("does not attempt refresh for a web (cookie) client", async () => {
    setNativeClient(false)
    const fetchMock = vi.fn(async () => new Response("", { status: 401 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(apiClient("projects")).rejects.toMatchObject({ status: 401 })
    // Only the original request — no /auth/refresh.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("transport failures", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setNativeClient(false)
    setAuthToken(null)
    setRefreshToken(null)
    setApiBaseUrl(undefined)
  })

  // A request that never reaches a server rejects with whatever the engine
  // decided to call it — "Load failed" on WebKit, "Failed to fetch" on
  // Chromium. UI that renders err.message showed users that string verbatim.
  it("turns an unreachable server into UNAVAILABLE naming the origin", async () => {
    setApiBaseUrl("http://localhost:8080")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Load failed")
      }),
    )

    await expect(apiClient("organizations", { method: "POST", body: { name: "x" } })).rejects.toMatchObject({
      name: "ApiError",
      code: "UNAVAILABLE",
    })

    const err = (await apiClient("organizations").catch((e: unknown) => e)) as Error
    expect(err.message).toContain("http://localhost:8080")
    expect(err.message).not.toContain("Load failed")
  })

  // Server-authored copy is the useful kind (e.g. the Business-plan gate), so
  // it must survive to the UI untouched rather than being replaced.
  it("preserves the gateway's own message for a rejected request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: "FAILED_PRECONDITION",
            message: "Organization workspaces require the Business plan. Upgrade to create one.",
          }),
          { status: 403, headers: { "content-type": "application/json" } },
        ),
      ),
    )

    const err = (await apiClient("organizations", { method: "POST" }).catch((e: unknown) => e)) as Error
    expect(err.message).toBe(
      "Organization workspaces require the Business plan. Upgrade to create one.",
    )
    expect(err).toMatchObject({ code: "FAILED_PRECONDITION", status: 403 })
  })
})
