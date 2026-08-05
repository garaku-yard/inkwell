/**
 * What a scene's body looks like in each format.
 *
 * A scene is stored as a row per element, and the element type is the
 * format's own vocabulary: a novel's body is a `paragraph`, a screenplay's is
 * `ACTION` (upper case, as the screenplay editor writes it), a poem's is a
 * `line`, a comic's is a `panel`. Text written by a tool has to land in that
 * vocabulary or the editor renders it as the wrong thing.
 *
 * This mirrors what the import parsers in `lib/import/*` produce — they each
 * hard-code their own format's types on the reading side. It is deliberately
 * a table and not a lookup into those parsers: they turn a whole document
 * into headings, breaks and sub-types, whereas a tool writing running text
 * needs one plain body type and a rule for dividing it.
 */

import type { ProjectCategory } from "@/services/project"

export interface FormatShape {
  /** `element_type` for a plain body element in this format. */
  body: string
  /** How running text divides into elements: verse is written a line at a
   *  time, prose a paragraph at a time. */
  split: "paragraph" | "line"
}

/** Formats whose projects hold scenes. `vault` (notes on disk) and `board`
 *  (a bare beat canvas) have none, so they are absent rather than guessed at. */
const SHAPES: Partial<Record<ProjectCategory, FormatShape>> = {
  novel: { body: "paragraph", split: "paragraph" },
  memoir: { body: "paragraph", split: "paragraph" },
  screenplay: { body: "ACTION", split: "paragraph" },
  comic_script: { body: "panel", split: "paragraph" },
  poetry: { body: "line", split: "line" },
  lyrics: { body: "line", split: "line" },
  interactive_fiction: { body: "body", split: "paragraph" },
  tabletop_rpg: { body: "body", split: "paragraph" },
}

/** The scene shape for a project category, or null when the format has no
 *  scenes to write into. */
export function shapeOf(category: string): FormatShape | null {
  return SHAPES[category as ProjectCategory] ?? null
}

/** Divides written text into the elements this format stores it as. Blank
 *  lines separate paragraphs; in verse every line stands alone, blank ones
 *  dropped rather than persisted as empty rows. */
export function splitBody(text: string, shape: FormatShape): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim()
  if (!normalized) return []
  const parts =
    shape.split === "line" ? normalized.split("\n") : normalized.split(/\n\s*\n/)
  return parts.map((part) => part.trim()).filter((part) => part.length > 0)
}
