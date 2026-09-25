import { describe, expect, it } from "vitest"

import { normalizeGatewayUrl } from "@/lib/desktop-auth"

describe("desktop gateway URL", () => {
  it("normalizes an HTTPS host and trims its trailing slash", () => {
    expect(normalizeGatewayUrl("  https://inkwell.example.com/  ")).toBe(
      "https://inkwell.example.com",
    )
  })

  it("allows an HTTP localhost host for local development", () => {
    expect(normalizeGatewayUrl("http://localhost:8080/inkwell/")).toBe(
      "http://localhost:8080/inkwell",
    )
  })

  it.each([
    ["inkwell.example.com", "including http:// or https://"],
    ["file:///tmp/inkwell", "must use http:// or https://"],
    ["https://user:secret@example.com", "cannot contain credentials"],
    ["https://example.com?tenant=one", "cannot contain credentials"],
  ])("rejects an invalid API base URL: %s", (value, message) => {
    expect(() => normalizeGatewayUrl(value)).toThrow(message)
  })
})
