import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  project: { id: "p1", category: "tabletop_rpg", ttrpg_stat_schemas: [] as unknown[] },
  getById: vi.fn(), updateProject: vi.fn(), listScenes: vi.fn(),
  listElements: vi.fn(), createElement: vi.fn(), updateElement: vi.fn(),
}))

vi.mock("@/lib/storage/local/projects", () => ({ projects: { getById: h.getById, update: h.updateProject } }))
vi.mock("@/lib/storage/local/scenes", () => ({ scenes: { listForProject: h.listScenes } }))
vi.mock("@/lib/storage/local/elements", () => ({ elements: {
  listForScene: h.listElements, create: h.createElement, update: h.updateElement,
} }))
vi.mock("@/lib/storage/local/shared", () => {
  let next = 0
  return { LOCAL_USER_ID: "local", newId: () => `new-id-${++next}` }
})

import { createTtrpgStatBlock, listStatSchemas, listTtrpgStatBlocks, saveStatSchema, updateTtrpgStatBlock } from "@/lib/storage/local/tools/ttrpg-stats"
import { parseStatInstance, parseStatSchemas, validateStatInstance } from "@/lib/ttrpg/stat-schemas"

const ctx = { projectId: "p1", source: "mcp" as const }

beforeEach(() => {
  h.project.category = "tabletop_rpg"
  h.project.ttrpg_stat_schemas = []
  h.getById.mockReset().mockImplementation(async () => h.project)
  h.updateProject.mockReset().mockImplementation(async (_id, _user, patch) => {
    h.project.ttrpg_stat_schemas = patch.ttrpg_stat_schemas
    return h.project
  })
  h.listScenes.mockReset().mockResolvedValue([{ id: "s1", scene_heading: "Dome", order_index: 0 }])
  h.listElements.mockReset().mockResolvedValue([])
  h.createElement.mockReset().mockImplementation(async (input) => ({ id: "e1", element_type: input.elementType,
    content: input.content, line_number: input.elementOrder }))
  h.updateElement.mockReset()
})

describe("project stat schemas", () => {
  it("creates a discoverable schema with stable field IDs", async () => {
    const saved = JSON.parse(await saveStatSchema.run({ name: "Fault", fields: [
      { label: "Trigger", kind: "text" },
      { label: "Status", kind: "choice", options: ["draft", "designed"] },
    ] }, ctx))
    expect(saved.id).toMatch(/^new-id-/)
    expect(saved.fields[0].id).toBeTruthy()
    expect(JSON.parse(await listStatSchemas.run({}, ctx))).toEqual([saved])
    const renamed = JSON.parse(await saveStatSchema.run({ schema_id: saved.id, name: "Fault", fields: [
      { id: saved.fields[0].id, label: "Activation trigger", kind: "text" },
      { id: saved.fields[1].id, label: "Status", kind: "choice", options: ["draft", "designed"] },
    ] }, ctx))
    expect(renamed.fields[0].id).toBe(saved.fields[0].id)
  })

  it("rejects invalid choices and writes outside TTRPG", async () => {
    expect(await saveStatSchema.run({ name: "Fault", fields: [
      { label: "Status", kind: "choice", options: [] },
    ] }, ctx)).toContain("needs choice options")
    h.project.category = "novel"
    expect(await saveStatSchema.run({ name: "Fault", fields: [] }, ctx)).toContain("tabletop RPG")
    expect(h.updateProject).not.toHaveBeenCalled()
  })
})

describe("structured stat blocks", () => {
  const fault = { id: "fault", name: "Fault", fields: [
    { id: "trigger", label: "Trigger", kind: "text" },
    { id: "status", label: "Status", kind: "choice", options: ["draft", "designed"] },
  ] }

  beforeEach(() => { h.project.ttrpg_stat_schemas = [fault] })

  it("creates a typed element and queries by schema and field", async () => {
    const result = await createTtrpgStatBlock.run({ section_id: "s1", schema_id: "fault", name: "Liner Seep",
      values: { Trigger: "Pressure drop", Status: "designed" } }, ctx)
    expect(result).toContain("e1")
    const input = h.createElement.mock.calls[0][0]
    expect(input.elementType).toBe("ttrpg_stat")
    expect(parseStatInstance(input.content)).toEqual({ schemaId: "fault", name: "Liner Seep",
      values: { trigger: "Pressure drop", status: "designed" } })
    h.listElements.mockResolvedValue([{ id: "e1", element_type: "ttrpg_stat", content: input.content }])
    const found = JSON.parse(await listTtrpgStatBlocks.run({ schema: "Fault", field: "Status", equals: "designed" }, ctx))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ id: "e1", section_id: "s1", name: "Liner Seep" })
  })

  it("rejects a foreign section and an invalid field value without writing", async () => {
    expect(await createTtrpgStatBlock.run({ section_id: "foreign", schema_id: "fault", name: "Bad" }, ctx))
      .toContain("not in this project")
    expect(await createTtrpgStatBlock.run({ section_id: "s1", schema_id: "fault", name: "Bad",
      values: { Status: "unknown" } }, ctx)).toContain("must be one of")
    expect(h.createElement).not.toHaveBeenCalled()
  })

  it("patches only requested fields of a block in this project", async () => {
    h.listElements.mockResolvedValue([{ id: "e1", element_type: "ttrpg_stat", content: JSON.stringify({
      schemaId: "fault", name: "Liner Seep", values: { trigger: "Pressure drop", status: "draft" },
    }) }])
    expect(await updateTtrpgStatBlock.run({ block_id: "e1", values: { Status: "designed" } }, ctx))
      .toContain("Updated")
    const after = parseStatInstance(h.updateElement.mock.calls[0][1].content)
    expect(after?.values).toEqual({ trigger: "Pressure drop", status: "designed" })
  })
})

it("preserves legacy freeform blocks and rejects malformed structured data", () => {
  expect(parseStatInstance("Name\nAC 12")).toBeNull()
  expect(parseStatSchemas("garbled")).toEqual([])
  expect(validateStatInstance({ schemaId: "n", name: "A", values: { days: "oops" } },
    { id: "n", name: "System", fields: [{ id: "days", label: "Days", kind: "number" }] })).toContain("must be a number")
})
