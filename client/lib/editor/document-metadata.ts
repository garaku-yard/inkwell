/** Semantic metadata for a poem or prose chapter. The scene content column is
 * already carried through local storage, cloud sync, and .iw import/export. */
export const DOCUMENT_METADATA_KIND = "inkwell.editor.metadata"
export const DOCUMENT_METADATA_VERSION = 1

export interface DocumentMetadata {
  subtitle?: string
  synopsis?: string
  pointOfView?: string
  status?: string
  dedication?: string
  epigraph?: string
  tags?: string[]
}

interface MetadataEnvelope {
  kind: typeof DOCUMENT_METADATA_KIND
  version: typeof DOCUMENT_METADATA_VERSION
  metadata: DocumentMetadata
  legacyContent?: string
}

export interface EditorDiagnostic {
  code: string
  severity: "info" | "warning" | "error"
  message: string
  sceneId: string
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

function envelope(content: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(content)
    return isObject(value) && value.kind === DOCUMENT_METADATA_KIND ? value : null
  } catch {
    return null
  }
}

export function readDocumentMetadata(content: string): DocumentMetadata {
  const value = envelope(content)
  if (value?.version !== DOCUMENT_METADATA_VERSION || !isObject(value.metadata)) return {}
  const source = value.metadata
  const result: DocumentMetadata = {}
  for (const field of ["subtitle", "synopsis", "pointOfView", "status", "dedication", "epigraph"] as const) {
    if (typeof source[field] === "string") result[field] = source[field]
  }
  if (Array.isArray(source.tags)) result.tags = source.tags.filter((tag): tag is string => typeof tag === "string")
  return result
}

/** Keeps old scene content and unknown future fields intact when saving. */
export function writeDocumentMetadata(content: string, metadata: DocumentMetadata): string {
  const existing = envelope(content)
  if (existing && existing.version !== DOCUMENT_METADATA_VERSION) {
    throw new Error("This document's metadata was written by a newer version of Inkwell.")
  }
  const next: MetadataEnvelope = {
    ...existing,
    kind: DOCUMENT_METADATA_KIND,
    version: DOCUMENT_METADATA_VERSION,
    metadata: { ...(isObject(existing?.metadata) ? existing.metadata : {}), ...metadata },
    ...(!existing && content ? { legacyContent: content } : {}),
  }
  return JSON.stringify(next)
}

export function documentDiagnostics(scene: { id: string; scene_heading: string; content: string }): EditorDiagnostic[] {
  const diagnostics: EditorDiagnostic[] = []
  if (!scene.scene_heading.trim()) {
    diagnostics.push({ code: "missing-title", severity: "warning", message: "Add a title before submission.", sceneId: scene.id })
  }
  const value = envelope(scene.content)
  if (value && value.version !== DOCUMENT_METADATA_VERSION) {
    diagnostics.push({ code: "unsupported-metadata", severity: "error", message: "This metadata was written by a newer version of Inkwell.", sceneId: scene.id })
  }
  return diagnostics
}
