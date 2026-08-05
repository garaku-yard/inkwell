import { describe, expect, it, vi, beforeEach } from "vitest"

// The bridge dispatches through the real registry; only the storage under it
// is stubbed, so these tests cover the path an external agent actually takes.
const h = vi.hoisted(() => ({
  getById: vi.fn(),
  listForProject: vi.fn(),
}))

vi.mock("@/lib/storage/local/projects", () => ({
  projects: {
    getById: h.getById,
    listOwned: async () => ({
      projects: [
        {
          id: "p1",
          title: "The Kettle",
          category: "novel",
          status: "draft",
          is_starred: false,
          updated_at: "2026-08-01T00:00:00Z",
        },
      ],
      total: 1,
    }),
  },
}))

vi.mock("@/lib/storage/local/organizations", () => ({
  organizations: { isAvailable: async () => false, list: async () => [], listProjects: async () => [] },
}))

vi.mock("@/lib/storage/local/scenes", () => ({
  scenes: { listForProject: h.listForProject, create: vi.fn() },
}))

vi.mock("@/lib/storage/local/elements", () => ({
  elements: { listForScene: async () => [], create: vi.fn() },
}))

vi.mock("@/lib/storage/local/knowledge", () => ({
  knowledge: { readNoteForTool: async () => null, retrieve: async () => [] },
}))

vi.mock("@/lib/storage/local/beat-board", () => ({
  beatBoard: { getBoard: async () => ({ beats: [] }), createBeat: vi.fn() },
}))

import { __resetBridgeForTests, __testables } from "@/lib/mcp/bridge"

const { handle } = __testables

interface McpResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

const textOf = (result: unknown) => (result as McpResult).content[0].text
const failed = (result: unknown) => (result as McpResult).isError === true

const call = (name: string, args: Record<string, unknown> = {}) =>
  handle("tools/call", { name, arguments: args })

beforeEach(() => {
  __resetBridgeForTests()
  h.getById.mockReset()
  h.getById.mockImplementation(async (id: string) => {
    if (id !== "p1") throw new Error("Project not found")
    return { id: "p1", title: "The Kettle", category: "novel" }
  })
  h.listForProject.mockReset()
  h.listForProject.mockResolvedValue([
    { id: "s1", scene_heading: "INT. KITCHEN", content: "", order_index: 0 },
  ])
})

describe("tools/list", () => {
  it("offers use_project alongside every registry tool", async () => {
    const { tools } = (await handle("tools/list", {})) as {
      tools: Array<{ name: string; inputSchema: unknown; annotations: { readOnlyHint: boolean } }>
    }
    const names = tools.map((t) => t.name)
    expect(names[0]).toBe("use_project")
    expect(names).toContain("read_scene")
    expect(names).toContain("append_to_scene")
    // Every tool carries a schema, or a client can't call it.
    for (const t of tools) expect(t.inputSchema, t.name).toBeTruthy()
  })

  it("marks the writing tools as not read-only, which is what a client confirms on", async () => {
    const { tools } = (await handle("tools/list", {})) as {
      tools: Array<{ name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean } }>
    }
    const writes = tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name)
    expect(writes).toEqual([
      "create_project",
      "create_scene",
      "append_to_scene",
      "add_beat",
      "rename_scene",
      "rewrite_scene",
      "delete_scene",
    ])
  })

  // The bridge gets the tools that can take writing away — the chat does not,
  // because an MCP client prompts before running one and the chat cannot.
  it("flags the two tools that remove writing, so a client can confirm harder", async () => {
    const { tools } = (await handle("tools/list", {})) as {
      tools: Array<{ name: string; annotations: { destructiveHint: boolean } }>
    }
    const destructive = tools.filter((t) => t.annotations.destructiveHint).map((t) => t.name)
    expect(destructive).toEqual(["rewrite_scene", "delete_scene"])
  })
})

describe("choosing a project", () => {
  it("runs an account-scoped tool before any project is chosen", async () => {
    const result = await call("list_projects")
    expect(failed(result)).toBe(false)
    expect(textOf(result)).toContain("The Kettle")
  })

  it("refuses a project-scoped tool until one is chosen", async () => {
    const result = await call("list_scenes")
    expect(failed(result)).toBe(true)
    expect(textOf(result)).toContain("use_project")
    expect(h.listForProject).not.toHaveBeenCalled()
  })

  it("rejects an id that isn't a project, and keeps the tools locked", async () => {
    const chosen = await call("use_project", { project_id: "nope" })
    expect(failed(chosen)).toBe(true)
    expect(textOf(chosen)).toContain('No project has the id "nope"')
    expect(failed(await call("list_scenes"))).toBe(true)
  })

  it("unlocks the project tools once a real id is chosen", async () => {
    const chosen = await call("use_project", { project_id: "p1" })
    expect(failed(chosen)).toBe(false)
    expect(textOf(chosen)).toContain("The Kettle")

    const scenes = await call("list_scenes")
    expect(failed(scenes)).toBe(false)
    expect(textOf(scenes)).toContain("INT. KITCHEN")
    expect(h.listForProject).toHaveBeenCalledWith("p1", expect.any(String))
  })

  it("asks for an id rather than choosing nothing", async () => {
    expect(failed(await call("use_project", { project_id: "  " }))).toBe(true)
  })
})

describe("failures the agent should see", () => {
  it("names a tool it doesn't have", async () => {
    const result = await call("delete_everything")
    expect(failed(result)).toBe(true)
    expect(textOf(result)).toContain("Unknown tool: delete_everything")
  })

  it("reports a handler that throws instead of going silent", async () => {
    await call("use_project", { project_id: "p1" })
    h.listForProject.mockRejectedValue(new Error("database is locked"))
    const result = await call("list_scenes")
    expect(failed(result)).toBe(true)
    expect(textOf(result)).toContain("database is locked")
  })

  it("rejects a method it doesn't speak", async () => {
    await expect(handle("resources/list", {})).rejects.toThrow("Unsupported method")
  })
})
