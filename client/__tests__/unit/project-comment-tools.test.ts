import { beforeEach, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({ project: vi.fn(), sections: vi.fn(), elements: vi.fn(), list: vi.fn(), add: vi.fn() }))
vi.mock("@/lib/storage/local/projects", () => ({ projects: { getById: h.project } }))
vi.mock("@/lib/storage/local/scenes", () => ({ scenes: { listForProject: h.sections } }))
vi.mock("@/lib/storage/local/elements", () => ({ elements: { listForScene: h.elements } }))
vi.mock("@/lib/storage/local/collaboration", () => ({ collaboration: { listComments: h.list, addComment: h.add } }))
vi.mock("@/lib/storage/local/shared", () => ({ LOCAL_USER_ID: "local" }))

import { addProjectComment, listProjectComments } from "@/lib/storage/local/tools/comments"

const ctx = { projectId: "p", source: "mcp" as const }
beforeEach(() => {
  h.project.mockReset().mockResolvedValue({ id: "p", category: "interactive_fiction" })
  h.sections.mockReset().mockResolvedValue([{ id: "section", scene_heading: "The Gate" }])
  h.elements.mockReset().mockResolvedValue([{ id: "element" }])
  h.list.mockReset().mockResolvedValue([{ id: "c1", content: "TRIGGER", isResolved: false }])
  h.add.mockReset().mockResolvedValue({ id: "c2", content: "Move TRIGGER" })
})

it("lets IF clients read and attach comments to in-project elements", async () => {
  expect(JSON.parse(await listProjectComments.run({}, ctx))).toHaveLength(1)
  expect(await addProjectComment.run({ target_id: "element", content: "Move TRIGGER" }, ctx)).toContain("c2")
  expect(h.add.mock.calls[0][0]).toMatchObject({ projectId: "p", scriptElementId: "element" })
})

it("rejects foreign targets and unrelated project categories", async () => {
  expect(await addProjectComment.run({ target_id: "foreign", content: "No" }, ctx)).toContain("not a section or element")
  h.project.mockResolvedValue({ id: "p", category: "novel" })
  expect(await addProjectComment.run({ target_id: "section", content: "No" }, ctx)).toContain("TTRPG or interactive fiction")
  expect(h.add).not.toHaveBeenCalled()
})
