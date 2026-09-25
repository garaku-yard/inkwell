import type { ParsedProject, ParsedScene } from "@/lib/import/types"
import type { Scene } from "@/services/project"
import { DOCUMENT_METADATA_KIND, DOCUMENT_METADATA_VERSION } from "./document-metadata"

export interface DocumentTemplate {
  id: string
  label: string
  description: string
  category: "poetry" | "lyrics" | "prose"
  heading: string
  elements: ParsedScene["elements"]
}

/** Templates create ordinary scenes and elements, so their output uses the
 * same local, hosted, sync, and .iw paths as content written by hand. */
export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: "free-verse", label: "Free verse", description: "An open poem with two stanzas.",
    category: "poetry", heading: "Untitled poem",
    elements: [{ type: "line", content: "" }, { type: "stanza_break", content: "" }, { type: "line", content: "" }],
  },
  {
    id: "sonnet", label: "Sonnet draft", description: "Fourteen lines in three quatrains and a couplet.",
    category: "poetry", heading: "Untitled sonnet",
    elements: Array.from({ length: 14 }, (_, index) => [
      ...(index === 4 || index === 8 || index === 12 ? [{ type: "stanza_break", content: "" }] : []),
      { type: "line", content: "" },
    ]).flat(),
  },
  {
    id: "song", label: "Song draft", description: "Verse and chorus sections ready for lyrics and chords.",
    category: "lyrics", heading: "Untitled song",
    elements: [
      { type: "section_label", content: "Verse 1" }, { type: "line", content: "" },
      { type: "section_label", content: "Chorus" }, { type: "chord_row", content: "" }, { type: "line", content: "" },
    ],
  },
  {
    id: "chapter", label: "Chapter draft", description: "A chapter with an opening paragraph and section break.",
    category: "prose", heading: "Untitled chapter",
    elements: [{ type: "paragraph", content: "" }, { type: "scene_break", content: "* * *" }, { type: "paragraph", content: "" }],
  },
  {
    id: "scene", label: "Scene draft", description: "A scene opener with prose and dialogue.",
    category: "prose", heading: "Untitled scene",
    elements: [{ type: "scene_heading_stinger", content: "" }, { type: "paragraph", content: "" }, { type: "dialogue", content: "" }],
  },
]

export function projectFromTemplate(template: DocumentTemplate): ParsedProject {
  return {
    title: template.heading,
    scenes: [{ heading: template.heading, elements: template.elements.map((element) => ({ ...element })) }],
  }
}

export interface DocumentRevision {
  id: string
  label: string
  createdAt: string
  heading: string
  /** Scene metadata at capture time, without revisions to avoid recursive growth. */
  content: string
  elements: ParsedScene["elements"]
}

function metadataEnvelope(content: string): Record<string, unknown> {
  let value: unknown
  try { value = JSON.parse(content) } catch { /* legacy plain content */ }
  if (value && typeof value === "object" && !Array.isArray(value) &&
    (value as Record<string, unknown>).kind === DOCUMENT_METADATA_KIND) {
    const envelope = value as Record<string, unknown>
    if (envelope.version !== DOCUMENT_METADATA_VERSION) {
      throw new Error("This document was written by a newer version of Inkwell.")
    }
    return envelope
  }
  return {
    kind: DOCUMENT_METADATA_KIND,
    version: DOCUMENT_METADATA_VERSION,
    metadata: {},
    ...(content ? { legacyContent: content } : {}),
  }
}

export function readDocumentRevisions(content: string): DocumentRevision[] {
  let value: Record<string, unknown>
  try { value = metadataEnvelope(content) } catch { return [] }
  if (!Array.isArray(value.revisions)) return []
  return value.revisions.filter((item): item is DocumentRevision => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false
    const revision = item as Record<string, unknown>
    return typeof revision.id === "string" && typeof revision.label === "string" &&
      typeof revision.createdAt === "string" && typeof revision.heading === "string" &&
      typeof revision.content === "string" && Array.isArray(revision.elements) &&
      revision.elements.every((element: unknown) => element !== null && typeof element === "object" &&
        typeof (element as Record<string, unknown>).type === "string" &&
        typeof (element as Record<string, unknown>).content === "string")
  })
}

export function captureDocumentRevision(scene: Scene, label: string, id: string, createdAt: string): string {
  const envelope = metadataEnvelope(scene.content)
  const contentWithoutRevisions = { ...envelope }
  delete contentWithoutRevisions.revisions
  const revision: DocumentRevision = {
    id, label: label.trim() || "Revision", createdAt,
    heading: scene.scene_heading,
    content: JSON.stringify(contentWithoutRevisions),
    elements: [...(scene.elements ?? [])]
      .sort((a, b) => a.line_number - b.line_number)
      .map((element) => ({ type: element.element_type, content: element.content })),
  }
  return JSON.stringify({ ...envelope, revisions: [...readDocumentRevisions(scene.content), revision] })
}

/** Opening a snapshot as a new scene leaves the current draft untouched. */
export function projectFromRevision(revision: DocumentRevision): ParsedProject {
  return {
    title: revision.heading,
    scenes: [{
      heading: `${revision.heading || "Untitled"} — ${revision.label}`,
      content: revision.content,
      elements: revision.elements.map((element) => ({ ...element })),
    }],
  }
}
