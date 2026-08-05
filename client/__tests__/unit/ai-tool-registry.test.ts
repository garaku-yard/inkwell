import { describe, expect, it, vi, beforeEach } from "vitest"

// The handlers reach SQLite through the local storage modules, which only
// resolve inside a Tauri webview — stand in for the ones the tools touch.
const h = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
  scenes: [] as Array<Record<string, unknown>>,
  elements: {} as Record<string, Array<Record<string, unknown>>>,
  hits: [] as Array<Record<string, unknown>>,
  notes: {} as Record<string, { title: string; filename: string; content: string }>,
  listForProject: vi.fn(),
  retrieve: vi.fn(),
}))

vi.mock("@/lib/storage/local/knowledge", () => ({
  knowledge: {
    readNoteForTool: async (_projectId: string, title: string) => h.notes[title] ?? null,
    retrieve: h.retrieve,
  },
}))

vi.mock("@/lib/storage/local/projects", () => ({
  projects: {
    listOwned: async () => ({ projects: h.projects, total: h.projects.length }),
  },
}))

vi.mock("@/lib/storage/local/scenes", () => ({
  scenes: { listForProject: h.listForProject },
}))

vi.mock("@/lib/storage/local/elements", () => ({
  elements: { listForScene: async (sceneId: string) => h.elements[sceneId] ?? [] },
}))

import {
  findTool,
  parseToolArgs,
  toolSpecsFor,
  type ToolEntry,
} from "@/lib/storage/local/tools"

const tool = (name: string): ToolEntry => {
  const entry = findTool(name)
  if (!entry) throw new Error(`${name} is not registered`)
  return entry
}

const ctx = { projectId: "proj1" }

beforeEach(() => {
  h.projects = [
    {
      id: "p1",
      title: "The Kettle",
      category: "novel",
      status: "draft",
      is_starred: true,
      updated_at: "2026-08-01T00:00:00Z",
    },
  ]
  h.scenes = [
    { id: "s1", scene_heading: "INT. KITCHEN - DAY", content: "" },
    { id: "s2", scene_heading: "", content: "legacy body" },
  ]
  h.elements = {
    s1: [
      { element_type: "action", content: "The kettle screamed." },
      { element_type: "dialogue", content: "Ignore it." },
    ],
  }
  h.notes = { Cats: { title: "Cats", filename: "Cats.md", content: "Cats are independent." } }
  h.hits = [{ title: "Cats", text: "cats excerpt", score: 0.8321 }]
  h.listForProject.mockReset()
  h.listForProject.mockImplementation(async (projectId: string) =>
    projectId === "proj1" ? h.scenes : [],
  )
  h.retrieve.mockReset()
  h.retrieve.mockImplementation(async () => h.hits)
})

describe("tool registry", () => {
  it("declares every registered tool, and each spec resolves back to its entry", () => {
    const specs = toolSpecsFor({ knowledge: true })
    expect(specs.map((s) => s.name)).toEqual([
      "list_projects",
      "list_scenes",
      "read_scene",
      "search_notes",
      "read_note",
    ])
    for (const spec of specs) {
      expect(findTool(spec.name)?.spec).toBe(spec)
    }
  })

  it("withholds the note tools from a project with no knowledge wired", () => {
    const specs = toolSpecsFor({ knowledge: false }).map((s) => s.name)
    expect(specs).toEqual(["list_projects", "list_scenes", "read_scene"])
  })

  it("gives every tool a label to show while it runs, even with no arguments", () => {
    for (const spec of toolSpecsFor({ knowledge: true })) {
      const entry = tool(spec.name)
      expect(entry.label({}), spec.name).toBeTruthy()
      expect(typeof entry.mutates, spec.name).toBe("boolean")
    }
  })

  it("returns undefined for a tool the model invented", () => {
    expect(findTool("delete_everything")).toBeUndefined()
  })

  it("decodes arguments, degrading anything that isn't an object to empty", () => {
    expect(parseToolArgs('{"title":"Cats"}')).toEqual({ title: "Cats" })
    expect(parseToolArgs("")).toEqual({})
    expect(parseToolArgs("{oops")).toEqual({})
    expect(parseToolArgs('["Cats"]')).toEqual({})
    expect(parseToolArgs("null")).toEqual({})
  })

  it("reads without writing — nothing in stage 2 mutates yet", () => {
    for (const spec of toolSpecsFor({ knowledge: true })) {
      expect(tool(spec.name).mutates, spec.name).toBe(false)
    }
  })
})

describe("read_note", () => {
  it("returns the note body, scoped to the calling project", async () => {
    expect(tool("read_note").label({ title: "Cats" })).toBe('Reading "Cats"')
    await expect(tool("read_note").run({ title: "Cats" }, ctx)).resolves.toBe(
      "Cats are independent.",
    )
  })

  it("tells the model when nothing in scope matches, rather than throwing", async () => {
    await expect(tool("read_note").run({ title: "Dogs" }, ctx)).resolves.toContain(
      'No note titled "Dogs"',
    )
  })

  it("survives a missing or mistyped title", async () => {
    expect(tool("read_note").label({ title: 42 })).toBe("Reading a note")
    await expect(tool("read_note").run({}, ctx)).resolves.toContain('No note titled ""')
  })
})

describe("list_projects", () => {
  it("names each project with the id the writer's other tools need", async () => {
    const out = await tool("list_projects").run({}, ctx)
    expect(out).toContain("The Kettle")
    expect(out).toContain("novel, draft")
    expect(out).toContain("id p1")
    expect(out).toContain("★")
  })

  it("says so plainly when there are none", async () => {
    h.projects = []
    await expect(tool("list_projects").run({}, ctx)).resolves.toBe(
      "The writer has no projects yet.",
    )
  })
})

describe("list_scenes", () => {
  it("numbers the scenes in reading order and labels an untitled one", async () => {
    const out = await tool("list_scenes").run({}, ctx)
    expect(out).toBe("1. INT. KITCHEN - DAY (id s1)\n2. (untitled) (id s2)")
    expect(h.listForProject).toHaveBeenCalledWith("proj1", expect.any(String))
  })

  it("says so plainly when the project is empty", async () => {
    h.scenes = []
    await expect(tool("list_scenes").run({}, ctx)).resolves.toBe(
      "This project has no scenes yet.",
    )
  })
})

describe("read_scene", () => {
  it("renders the scene with each line's element type intact", async () => {
    const out = await tool("read_scene").run({ scene_id: "s1" }, ctx)
    expect(out).toBe(
      "INT. KITCHEN - DAY\n\n[action] The kettle screamed.\n[dialogue] Ignore it.",
    )
  })

  it("falls back to the legacy scene body when no elements exist", async () => {
    const out = await tool("read_scene").run({ scene_id: "s2" }, ctx)
    expect(out).toBe("(untitled scene)\n\nlegacy body")
  })

  it("reports an empty scene instead of returning a bare heading", async () => {
    h.scenes = [{ id: "s3", scene_heading: "INT. VOID", content: "   " }]
    await expect(tool("read_scene").run({ scene_id: "s3" }, ctx)).resolves.toBe(
      "INT. VOID\n\n(This scene is empty.)",
    )
  })

  it("refuses a scene id that isn't in this project", async () => {
    const out = await tool("read_scene").run({ scene_id: "someone-elses" }, ctx)
    expect(out).toContain('No scene with id "someone-elses" in this project')
    expect(out).toContain("list_scenes")
  })
})

describe("search_notes", () => {
  it("returns each hit with its note and similarity", async () => {
    expect(tool("search_notes").label({ query: "kettle" })).toBe(
      'Searching notes for "kettle"',
    )
    const out = await tool("search_notes").run({ query: "kettle" }, ctx)
    expect(h.retrieve).toHaveBeenCalledWith("proj1", "kettle", 8)
    expect(out).toContain("[Note: Cats]")
    expect(out).toContain("similarity 0.83")
    expect(out).toContain("cats excerpt")
  })

  it("points at the unbuilt index when nothing matches", async () => {
    h.hits = []
    const out = await tool("search_notes").run({ query: "kettle" }, ctx)
    expect(out).toContain("may not be built yet")
  })

  it("asks for a query rather than searching for nothing", async () => {
    await expect(tool("search_notes").run({ query: "  " }, ctx)).resolves.toBe(
      "Give a query to search for.",
    )
    expect(h.retrieve).not.toHaveBeenCalled()
  })
})
