import { beforeEach, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  getProject: vi.fn(), listScenes: vi.fn(), listElements: vi.fn(), createElement: vi.fn(), updateElement: vi.fn(), deleteElement: vi.fn(),
  execute: vi.fn(), markDirty: vi.fn(), recordUndo: vi.fn(),
}))
vi.mock("@/lib/storage/local/projects", () => ({ projects: { getById: h.getProject } }))
vi.mock("@/lib/storage/local/scenes", () => ({ scenes: { listForProject: h.listScenes } }))
vi.mock("@/lib/storage/local/elements", () => ({ elements: {
  listForScene: h.listElements, create: h.createElement, update: h.updateElement, delete: h.deleteElement,
} }))
vi.mock("@/lib/storage/local/shared", () => ({ LOCAL_USER_ID: "local", getDb: async () => ({ execute: h.execute }), markDirty: h.markDirty, now: () => "now" }))
vi.mock("@/lib/storage/local/tools/undo", () => ({ recordUndo: h.recordUndo }))

import { createTtrpgBlock, deleteTtrpgBlock, queryTtrpgBlocks, rollTtrpgTable, updateTtrpgBlock } from "@/lib/storage/local/tools/ttrpg-blocks"

const ctx = { projectId: "p", source: "mcp" as const }
beforeEach(() => {
  h.getProject.mockReset().mockResolvedValue({ id: "p", title: "Attractor", category: "tabletop_rpg" })
  h.listScenes.mockReset().mockResolvedValue([{ id: "s", scene_heading: "Dome" }])
  h.listElements.mockReset().mockResolvedValue([])
  h.createElement.mockReset().mockImplementation(async (input) => ({ id: "created", ...input }))
  h.updateElement.mockReset()
  h.deleteElement.mockReset()
  h.execute.mockReset()
  h.markDirty.mockReset()
  h.recordUndo.mockReset()
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

it("combines repeated outcomes as weights in the roll report", async () => {
  h.listElements.mockResolvedValue([{ id: "table", element_type: "dice_table", content: "Result\n---\nCommon\nCommon\nRare" }])
  const result = JSON.parse(await rollTtrpgTable.run({ block_id: "table", rolls: 100 }, ctx))
  expect(result.outcomes).toBe(2)
  expect(result.distribution).toEqual(expect.arrayContaining([
    expect.objectContaining({ result: "Common", weight: 2, expected_percent: 66.67 }),
    expect.objectContaining({ result: "Rare", weight: 1, expected_percent: 33.33 }),
  ]))
  expect(result.distribution.reduce((total: number, row: { hits: number }) => total + row.hits, 0)).toBe(100)
})

it("creates and edits tables, weighted outcomes, notes, and rules", async () => {
  expect(await createTtrpgBlock.run({ section_id: "s", kind: "table", content: "Day | Event\n--- | ---\n1 | Arrival" }, ctx)).toContain("Created")
  expect(h.createElement.mock.calls.at(-1)?.[0]).toMatchObject({ elementType: "table", content: "Day | Event\n--- | ---\n1 | Arrival" })
  expect(await createTtrpgBlock.run({ section_id: "s", kind: "random_table", rows: [
    { result: "Common", weight: 3 }, { result: "Rare", weight: 1 },
  ] }, ctx)).toContain("Created")
  expect(h.createElement.mock.calls.at(-1)?.[0]).toMatchObject({ elementType: "dice_table", content: "Weight | Result\n--- | ---\n3 | Common\n1 | Rare" })
  expect(await createTtrpgBlock.run({ section_id: "s", kind: "random_table", rows: [{ result: "Invalid", weight: 0 }] }, ctx)).toContain("valid random-table")
  for (const [kind, type] of [["designer_note", "callout"], ["rule_box", "rule_box"]]) {
    expect(await createTtrpgBlock.run({ section_id: "s", kind, content: "Important text" }, ctx)).toContain("Created")
    expect(h.createElement.mock.calls.at(-1)?.[0].elementType).toBe(type)
  }
  h.listElements.mockResolvedValue([{ id: "table", element_type: "dice_table", content: "Result\n---\nOld" }])
  expect(await updateTtrpgBlock.run({ block_id: "table", rows: [{ result: "New", weight: 5 }] }, ctx)).toContain("Updated")
  expect(h.updateElement.mock.calls.at(-1)?.[1].content).toContain("5 | New")
})

it("places a new block after an ID in the selected section and marks shifted rows dirty", async () => {
  h.listElements.mockResolvedValue([
    { id: "first", line_number: 0 }, { id: "second", line_number: 1 }, { id: "third", line_number: 2 },
  ])
  expect(await createTtrpgBlock.run({ section_id: "s", after_block_id: "foreign", kind: "designer_note", content: "Note" }, ctx)).toContain("chosen section")
  expect(h.execute).not.toHaveBeenCalled()
  expect(await createTtrpgBlock.run({ section_id: "s", after_block_id: "first", kind: "designer_note", content: "Note" }, ctx)).toContain("Created")
  expect(h.execute).toHaveBeenCalledTimes(2)
  expect(h.markDirty).toHaveBeenCalledTimes(2)
  expect(h.createElement.mock.calls.at(-1)?.[0].elementOrder).toBe(1)
})

it("deletes only an owned TTRPG block and records an undo", async () => {
  h.listElements.mockResolvedValue([{ id: "rule", element_type: "rule_box", content: "No air", line_number: 0 }])
  expect(await deleteTtrpgBlock.run({ block_id: "foreign" }, ctx)).toContain("Nothing was deleted")
  expect(h.deleteElement).not.toHaveBeenCalled()
  expect(await deleteTtrpgBlock.run({ block_id: "rule" }, ctx)).toContain("Deleted")
  expect(h.deleteElement).toHaveBeenCalledWith("rule")
  expect(h.recordUndo).toHaveBeenCalledWith(expect.objectContaining({ restoreElementIds: ["rule"] }))
})

it("links to a passage in another accessible project by stable ID", async () => {
  h.getProject.mockImplementation(async (id) => id === "script"
    ? { id, title: "Script", category: "interactive_fiction" }
    : { id, title: "Attractor", category: "tabletop_rpg" })
  h.listScenes.mockImplementation(async (id) => id === "script"
    ? [{ id: "autopsy", scene_heading: "Liner Seep Autopsy" }]
    : [{ id: "s", scene_heading: "Dome" }])
  expect(await createTtrpgBlock.run({ section_id: "s", kind: "cross_reference", targetProjectId: "script", targetId: "autopsy" }, ctx)).toContain("Created")
  expect(JSON.parse(h.createElement.mock.calls.at(-1)?.[0].content)).toMatchObject({
    targetProjectId: "script", targetId: "autopsy", label: "Script / Liner Seep Autopsy",
  })
  h.listScenes.mockImplementation(async (id) => id === "script"
    ? [{ id: "autopsy", scene_heading: "Renamed Autopsy" }]
    : [{ id: "s", scene_heading: "Dome" }])
  h.listElements.mockImplementation(async (id) => id === "s" ? [{ id: "ref", element_type: "ttrpg_cross_reference",
    content: h.createElement.mock.calls.at(-1)?.[0].content }] : [])
  const references = JSON.parse(await queryTtrpgBlocks.run({ kind: "cross_reference" }, ctx))
  expect(references[0]).toMatchObject({ target_label: "Script / Renamed Autopsy", target_status: "ok" })
  expect(await createTtrpgBlock.run({ section_id: "s", kind: "cross_reference", targetProjectId: "script", targetId: "missing" }, ctx)).toContain("targetId must identify")
})
