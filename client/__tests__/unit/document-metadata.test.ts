import { describe, expect, it } from "vitest"

import { buildIwFile, parseIw, serializeIw } from "@/lib/iw/format"
import { documentDiagnostics, readDocumentMetadata, writeDocumentMetadata } from "@/lib/editor/document-metadata"
import { pushScene } from "@/lib/storage/local/sync-mappers"
import type { FullProject } from "@/services/project"

describe("editor document metadata", () => {
  it("preserves legacy scene content and unknown metadata fields across edits", () => {
    const first = writeDocumentMetadata("An older scene note", { subtitle: "First", tags: ["draft"] })
    const futureField = JSON.stringify({ ...JSON.parse(first), metadata: { subtitle: "First", customField: "keep me" } })
    const revised = writeDocumentMetadata(futureField, { subtitle: "Revised" })
    expect(JSON.parse(revised)).toMatchObject({ legacyContent: "An older scene note", metadata: { subtitle: "Revised", customField: "keep me" } })
    expect(readDocumentMetadata(revised).subtitle).toBe("Revised")
  })

  it("flags unsupported metadata without overwriting it", () => {
    const content = JSON.stringify({ kind: "inkwell.editor.metadata", version: 2, metadata: { subtitle: "Future" } })
    expect(documentDiagnostics({ id: "s1", scene_heading: "", content }).map((item) => item.code)).toEqual(["missing-title", "unsupported-metadata"])
    expect(() => writeDocumentMetadata(content, { status: "Ready" })).toThrow(/newer version/)
  })

  it("survives .iw export/import and the scene sync mapper as the same bytes", () => {
    const content = writeDocumentMetadata("", { dedication: "For Ada", pointOfView: "Mara", tags: ["revision"] })
    const project = {
      id: "p1", title: "A Book", description: "", owner_id: "u1", category: "novel", status: "draft",
      is_starred: false, created_at: "", updated_at: "",
      scenes: [{ id: "s1", project_id: "p1", scene_heading: "One", content, order_index: 0, elements: [], created_at: "", updated_at: "" }],
    } as FullProject
    const file = buildIwFile({ project, characters: [], locations: [], beats: [], lanes: [], connections: [], outlineItems: [], exportedAt: "2026-09-25T00:00:00Z" })
    expect(parseIw(serializeIw(file)).scenes[0].content).toBe(content)
    expect(pushScene({ id: "s1", project_id: "p1", scene_heading: "One", content, order_index: 0 }).content).toBe(content)
    expect(readDocumentMetadata(content)).toMatchObject({ dedication: "For Ada", pointOfView: "Mara", tags: ["revision"] })
  })
})
