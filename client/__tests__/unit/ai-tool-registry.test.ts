import { describe, expect, it, vi, beforeEach } from "vitest"

// The registry's handlers reach SQLite through the local storage modules,
// which only resolve inside a Tauri webview — stub the one this tool uses.
const h = vi.hoisted(() => ({
  readNoteSpy: vi.fn(async (_projectId: string, title: string) =>
    title === "Cats"
      ? { title: "Cats", filename: "Cats.md", content: "Cats are independent." }
      : null,
  ),
}))

vi.mock("@/lib/storage/local/knowledge", () => ({
  knowledge: { readNoteForTool: h.readNoteSpy },
}))

import { findTool, parseToolArgs, TOOL_SPECS } from "@/lib/storage/local/tools"

describe("tool registry", () => {
  beforeEach(() => h.readNoteSpy.mockClear())

  it("declares every registered tool, and each spec resolves back to its entry", () => {
    expect(TOOL_SPECS.map((s) => s.name)).toContain("read_note")
    for (const spec of TOOL_SPECS) {
      expect(findTool(spec.name)?.spec).toBe(spec)
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
})

describe("read_note", () => {
  const tool = findTool("read_note")!

  beforeEach(() => h.readNoteSpy.mockClear())

  it("reads without writing, so it needs no confirmation", () => {
    expect(tool.mutates).toBe(false)
  })

  it("returns the note body, scoped to the calling project", async () => {
    const args = { title: "Cats" }
    expect(tool.summarize(args)).toBe("Cats")
    await expect(tool.run(args, { projectId: "proj1" })).resolves.toBe(
      "Cats are independent.",
    )
    expect(h.readNoteSpy).toHaveBeenCalledWith("proj1", "Cats")
  })

  it("tells the model when nothing in scope matches, rather than throwing", async () => {
    await expect(tool.run({ title: "Dogs" }, { projectId: "proj1" })).resolves.toContain(
      'No note titled "Dogs"',
    )
  })

  it("survives a missing or mistyped title", async () => {
    expect(tool.summarize({ title: 42 })).toBe("")
    await expect(tool.run({}, { projectId: "proj1" })).resolves.toContain(
      'No note titled ""',
    )
    expect(h.readNoteSpy).toHaveBeenCalledWith("proj1", "")
  })
})
