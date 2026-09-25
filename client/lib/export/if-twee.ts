/**
 * Twee 3 exporter for Interactive Fiction projects. Twee is the
 * source-text format that drives Twine compilers (Tweego, Twee2,
 * Chapbook, SugarCube): each passage is a `:: Name [tags]` header
 * followed by the body, with passages separated by a blank line.
 * The format is plain UTF-8 — no zip, no XML — which makes it ideal
 * as an interchange format with the wider Twine ecosystem.
 *
 * Reference: https://github.com/iftechfoundation/twine-specs/blob/master/twee-3-specification.md
 */

import type { FullProject } from "@/services/project"
import {
  compileElementToSugarCube,
  parsePassageMetadata,
} from "@/lib/interactive-fiction/runtime"

/** Wrap a tag set in the `[tag1 tag2]` form Twee expects. Tags with
 *  spaces are quoted because Twee treats whitespace as the separator. */
function formatTags(tags: string[]): string {
  if (tags.length === 0) return ""
  const escaped = tags.map((t) => (/\s/.test(t) ? `"${t}"` : t))
  return ` [${escaped.join(" ")}]`
}

/** Escape passage names that contain Twee meta characters (`:`, `[`,
 *  `]`, `{`, `}`). The spec allows backslash-escapes inside the
 *  header; the body is plain text. */
function escapeName(name: string): string {
  return name.replace(/([\\:[\]{}])/g, "\\$1")
}

function stableIFID(project: FullProject): string {
  const compact = project.id.replace(/[^a-f0-9]/gi, "").toUpperCase()
  if (compact.length >= 32) return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20, 32)}`
  let a = 0x811c9dc5
  let b = 0x9e3779b9
  for (const ch of `${project.id}:${project.title}`) {
    a = Math.imul(a ^ ch.charCodeAt(0), 0x01000193) >>> 0
    b = Math.imul(b ^ ch.charCodeAt(0), 0x85ebca6b) >>> 0
  }
  const hex = `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}${((a ^ b) >>> 0).toString(16).padStart(8, "0")}${(Math.imul(a, b) >>> 0).toString(16).padStart(8, "0")}`.toUpperCase()
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * Builds the Twee 3 source text for `project`. The first passage in
 * order_index becomes the `Start` passage by convention, with `Start`
 * added as a tag so Tweego picks it up correctly. Empty bodies are
 * emitted as-is — Twee tolerates them and preserves the passage in
 * the compiled story.
 */
export function projectToTwee(project: FullProject): string {
  const passages = [...(project.scenes ?? [])].sort(
    (a, b) => a.order_index - b.order_index,
  )

  const blocks: string[] = []

  // Twee allows a `StoryTitle` special passage that carries the
  // compiled story's title, plus a `StoryData` JSON block with format
  // metadata. We emit both so a round trip through Tweego preserves
  // the project name.
  blocks.push(`:: StoryTitle\n${project.title}`)
  blocks.push(
    `:: StoryData\n${JSON.stringify({ ifid: stableIFID(project), format: "SugarCube", "format-version": "2.36.1" }, null, 2)}`,
  )

  const story = passages[0] ? parsePassageMetadata(passages[0].content).story : undefined
  if (story?.variables.length) {
    const initializers = story.variables.map((variable) => `<<set $${variable.name} = ${JSON.stringify(variable.initialValue)}>>`)
    blocks.push(`:: StoryInit [script]\n${initializers.join("\n")}`)
  }

  for (let i = 0; i < passages.length; i++) {
    const passage = passages[i]
    const metadata = parsePassageMetadata(passage.content)
    const tags: string[] = [...metadata.tags]
    if (passage.id === (story?.startPassageId ?? passages[0]?.id)) tags.push("Start")

    const elements = [...(passage.elements ?? [])].sort(
      (a, b) => a.line_number - b.line_number,
    )
    const body = elements
      .map(compileElementToSugarCube)
      .filter((s) => s.length > 0)
      .join("\n\n")

    const name = escapeName(passage.scene_heading || `Passage ${i + 1}`)
    const color = metadata.color ? ` ${JSON.stringify({ "inkwell-color": metadata.color })}` : ""
    blocks.push(`:: ${name}${formatTags(tags)}${color}\n${body}`)
  }

  return blocks.join("\n\n") + "\n"
}

/**
 * Triggers a browser download of the project's Twee source. Filename
 * mirrors the existing screenplay-fdx exporter's slug rule so two
 * exports of the same project sit next to each other on disk.
 */
export function exportProjectToTwee(project: FullProject): void {
  const twee = projectToTwee(project)
  const blob = new Blob([twee], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${project.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.twee`
  a.click()
  URL.revokeObjectURL(url)
}
