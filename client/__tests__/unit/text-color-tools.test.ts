import { beforeEach, describe, expect, it, vi } from "vitest"
import { plainInlineText, readInlineRuns } from "@/lib/editor/inline-content"
import type { FullProject } from "@/services/project"

const h = vi.hoisted(() => ({ getFull: vi.fn(), updateElement: vi.fn(), updateHeading: vi.fn(), listNotes: vi.fn(), readNote: vi.fn(), writeNote: vi.fn() }))
vi.mock("@/lib/storage/local/projects", () => ({ projects: { getFull: h.getFull } }))
vi.mock("@/lib/storage/local/elements", () => ({ elements: { update: h.updateElement } }))
vi.mock("@/lib/storage/local/scenes", () => ({ scenes: { updateHeading: h.updateHeading } }))
vi.mock("@/lib/storage/local/vault", () => ({ vault: { listNotes: h.listNotes, readNote: h.readNote, writeNote: h.writeNote } }))

import { setTextColor } from "@/lib/storage/local/tools/text-color"

const ctx = { projectId: "p", source: "mcp" as const }
const project = {
  id: "p", title: "Book", category: "novel", scenes: [{ id: "s", scene_heading: "One", elements: [
    { id: "e", scene_id: "s", element_type: "paragraph", content: "The red door", line_number: 0 },
  ] }],
} as FullProject

beforeEach(() => {
  h.getFull.mockReset().mockResolvedValue(project)
  h.updateElement.mockReset()
  h.listNotes.mockReset().mockResolvedValue([{ filename: "one.md" }])
  h.readNote.mockReset().mockResolvedValue("The red door")
  h.writeNote.mockReset()
})

describe("text color MCP tool", () => {
  it("colors only the requested visible words and validates the range", async () => {
    expect(await setTextColor.run({ element_id: "e", start: 4, end: 7, color: "#aa2233" }, ctx)).toContain("Updated text color")
    const saved = h.updateElement.mock.calls[0][1].content as string
    expect(plainInlineText(saved)).toBe("The red door")
    expect(readInlineRuns(saved)[1]).toMatchObject({ text: "red", color: "#aa2233" })
    expect(await setTextColor.run({ element_id: "e", start: 4, end: 99, color: "#aa2233" }, ctx)).toContain("range")
    expect(await setTextColor.run({ element_id: "e", start: 4, end: 7, color: "red;display:none" }, ctx)).toContain("valid")
  })

  it("colors Vault Markdown through the same MCP capability", async () => {
    h.getFull.mockResolvedValue({ ...project, category: "vault" })
    expect(await setTextColor.run({ filename: "one.md", start: 4, end: 7, color: "#336699" }, ctx)).toContain("Updated text color")
    expect(h.writeNote).toHaveBeenCalledWith("p", "one.md", 'The <span style="color:#336699">red</span> door')
  })
})
