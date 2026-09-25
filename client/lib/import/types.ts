/**
 * Shared shape every format importer produces. Mirrors the universal
 * project → scenes → elements structure so one orchestrator
 * ({@link importIntoProject} / {@link importAsProject}) can persist any
 * parsed document regardless of which format it came from.
 */

/** One element within a scene — `type` is the editor's element-type vocabulary
 *  (e.g. "paragraph", "body", "choice"), `content` its text. */
export interface ParsedElement {
  type: string
  content: string
}

/** One scene/chapter/page/passage with its ordered elements. */
export interface ParsedScene {
  heading: string
  /** Optional scene-level metadata. Interactive Fiction stores passage tags,
   * color, variable definitions, and test states here. */
  content?: string
  elements: ParsedElement[]
}

/** A whole parsed document, ready to persist. */
export interface ParsedProject {
  title: string
  scenes: ParsedScene[]
}
