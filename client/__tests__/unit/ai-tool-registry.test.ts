import { describe, expect, it, vi, beforeEach } from "vitest"

// The handlers reach SQLite through the local storage modules, which only
// resolve inside a Tauri webview — stand in for the ones the tools touch.
const h = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
  scenes: [] as Array<Record<string, unknown>>,
  elements: {} as Record<string, Array<Record<string, unknown>>>,
  hits: [] as Array<Record<string, unknown>>,
  notes: {} as Record<string, { title: string; filename: string; content: string }>,
  beats: [] as unknown[],
  category: "novel",
  listForProject: vi.fn(),
  retrieve: vi.fn(),
  createScene: vi.fn(),
  createElement: vi.fn(),
  createBeat: vi.fn(),
  orgAvailable: vi.fn(),
  orgList: vi.fn(),
  orgProjects: vi.fn(),
  createProject: vi.fn(),
  wsList: vi.fn(),
  wsCreate: vi.fn(),
}))

vi.mock("@/lib/storage/local/workspaces", () => ({
  workspaces: { list: h.wsList, createPersonal: h.wsCreate },
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
    getById: async () => ({ id: "proj1", title: "The Kettle", category: h.category }),
    create: h.createProject,
  },
}))

vi.mock("@/lib/storage/local/scenes", () => ({
  scenes: { listForProject: h.listForProject, create: h.createScene },
}))

vi.mock("@/lib/storage/local/elements", () => ({
  elements: {
    listForScene: async (sceneId: string) => h.elements[sceneId] ?? [],
    create: h.createElement,
  },
}))

vi.mock("@/lib/storage/local/organizations", () => ({
  organizations: {
    isAvailable: h.orgAvailable,
    list: h.orgList,
    listProjects: h.orgProjects,
  },
}))

vi.mock("@/lib/storage/local/beat-board", () => ({
  beatBoard: {
    getBoard: async () => ({ beats: h.beats, connections: [], lanes: [], outlineItems: [] }),
    createBeat: h.createBeat,
  },
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
    { id: "s1", scene_heading: "INT. KITCHEN - DAY", content: "", order_index: 0 },
    { id: "s2", scene_heading: "", content: "legacy body", order_index: 4 },
  ]
  h.elements = {
    s1: [
      { element_type: "action", content: "The kettle screamed.", line_number: 0 },
      { element_type: "dialogue", content: "Ignore it.", line_number: 7 },
    ],
  }
  h.category = "novel"
  h.beats = []
  h.notes = { Cats: { title: "Cats", filename: "Cats.md", content: "Cats are independent." } }
  h.hits = [{ title: "Cats", text: "cats excerpt", score: 0.8321 }]
  h.listForProject.mockReset()
  h.listForProject.mockImplementation(async (projectId: string) =>
    projectId === "proj1" ? h.scenes : [],
  )
  h.retrieve.mockReset()
  h.retrieve.mockImplementation(async () => h.hits)
  h.createScene.mockReset()
  h.createScene.mockImplementation(async () => ({ id: "new-scene" }))
  h.createElement.mockReset()
  h.createElement.mockResolvedValue({})
  h.createBeat.mockReset()
  h.createBeat.mockResolvedValue({})
  h.orgAvailable.mockReset()
  h.orgAvailable.mockResolvedValue(false)
  h.orgList.mockReset()
  h.orgList.mockResolvedValue([])
  h.orgProjects.mockReset()
  h.orgProjects.mockResolvedValue([])
  h.createProject.mockReset()
  h.createProject.mockImplementation(async (input) => ({ id: "new-project", ...input }))
  h.wsList.mockReset()
  h.wsList.mockResolvedValue({ personal: [{ categories: [{ slug: "novel" }] }], org: [] })
  h.wsCreate.mockReset()
  h.wsCreate.mockResolvedValue({ workspaces: [] })
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
      "create_project",
      "create_scene",
      "append_to_scene",
      "add_beat",
    ])
    for (const spec of specs) {
      expect(findTool(spec.name)?.spec).toBe(spec)
    }
  })

  it("withholds the note tools from a project with no knowledge wired", () => {
    const specs = toolSpecsFor({ knowledge: false }).map((s) => s.name)
    expect(specs).not.toContain("read_note")
    expect(specs).not.toContain("search_notes")
    expect(specs).toContain("list_scenes")
    expect(specs).toContain("create_scene")
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

  it("marks exactly the tools that write, which is what stage 4 will confirm on", () => {
    const mutating = toolSpecsFor({ knowledge: true })
      .map((s) => s.name)
      .filter((name) => tool(name).mutates)
    expect(mutating).toEqual([
      "create_project",
      "create_scene",
      "append_to_scene",
      "add_beat",
    ])
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

  it("includes org-owned projects when the gateway can be reached", async () => {
    h.orgAvailable.mockResolvedValue(true)
    h.orgList.mockResolvedValue([{ id: "o1", name: "Garaku Yard" }])
    h.orgProjects.mockResolvedValue([
      {
        id: "p2",
        title: "Attractor: Zero",
        category: "interactive_fiction",
        status: "draft",
        is_starred: false,
        updated_at: "2026-08-05T00:00:00Z",
      },
    ])
    const out = await tool("list_projects").run({}, ctx)
    expect(out).toContain("Attractor: Zero")
    expect(out).toContain("org: Garaku Yard")
    expect(out).not.toContain("aren't included")
  })

  // Found by driving the real app: a linked account whose gateway is down
  // makes list() throw, where an unlinked one merely returns nothing. The
  // personal projects are on this device either way and must still come back.
  it("still lists personal projects when the gateway is unreachable", async () => {
    h.orgAvailable.mockResolvedValue(true)
    h.orgList.mockRejectedValue(new Error("Can't reach the Inkwell server"))
    const out = await tool("list_projects").run({}, ctx)
    expect(out).toContain("The Kettle")
    expect(out).toContain("Can't reach the Inkwell server")
    expect(out).toContain("use_project still accepts it")
  })

  it("names the missing cloud account when nothing is linked", async () => {
    const out = await tool("list_projects").run({}, ctx)
    expect(out).toContain("no cloud account is linked")
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

describe("create_project", () => {
  it("creates the project and hands back the id the next call needs", async () => {
    const out = await tool("create_project").run(
      { title: "Attractor: Zero", category: "interactive_fiction" },
      ctx,
    )
    expect(h.createProject).toHaveBeenCalledWith({
      title: "Attractor: Zero",
      description: undefined,
      owner_id: expect.any(String),
      category: "interactive_fiction",
    })
    expect(out).toContain("new-project")
    expect(out).toContain("use_project")
  })

  it("adds a workspace when none can show the new project's format", async () => {
    // The dashboard filters by the active workspace's categories, so a format
    // no workspace holds would be created into invisibility.
    const out = await tool("create_project").run(
      { title: "The Long Room", category: "interactive_fiction" },
      ctx,
    )
    expect(h.wsCreate).toHaveBeenCalledWith(expect.any(String), ["interactive_fiction"])
    expect(out).toContain("workspace")
  })

  it("leaves the workspaces alone when one already holds the format", async () => {
    await tool("create_project").run({ title: "Second Novel", category: "novel" }, ctx)
    expect(h.wsCreate).not.toHaveBeenCalled()
  })

  it("still reports the project when the workspace can't be added", async () => {
    h.wsCreate.mockRejectedValue(new Error("disk full"))
    const out = await tool("create_project").run(
      { title: "The Long Room", category: "poetry" },
      ctx,
    )
    expect(out).toContain("new-project")
    expect(out).toContain("may not show on the dashboard")
  })

  it("refuses a format a tool has no business creating", async () => {
    // A vault is a folder on disk chosen through a native picker; the row
    // alone would open onto nothing.
    const out = await tool("create_project").run(
      { title: "Notes", category: "vault" },
      ctx,
    )
    expect(out).toContain("isn't a format a tool can create")
    expect(h.createProject).not.toHaveBeenCalled()
  })

  it("refuses a format that doesn't exist", async () => {
    await expect(
      tool("create_project").run({ title: "X", category: "haiku" }, ctx),
    ).resolves.toContain("isn't a format")
    expect(h.createProject).not.toHaveBeenCalled()
  })

  it("asks for a title rather than creating an untitled project", async () => {
    await expect(
      tool("create_project").run({ category: "novel" }, ctx),
    ).resolves.toBe("Give the project a title.")
    expect(h.createProject).not.toHaveBeenCalled()
  })

  it("works without a project chosen, being account-scoped", () => {
    expect(tool("create_project").scope).toBe("account")
  })
})

describe("create_scene", () => {
  it("adds the scene after the last one and reports its id", async () => {
    const out = await tool("create_scene").run({ heading: "INT. HALL" }, ctx)
    // order_index continues the project's own numbering (4 was the highest).
    expect(h.createScene).toHaveBeenCalledWith("proj1", expect.any(String), {
      scene_heading: "INT. HALL",
      order_index: 5,
    })
    expect(out).toContain("new-scene")
    expect(out).toContain("(empty)")
    expect(h.createElement).not.toHaveBeenCalled()
  })

  it("writes optional text in the project's own element vocabulary", async () => {
    const out = await tool("create_scene").run(
      { heading: "INT. HALL", text: "One.\n\nTwo." },
      ctx,
    )
    expect(h.createElement).toHaveBeenCalledTimes(2)
    expect(h.createElement).toHaveBeenNthCalledWith(1, {
      projectId: "proj1",
      sceneId: "new-scene",
      elementOrder: 0,
      elementType: "paragraph",
      content: "One.",
    })
    expect(out).toContain("2 elements")
  })

  it("keeps verse a line at a time", async () => {
    h.category = "poetry"
    await tool("create_scene").run({ heading: "Aubade", text: "one\ntwo\n\nthree" }, ctx)
    expect(h.createElement.mock.calls.map(([c]) => [c.elementType, c.content])).toEqual([
      ["line", "one"],
      ["line", "two"],
      ["line", "three"],
    ])
  })

  it("writes an all-links paragraph as a choice, the way interactive fiction stores it", async () => {
    h.category = "interactive_fiction"
    await tool("create_scene").run(
      { heading: "Landing", text: "The lift doors open.\n\n[[Go left]] [[Go right]]" },
      ctx,
    )
    expect(h.createElement.mock.calls.map(([c]) => [c.elementType, c.content])).toEqual([
      ["body", "The lift doors open."],
      ["choice", "[[Go left]] [[Go right]]"],
    ])
  })

  it("refuses a format that has no scenes, without creating anything", async () => {
    h.category = "vault"
    const out = await tool("create_scene").run({ heading: "Nope" }, ctx)
    expect(out).toContain("no scenes")
    expect(h.createScene).not.toHaveBeenCalled()
  })

  it("asks for a heading rather than creating an unnamed scene", async () => {
    await expect(tool("create_scene").run({ heading: "  " }, ctx)).resolves.toBe(
      "Give the scene a heading.",
    )
    expect(h.createScene).not.toHaveBeenCalled()
  })
})

describe("append_to_scene", () => {
  it("continues the scene's line numbering rather than counting rows", async () => {
    const out = await tool("append_to_scene").run(
      { scene_id: "s1", text: "Added." },
      ctx,
    )
    // s1's last element is line_number 7, so the append lands at 8 — not at 2.
    expect(h.createElement).toHaveBeenCalledWith({
      projectId: "proj1",
      sceneId: "s1",
      elementOrder: 8,
      elementType: "paragraph",
      content: "Added.",
    })
    expect(out).toContain("INT. KITCHEN - DAY")
  })

  it("starts at zero in an empty scene", async () => {
    await tool("append_to_scene").run({ scene_id: "s2", text: "First." }, ctx)
    expect(h.createElement).toHaveBeenCalledWith(
      expect.objectContaining({ elementOrder: 0 }),
    )
  })

  it("writes nothing for a scene outside this project", async () => {
    const out = await tool("append_to_scene").run(
      { scene_id: "someone-elses", text: "Added." },
      ctx,
    )
    expect(out).toContain("nothing was written")
    expect(h.createElement).not.toHaveBeenCalled()
  })

  it("writes nothing when the text is blank", async () => {
    await expect(
      tool("append_to_scene").run({ scene_id: "s1", text: "   " }, ctx),
    ).resolves.toBe("Give some text to add.")
    expect(h.createElement).not.toHaveBeenCalled()
  })
})

describe("add_beat", () => {
  it("lays cards out in a grid instead of stacking them at the origin", async () => {
    h.beats = [{}, {}, {}, {}]
    await tool("add_beat").run({ title: "Kettle boils", description: "at last" }, ctx)
    expect(h.createBeat).toHaveBeenCalledWith(
      "proj1",
      expect.objectContaining({
        title: "Kettle boils",
        description: "at last",
        order: 4,
        // Fifth card wraps to the second row of a four-wide grid.
        position: { x: 80, y: 270 },
      }),
    )
  })

  it("asks for a title rather than adding a blank card", async () => {
    await expect(tool("add_beat").run({}, ctx)).resolves.toBe("Give the beat a title.")
    expect(h.createBeat).not.toHaveBeenCalled()
  })
})
