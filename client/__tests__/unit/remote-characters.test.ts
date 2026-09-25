import { afterEach, describe, expect, it, vi } from "vitest"

import { setApiBaseUrl } from "@/lib/api"
import { characters } from "@/lib/storage/remote/characters"

const character = {
  id: "character/1",
  projectId: "project 1",
  name: "Mara",
  description: "",
  role: "protagonist",
  attributes: { voice: "terse" },
  createdAt: "2026-09-23T00:00:00Z",
  updatedAt: "2026-09-23T00:00:00Z",
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

afterEach(() => {
  setApiBaseUrl(null)
  vi.unstubAllGlobals()
})

describe("remote character storage", () => {
  it("uses authenticated routes without accepting a caller identity from the client", async () => {
    setApiBaseUrl("https://gateway.example")
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input
      if (init?.method === "POST") return jsonResponse({ character })
      if (init?.method === "GET") return jsonResponse({ characters: [character] })
      if (init?.method === "PUT") return jsonResponse({ character: { ...character, attributes: {} } })
      return jsonResponse({ success: true })
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(characters.create("project 1", "spoofed-user", {
      name: "Mara",
      role: "protagonist",
      attributes: { voice: "terse" },
    })).resolves.toMatchObject({ name: "Mara" })
    await expect(characters.listForProject("project 1", "spoofed-user")).resolves.toHaveLength(1)
    await expect(characters.update("character/1", "spoofed-user", { attributes: {} })).resolves.toMatchObject({ attributes: {} })
    await characters.delete("character/1", "spoofed-user")

    expect(fetchMock.mock.calls.map((call) => [String(call[0]), call[1]?.method])).toEqual([
      ["https://gateway.example/api/v1/characters", "POST"],
      ["https://gateway.example/api/v1/characters?project_id=project%201", "GET"],
      ["https://gateway.example/api/v1/characters/character%2F1", "PUT"],
      ["https://gateway.example/api/v1/characters/character%2F1", "DELETE"],
    ])

    const createBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(createBody).toEqual({
      project_id: "project 1",
      name: "Mara",
      role: "protagonist",
      attributes: { voice: "terse" },
    })
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("spoofed-user")
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({ attributes: {} })
  })
})
