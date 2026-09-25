import { describe, expect, it } from "vitest"
import { buildIwFile, parseIw, serializeIw } from "@/lib/iw/format"
import { pushScene } from "@/lib/storage/local/sync-mappers"
import {
  captureDocumentRevision, DOCUMENT_TEMPLATES, projectFromRevision,
  projectFromTemplate, readDocumentRevisions,
} from "@/lib/editor/document-foundation"
import { writeDocumentMetadata } from "@/lib/editor/document-metadata"
import { writeInlineRuns } from "@/lib/editor/inline-content"
import type { FullProject, Scene } from "@/services/project"

const inline = writeInlineRuns([{ text: "Marked", strong: true }, { text: " line" }])
const scene: Scene = {
  id: "s1", project_id: "p1", scene_heading: "First draft",
  content: writeDocumentMetadata("", { subtitle: "Opening" }), order_index: 0,
  created_at: "", updated_at: "",
  elements: [{ id: "e1", project_id: "p1", scene_id: "s1", element_type: "line", content: inline,
    line_number: 0, formatting: {}, created_at: "", updated_at: "" }],
}

describe("document foundation", () => {
  it("offers reusable presets for poetry, lyrics, and prose", () => {
    expect(new Set(DOCUMENT_TEMPLATES.map((template) => template.category))).toEqual(new Set(["poetry", "lyrics", "prose"]))
    const sonnet = DOCUMENT_TEMPLATES.find((template) => template.id === "sonnet")!
    expect(projectFromTemplate(sonnet).scenes[0].elements.filter((element) => element.type === "line")).toHaveLength(14)
    expect(projectFromTemplate(sonnet).scenes[0].elements.filter((element) => element.type === "stanza_break")).toHaveLength(3)
  })

  it("captures an immutable, named draft and opens it as a separate variant", () => {
    const content = captureDocumentRevision(scene, "Version one", "r1", "2026-09-25T00:00:00Z")
    const revisedScene = { ...scene, content, scene_heading: "Later draft", elements: [] }
    const second = captureDocumentRevision(revisedScene, "Version two", "r2", "2026-09-25T01:00:00Z")
    const revisions = readDocumentRevisions(second)
    expect(revisions).toHaveLength(2)
    expect(revisions[0].heading).toBe("First draft")
    expect(revisions[0].elements[0].content).toBe(inline)
    expect(projectFromRevision(revisions[0]).scenes[0]).toMatchObject({
      heading: "First draft — Version one", elements: [{ type: "line", content: inline }],
    })
    expect(JSON.parse(revisions[0].content).metadata.subtitle).toBe("Opening")
    expect(JSON.parse(revisions[0].content).revisions).toBeUndefined()
    expect(readDocumentRevisions(writeDocumentMetadata(second, { status: "Ready" }))).toHaveLength(2)
  })

  it("retains snapshots in sync and .iw round trips", () => {
    const content = captureDocumentRevision(scene, "Ready", "r1", "2026-09-25T00:00:00Z")
    const project = {
      id: "p1", title: "Poems", description: "", owner_id: "u1", category: "poetry", status: "draft",
      is_starred: false, created_at: "", updated_at: "", scenes: [{ ...scene, content }],
    } as FullProject
    const file = buildIwFile({ project, characters: [], locations: [], beats: [], lanes: [], connections: [], outlineItems: [], exportedAt: "2026-09-25T00:00:00Z" })
    expect(parseIw(serializeIw(file)).scenes[0].content).toBe(content)
    expect(pushScene({ id: "s1", project_id: "p1", scene_heading: "First draft", content, order_index: 0 }).content).toBe(content)
    expect(readDocumentRevisions(content)[0].elements[0].content).toBe(inline)
  })

  it("refuses to alter a newer metadata envelope", () => {
    const future = { ...scene, content: JSON.stringify({ kind: "inkwell.editor.metadata", version: 2 }) }
    expect(() => captureDocumentRevision(future, "Test", "r1", "2026-09-25T00:00:00Z")).toThrow(/newer version/)
  })
})
