import { beforeEach, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  getProject: vi.fn(), listScenes: vi.fn(), listElements: vi.fn(), createElement: vi.fn(), updateElement: vi.fn(),
}))
vi.mock("@/lib/storage/local/projects", () => ({ projects: { getById: h.getProject } }))
vi.mock("@/lib/storage/local/scenes", () => ({ scenes: { listForProject: h.listScenes } }))
vi.mock("@/lib/storage/local/elements", () => ({ elements: {
  listForScene: h.listElements, create: h.createElement, update: h.updateElement,
} }))
vi.mock("@/lib/storage/local/shared", () => ({ LOCAL_USER_ID: "local" }))

import { createTtrpgBlock, queryTtrpgBlocks, rollTtrpgTable, updateTtrpgBlock } from "@/lib/storage/local/tools/ttrpg-blocks"

const ctx = { projectId: "p", source: "mcp" as const }
beforeEach(() => {
  h.getProject.mockReset().mockResolvedValue({ id: "p", category: "tabletop_rpg" })
  h.listScenes.mockReset().mockResolvedValue([{ id: "s", scene_heading: "Dome" }])
  h.listElements.mockReset().mockResolvedValue([])
  h.createElement.mockReset().mockImplementation(async (input) => ({ id: "created", ...input }))
  h.updateElement.mockReset()
})

it("creates clocks only inside the current project and checks segment bounds", async () => {
  expect(await createTtrpgBlock.run({ section_id: "foreign", kind: "clock" }, ctx)).toContain("not in this project")
  expect(await createTtrpgBlock.run({ section_id: "s", kind: "clock", segments: 4, filled: 5 }, ctx)).toContain("1–24")
  expect(h.createElement).not.toHaveBeenCalled()
  expect(await createTtrpgBlock.run({ section_id: "s", kind: "clock", name: "Rations", segments: 4, filled: 1 }, ctx)).toContain("created")
  expect(h.createElement.mock.calls[0][0].elementType).toBe("ttrpg_clock")
})

it("updates a block without losing existing fields and queries designer notes", async () => {
  const clock = { id: "clock", element_type: "ttrpg_clock", content: JSON.stringify({ kind: "clock", name: "Rations", segments: 4, filled: 1, note: "On hunger" }) }
  h.listElements.mockResolvedValue([clock, { id: "note", element_type: "callout", content: "Move TRIGGER here" }])
  expect(await updateTtrpgBlock.run({ block_id: "clock", filled: 2 }, ctx)).toContain("Updated")
  expect(JSON.parse(h.updateElement.mock.calls[0][1].content)).toEqual({ kind: "clock", name: "Rations", segments: 4, filled: 2, note: "On hunger" })
  const notes = JSON.parse(await queryTtrpgBlocks.run({ kind: "designer_note" }, ctx))
  expect(notes).toMatchObject([{ id: "note", content: "Move TRIGGER here" }])
})

it("samples a random table and reports a distribution totaling N", async () => {
  h.listElements.mockResolvedValue([{ id: "table", element_type: "dice_table", content: "Result\n---\nA\nB\nC" }])
  const result = JSON.parse(await rollTtrpgTable.run({ block_id: "table", rolls: 200 }, ctx))
  expect(result.rolls).toBe(200)
  expect(result.outcomes).toBe(3)
  expect(result.distribution.reduce((total: number, row: { hits: number }) => total + row.hits, 0)).toBe(200)
})
