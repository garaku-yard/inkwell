/**
 * Poetry / Lyrics importers.
 *
 * - {@link parsePlainTextToPoetry}: a `.txt` poem — each line becomes a `line`
 *   element; a blank line becomes a `stanza_break`.
 * - {@link parseChordProToPoetry}: a `.cho` (ChordPro) song — the inverse of
 *   `lib/export/chordpro.ts`. Song titles split scenes; native section, repeat,
 *   tab, grid, and metadata directives are recognized. Unknown directives stay
 *   as editable elements for a safe round trip.
 */

import type { ParsedElement, ParsedProject } from "./types"
import { writeDocumentMetadata, type DocumentMetadata } from "@/lib/editor/document-metadata"

export function parsePlainTextToPoetry(text: string, fallbackTitle: string): ParsedProject {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  const scenes: ParsedProject["scenes"] = []
  let heading = fallbackTitle
  let elements: ParsedElement[] = []
  let pendingBreak = false

  for (const raw of lines) {
    if (raw.startsWith(":::inkwell-poem ")) {
      try {
        const parsed: unknown = JSON.parse(raw.slice(16))
        if (typeof parsed === "string") {
          if (elements.length) scenes.push({ heading, elements })
          heading = parsed
          elements = []
          pendingBreak = false
          continue
        }
      } catch { /* ordinary text line */ }
    }
    if (raw.trim() === "") {
      // Collapse runs of blank lines into a single stanza break; never lead with one.
      pendingBreak = elements.length > 0
      continue
    }
    if (pendingBreak) {
      elements.push({ type: "stanza_break", content: "" })
      pendingBreak = false
    }
    elements.push({ type: "line", content: raw })
  }

  scenes.push({ heading, elements })
  return { title: fallbackTitle, scenes }
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
const SONG_SECTIONS = new Set(["verse", "chorus", "bridge", "pre_chorus", "intro", "outro", "hook", "refrain", "solo", "instrumental", "tag"])
const sectionName = (key: string, prefix: string) => key.startsWith(prefix) ? key.slice(prefix.length) : ""
const sectionLabel = (value: string, kind: string) => {
  const named = /^label\s*=\s*"([^"]*)"$/.exec(value)
  return named?.[1] || value || kind.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase())
}

export function parseChordProToPoetry(text: string, fallbackTitle: string): ParsedProject {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  const scenes: ParsedProject["scenes"] = []
  let heading = fallbackTitle
  let elements: ParsedElement[] = []
  let metadata: DocumentMetadata = {}
  let pendingBreak = false
  let environment: "tab" | "grid" | null = null

  const finish = () => {
    if (elements.length || Object.keys(metadata).length || scenes.length === 0) {
      scenes.push({ heading, content: writeDocumentMetadata("", metadata), elements })
    }
    elements = []
    metadata = {}
    pendingBreak = false
    environment = null
  }

  const flushBreak = () => {
    if (pendingBreak) {
      elements.push({ type: "stanza_break", content: "" })
      pendingBreak = false
    }
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "")
    const trimmed = line.trim()

    if (environment && !/^\{(?:end_of_|eo|eot|eog)/i.test(trimmed)) {
      elements.push({ type: `${environment}_row`, content: line })
      continue
    }

    if (trimmed === "") {
      pendingBreak = elements.length > 0
      continue
    }
    // ChordPro processors may append chord diagram definitions as comments.
    if (trimmed.startsWith("#")) continue

    const directive = DIRECTIVE.exec(trimmed)
    if (directive) {
      const key = directive[1].trim().toLowerCase()
      const val = directive[2].trim()
      if (key === "title") {
        if (val) {
          if (elements.length || Object.keys(metadata).length) finish()
          heading = val
        }
      } else if (["artist", "album", "key", "time"].includes(key)) {
        metadata = { ...metadata, [key]: val }
      } else if (["tempo", "capo"].includes(key)) {
        const number = Number(val)
        if (Number.isFinite(number)) metadata = { ...metadata, [key]: number }
        else elements.push({ type: "chordpro_directive", content: trimmed })
      } else if (["start_of_tab", "sot", "start_of_grid", "sog"].includes(key)) {
        environment = key.endsWith("tab") ? "tab" : "grid"
        if (key === "sot") environment = "tab"
        if (key === "sog") environment = "grid"
      } else if (["end_of_tab", "eot", "end_of_grid", "eog"].includes(key)) {
        environment = null
      } else if (SONG_SECTIONS.has(sectionName(key, "start_of_")) || ["sov", "soc", "sob"].includes(key)) {
        flushBreak()
        const kind = key.startsWith("start_of_") ? key.slice(9) : ({ sov: "verse", soc: "chorus", sob: "bridge" } as Record<string, string>)[key]
        elements.push({ type: "section_label", content: sectionLabel(val, kind) })
      } else if (SONG_SECTIONS.has(sectionName(key, "end_of_")) || ["eov", "eoc", "eob"].includes(key)) {
        // The next section starts with its own label.
      } else if (key === "chorus") {
        flushBreak()
        elements.push({ type: "section_repeat", content: val ? `Chorus: ${val}` : "Chorus" })
      } else if (key === "x_inkwell_repeat") {
        flushBreak()
        try { elements.push({ type: "section_repeat", content: decodeURIComponent(val) }) }
        catch { elements.push({ type: "chordpro_directive", content: trimmed }) }
      } else if (key === "comment" || key === "c") {
        flushBreak()
        elements.push({ type: "section_label", content: val })
      } else if (key === "x_inkwell_chord_row") {
        flushBreak()
        try { elements.push({ type: "chord_row", content: decodeURIComponent(val) }) }
        catch { elements.push({ type: "chordpro_directive", content: trimmed }) }
      } else {
        flushBreak()
        elements.push({ type: "chordpro_directive", content: trimmed })
      }
      continue
    }

    flushBreak()
    const { chordRow, line: lyric } = reverseChordLine(line)
    if (chordRow) elements.push({ type: "chord_row", content: chordRow })
    elements.push({ type: "line", content: lyric })
  }

  finish()
  return { title: scenes[0]?.heading ?? fallbackTitle, scenes }
}
