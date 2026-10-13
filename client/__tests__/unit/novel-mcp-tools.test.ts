import { beforeEach, describe, expect, it, vi } from "vitest"
import type { FullProject, ProjectElement } from "@/services/project"

const h = vi.hoisted(() => ({ getFull: vi.fn(), listForProject: vi.fn(), listForScene: vi.fn(), createPlaced: vi.fn(), update: vi.fn(), remove: vi.fn() }))
vi.mock("@/lib/storage/local/projects", () => ({ projects: { getFull: h.getFull } }))
vi.mock("@/lib/storage/local/scenes", () => ({ scenes: { listForProject: h.listForProject } }))
vi.mock("@/lib/storage/local/elements", () => ({ elements: { listForScene: h.listForScene, update: h.update, delete: h.remove } }))
vi.mock("@/lib/storage/local/tools/ttrpg-placement", () => ({ createPlacedTtrpgElement: h.createPlaced }))

import { createNovelBlock, exportNovelHtmlTool, listNovelBlocks, moveNovelStep, readNovelBlock, updateNovelBlock } from "@/lib/storage/local/tools/novel-blocks"

const ctx = { projectId: "p1", source: "mcp" as const }
const element = (id: string, kind: string, content: object, line_number: number): ProjectElement => ({
  id, project_id: "p1", scene_id: "s1", element_type: kind, content: JSON.stringify(content), line_number,
  formatting: {}, created_at: "", updated_at: "",
})
let project: FullProject

beforeEach(() => {
  project = {
    id: "p1", title: "Builds", description: "", owner_id: "u", category: "novel", status: "draft", is_starred: false, created_at: "", updated_at: "",
    scenes: [{ id: "s1", project_id: "p1", scene_heading: "Workshop", content: "", order_index: 0, created_at: "", updated_at: "", elements: [
      element("f1", "figure", { kind: "figure", caption: "Clamp", alt: "", image: "" }, 0),
      element("s1", "step", { kind: "step", title: "Cut", body: "First", image: "" }, 1),
      element("s2", "step", { kind: "step", title: "Join", body: "Second", image: "" }, 2),
    ] }],
  }
  h.getFull.mockReset().mockImplementation(async () => project)
  h.listForProject.mockReset().mockImplementation(async () => project.scenes)
  h.listForScene.mockReset().mockImplementation(async () => project.scenes![0].elements)
  h.createPlaced.mockReset().mockImplementation(async (_projectId, _sectionId, kind, content) => ({ id: "new", element_type: kind, content }))
  h.update.mockReset().mockImplementation(async (id: string, patch: { content: string }) => {
    const target = project.scenes![0].elements!.find(item => item.id === id)!
    target.content = patch.content
    return target
  })
})

describe("novel MCP tools", () => {
  it("creates typed blocks and lists current numbers", async () => {
    expect(await createNovelBlock.run({ section_id: "s1", kind: "cross_reference", target_type: "figure", target_id: "f1" }, ctx)).toContain("stable id is new")
    expect(h.createPlaced).toHaveBeenCalledWith("p1", "s1", "cross_reference", expect.stringContaining('"targetId":"f1"'), expect.any(Array), "")
    const listed = JSON.parse(await listNovelBlocks.run({}, ctx)) as Array<{ id: string; label: string }>
    expect(listed.find(item => item.id === "f1")?.label).toBe("Fig 1.1")
    expect(listed.find(item => item.id === "s2")?.label).toBe("Step 2")
    expect(JSON.parse(await readNovelBlock.run({ block_id: "f1" }, ctx))).toMatchObject({ label: "Fig 1.1", caption: "Clamp" })
  })

  it("moves steps and exports resolved A6 HTML", async () => {
    expect(await moveNovelStep.run({ block_id: "s2", direction: "up" }, ctx)).toContain("Moved step up")
    expect(JSON.parse(project.scenes![0].elements![1].content).title).toBe("Join")
    const html = await exportNovelHtmlTool.run({ page_size: "a6" }, ctx)
    expect(html).toContain("@page { size: A6")
    expect(html).toContain("Step 1: Join")
    expect(html).toContain("Fig 1.1. Clamp")
  })

  it("rejects an invalid image and edits a figure by stable ID", async () => {
    expect(await updateNovelBlock.run({ block_id: "f1", image_data_url: "https://example.com/x.png" }, ctx)).toContain("data URL")
    expect(await updateNovelBlock.run({ block_id: "f1", caption: "New caption" }, ctx)).toContain("Updated figure")
    expect(JSON.parse(project.scenes![0].elements![0].content).caption).toBe("New caption")
  })

  it("creates glossary and index entries through the MCP schema", async () => {
    expect(await createNovelBlock.run({ section_id: "s1", kind: "glossary", entries: [{ term: "Awl", definition: "Pointed tool" }] }, ctx)).toContain("Created glossary")
    expect(h.createPlaced).toHaveBeenCalledWith("p1", "s1", "glossary", expect.stringContaining('"term":"Awl"'), expect.any(Array), "")
    expect(await createNovelBlock.run({ section_id: "s1", kind: "index", entries: [{ term: "Clamp", targetType: "figure", targetId: "f1" }] }, ctx)).toContain("Created index")
    expect(await createNovelBlock.run({ section_id: "s1", kind: "index", entries: [{ term: "Lost", targetType: "figure", targetId: "missing" }] }, ctx)).toContain("Every target ID")
  })
})
