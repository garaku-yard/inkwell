import { beforeEach, describe, expect, it, vi } from "vitest"

import { parseTriggerBlock } from "@/lib/interactive-fiction/runtime"

const h = vi.hoisted(() => ({ category: "interactive_fiction", listPassages: vi.fn(), listElements: vi.fn(), createElement: vi.fn() }))

vi.mock("@/lib/storage/local/projects", () => ({
  projects: { getById: async () => ({ id: "p1", category: h.category }) },
}))
vi.mock("@/lib/storage/local/scenes", () => ({ scenes: { listForProject: h.listPassages } }))
vi.mock("@/lib/storage/local/elements", () => ({ elements: { listForScene: h.listElements, create: h.createElement } }))

import { createIfTrigger } from "@/lib/storage/local/tools/if-triggers"

const ctx = { projectId: "p1", source: "mcp" as const }

beforeEach(() => {
  h.category = "interactive_fiction"
  h.listPassages.mockReset().mockResolvedValue([{ id: "start", scene_heading: "Start" }])
  h.listElements.mockReset().mockResolvedValue([{ id: "body", element_type: "body", content: "Wake up.", line_number: 2 }])
  h.createElement.mockReset().mockImplementation(async (input) => ({ id: "trigger-1", ...input }))
})

describe("Interactive Fiction trigger MCP tool", () => {
  it("creates a structured executable trigger with ordered actions", async () => {
    const result = await createIfTrigger.run({
      passage_id: "start",
      event: "run.start",
      label: "Begin the run",
      note: "After the opening line",
      once: false,
      actions: [
        { kind: "reveal", content: "The pumps wake." },
        { kind: "set", content: "{set $running:boolean to true}" },
        { kind: "conditional", content: "{if $running: [[Listen -> Briefing]]}" },
      ],
    }, ctx)

    expect(result).toContain("Created event “Begin the run” (run.start)")
    expect(h.createElement).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "p1", sceneId: "start", elementOrder: 3, elementType: "trigger",
    }))
    const content = h.createElement.mock.calls[0][0].content as string
    expect(parseTriggerBlock(content)).toMatchObject({
      event: "run.start",
      label: "Begin the run",
      once: false,
      actions: [
        { id: "action-1", kind: "reveal", content: "The pumps wake." },
        { id: "action-2", kind: "set", content: "{set $running:boolean to true}" },
        { id: "action-3", kind: "conditional", content: "{if $running: [[Listen -> Briefing]]}" },
      ],
    })
  })

  it("derives an event name and rejects incomplete or duplicate events", async () => {
    expect(await createIfTrigger.run({
      passage_id: "start", label: "First Pour", actions: [{ kind: "reveal", content: "Water moves." }],
    }, ctx)).toContain("(first_pour)")

    expect(await createIfTrigger.run({
      passage_id: "start", label: "Broken", actions: [{ kind: "reveal", content: "" }],
    }, ctx)).toBe("Action 1 needs content.")

    const priorContent = h.createElement.mock.calls[0][0].content as string
    h.listElements.mockResolvedValue([{ id: "prior", element_type: "trigger", content: priorContent, line_number: 0 }])
    expect(await createIfTrigger.run({
      passage_id: "start", label: "First Pour", actions: [{ kind: "reveal", content: "Again." }],
    }, ctx)).toContain("already has an event")
  })

  it("refuses non-IF projects and invalid executable syntax", async () => {
    h.category = "novel"
    await expect(createIfTrigger.run({ passage_id: "start", label: "No", actions: [{ kind: "reveal", content: "No" }] }, ctx))
      .resolves.toBe("Choose an Interactive Fiction project first.")

    h.category = "interactive_fiction"
    await expect(createIfTrigger.run({ passage_id: "start", label: "Broken", actions: [{ kind: "set", content: "set x" }] }, ctx))
      .resolves.toContain("Expected {set")
  })
})
