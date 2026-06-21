/**
 * Poetry / Lyrics importers.
 *
 * - {@link parsePlainTextToPoetry}: a `.txt` poem — each line becomes a `line`
 *   element; a blank line becomes a `stanza_break`.
 * - {@link parseChordProToPoetry}: a `.cho` (ChordPro) song — the inverse of
 *   `lib/export/chordpro.ts`. `{title:}` sets the project title, `{comment:}`
 *   becomes a `section_label`, inline `[Chord]` markers are lifted back into a
 *   `chord_row` above the lyric `line`, and other directives are skipped.
 *
 * Both land everything in a single poem/song (one scene) — splitting a flat
 * text/ChordPro file into multiple poems can't be done reliably, so the writer
 * gets one scene they can split by hand.
 */

import type { ParsedElement, ParsedProject } from "./types"

export function parsePlainTextToPoetry(text: string, fallbackTitle: string): ParsedProject {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  const elements: ParsedElement[] = []
  let pendingBreak = false

  for (const raw of lines) {
    const line = raw.trim()
    if (line === "") {
      // Collapse runs of blank lines into a single stanza break; never lead with one.
      pendingBreak = elements.length > 0
      continue
    }
    if (pendingBreak) {
      elements.push({ type: "stanza_break", content: "" })
      pendingBreak = false
    }
    elements.push({ type: "line", content: line })
  }

  return { title: fallbackTitle, scenes: [{ heading: fallbackTitle, elements }] }
}

/** Lift inline `[Chord]` markers out of a ChordPro line into a column-aligned
 *  chord row + the bare lyric. Returns a null chordRow when the line has none. */
function reverseChordLine(cho: string): { chordRow: string | null; line: string } {
  if (!cho.includes("[")) return { chordRow: null, line: cho }
  let line = ""
  const chords: { col: number; chord: string }[] = []
  let i = 0
  while (i < cho.length) {
    if (cho[i] === "[") {
      const end = cho.indexOf("]", i)
      if (end === -1) {
        line += cho.slice(i)
        break
      }
      chords.push({ col: line.length, chord: cho.slice(i + 1, end) })
      i = end + 1
    } else {
      line += cho[i]
      i++
    }
  }
  if (chords.length === 0) return { chordRow: null, line }
  let row = ""
  for (const { col, chord } of chords) {
    if (row.length < col) row = row.padEnd(col, " ")
    row += `${chord} `
  }
  return { chordRow: row.trimEnd(), line }
}

const DIRECTIVE = /^\{([^:}]+):?\s*([^}]*)\}$/

export function parseChordProToPoetry(text: string, fallbackTitle: string): ParsedProject {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  let title = fallbackTitle
  const elements: ParsedElement[] = []
  let pendingBreak = false

  const flushBreak = () => {
    if (pendingBreak) {
      elements.push({ type: "stanza_break", content: "" })
      pendingBreak = false
    }
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "")
    const trimmed = line.trim()

    if (trimmed === "") {
      pendingBreak = elements.length > 0
      continue
    }

    const directive = DIRECTIVE.exec(trimmed)
    if (directive) {
      const key = directive[1].trim().toLowerCase()
      const val = directive[2].trim()
      if (key === "title") {
        if (val) title = val
      } else if (key === "comment" || key === "c") {
        flushBreak()
        elements.push({ type: "section_label", content: val })
      }
      // Other directives (start_of_chorus, soc, etc.) carry no element — skip.
      continue
    }

    flushBreak()
    const { chordRow, line: lyric } = reverseChordLine(line)
    if (chordRow) elements.push({ type: "chord_row", content: chordRow })
    elements.push({ type: "line", content: lyric })
  }

  return { title, scenes: [{ heading: title, elements }] }
}
