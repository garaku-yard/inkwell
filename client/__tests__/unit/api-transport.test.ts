import { afterEach, describe, expect, it, vi } from "vitest"

import {
  apiClient,
  getApiBaseUrl,
  setApiBaseUrl,
  setAuthToken,
  setNativeClient,
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
