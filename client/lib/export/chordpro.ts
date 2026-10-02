/**
 * ChordPro exporter for Poetry / Lyrics projects.
 *
 * ChordPro (`.cho`) is the de-facto plain-text format for songbooks
 * and worship resources. Directives use `{key: value}` syntax;
 * inline chords go in square brackets ahead of the syllable they
 * belong to (`[D]Hello [G]world`). The format is friendly to poetry
 * too — a poem with no chords is just a title directive plus body
 * lines, which is exactly the minimum a parser will accept.
 *
 * Reference: https://www.chordpro.org/chordpro/chordpro-introduction/
 *
 * Key choice in this exporter: when a `chord_row` element precedes a
 * `line` element, we merge the chords into the line at column-aligned
 * positions instead of emitting the chord row separately. That's how
 * lyrics writers actually write — chords floating above the syllables
 * they're played on — so a round trip lands closer to what they typed.
 */

import type { FullProject, ProjectElement } from "@/services/project"
import { plainInlineText } from "@/lib/editor/inline-content"
import { readDocumentMetadata } from "@/lib/editor/document-metadata"

const sectionKind = (label: string) => /^(verse|chorus|bridge|pre[ -]?chorus|intro|outro|hook|refrain|solo|instrumental|tag)\b/i.exec(label)?.[1]?.toLowerCase().replace(/[ -]/g, "_")
const directiveValue = (value: string) => value.replace(/[\r\n{}]/g, " ").trim()

/** Inserts chord tokens from a chord_row into the matching line at
 *  the column positions implied by the chord_row's whitespace.
 *  Chords past the end of the line are appended at the end so they
 *  don't disappear. */
function mergeChordsIntoLine(chordRow: string, line: string): string {
  const trimmed = chordRow.trimEnd()
  if (!trimmed.trim()) return line
  const re = /\S+/g
  const tokens: { col: number; chord: string }[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(trimmed)) !== null) {
    tokens.push({ col: match.index, chord: match[0] })
  }
  if (tokens.length === 0) return line

  // Clamp + insert from right to left so earlier inserts don't shift
  // later columns.
  let result = line
  for (let i = tokens.length - 1; i >= 0; i--) {
    const { col, chord } = tokens[i]
    if (col >= result.length) {
      // Pad short lines with spaces so the chord still lands roughly
      // where the writer placed it visually.
      result = result.padEnd(col, " ") + `[${chord}]`
    } else {
      result = result.slice(0, col) + `[${chord}]` + result.slice(col)
    }
  }
  return result
}

/** Walks one song/poem's element list and emits ChordPro sections and rows. */
function songToChordPro(elements: ProjectElement[]): string[] {
  const lines: string[] = []
  let openSection: string | null = null
  let openLiteral: "tab" | "grid" | null = null
  const closeSection = () => {
    if (openSection) lines.push(`{end_of_${openSection}}`)
    openSection = null
  }
  const closeLiteral = () => {
    if (openLiteral) lines.push(`{end_of_${openLiteral}}`)
    openLiteral = null
  }

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    const rawContent = plainInlineText(el.content ?? "")
    const content = rawContent.trim()

    if (el.element_type === "section_label") {
      closeLiteral()
      closeSection()
      if (content) {
        const kind = sectionKind(content)
        if (kind) {
          lines.push(`{start_of_${kind}: ${directiveValue(content)}}`)
          openSection = kind
        } else lines.push(`{comment: ${directiveValue(content)}}`)
      }
      continue
    }

    if (el.element_type === "section_repeat" || el.element_type === "chorus_repeat") {
      closeLiteral()
      closeSection()
      const chorusLabel = /^chorus:\s*(.+)$/i.exec(content)?.[1]
      lines.push(/^chorus$/i.test(content) ? "{chorus}" : chorusLabel ? `{chorus: ${directiveValue(chorusLabel)}}` : `{x_inkwell_repeat: ${encodeURIComponent(rawContent)}}`)
      continue
    }

    if (el.element_type === "tab_row" || el.element_type === "grid_row") {
      closeSection()
      const kind = el.element_type === "tab_row" ? "tab" : "grid"
      if (openLiteral !== kind) {
        closeLiteral()
        lines.push(`{start_of_${kind}}`)
        openLiteral = kind
      }
      lines.push(rawContent)
      continue
    }
    closeLiteral()

    if (el.element_type === "chordpro_directive") {
      closeSection()
      if (/^\{[^\r\n{}]+\}$/.test(content)) lines.push(content)
      continue
    }

    if (el.element_type === "chord_row") {
      // Chord row is rendered together with the next `line` element.
      // We peek ahead and consume it; if the next element isn't a
      // line, use an extension directive that retains its exact spacing.
      const next = elements[i + 1]
      if (next && next.element_type === "line") {
        lines.push(mergeChordsIntoLine(rawContent, plainInlineText(next.content ?? "")))
        i += 1
        continue
      }
      if (content) lines.push(`{x_inkwell_chord_row: ${encodeURIComponent(rawContent)}}`)
      continue
    }

    if (el.element_type === "stanza_break") {
      lines.push("")
      continue
    }

    if (el.element_type === "line") {
      lines.push(plainInlineText(el.content ?? ""))
      continue
    }

    // Unknown element types pass through verbatim — better than
    // silently dropping content the user wrote.
    if (content) lines.push(content)
  }

  closeLiteral()
  closeSection()

  return lines
}

/**
 * Builds the ChordPro source for `project`. Lyrics emit a title and metadata
 * per song; poetry retains the collection title and poem comments.
 */
export function projectToChordPro(project: FullProject): string {
  const scenes = [...(project.scenes ?? [])].sort(
    (a, b) => a.order_index - b.order_index,
  )

  const blocks: string[] = []
  if (project.category !== "lyrics" && project.title) blocks.push(`{title: ${directiveValue(project.title)}}`)

  for (const scene of scenes) {
    const elements = [...(scene.elements ?? [])].sort(
      (a, b) => a.line_number - b.line_number,
    )
    const sectionLines: string[] = []
    if (project.category === "lyrics") {
      if (scene.scene_heading) sectionLines.push(`{title: ${directiveValue(scene.scene_heading)}}`)
      const metadata = readDocumentMetadata(scene.content ?? "")
      for (const [key, value] of Object.entries({ artist: metadata.artist, album: metadata.album, key: metadata.key, tempo: metadata.tempo, time: metadata.time, capo: metadata.capo })) {
        if (value !== undefined && value !== "") sectionLines.push(`{${key}: ${directiveValue(String(value))}}`)
      }
    } else if (scene.scene_heading) sectionLines.push(`{comment: ${directiveValue(scene.scene_heading)}}`)
    sectionLines.push(...songToChordPro(elements))
    blocks.push(sectionLines.join("\n"))
  }

  return blocks.join("\n\n") + "\n"
}

/** Triggers a browser download of the project's ChordPro source. */
export function exportProjectToChordPro(project: FullProject): void {
  const cho = projectToChordPro(project)
  const blob = new Blob([cho], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${project.title.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "song"}.cho`
  a.click()
  URL.revokeObjectURL(url)
}
