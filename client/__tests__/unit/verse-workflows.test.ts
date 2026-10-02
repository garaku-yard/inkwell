import { strFromU8, unzipSync } from "fflate"
import { describe, expect, it } from "vitest"

import { readDocumentMetadata, writeDocumentMetadata } from "@/lib/editor/document-metadata"
import { chordRowIssues, transposeChordRow } from "@/lib/editor/song-tools"
import { projectToChordPro } from "@/lib/export/chordpro"
import { renderManuscriptDocxBytes } from "@/lib/export/manuscript"
import { projectToVerseText } from "@/lib/export/text-export"
import { parseChordProToPoetry, parsePlainTextToPoetry } from "@/lib/import/poetry"
import { createPoetryKeymap } from "@/components/editor/poetry/keymap"
import type { FullProject, ProjectElement, Scene } from "@/services/project"

const element = (type: string, content: string, line_number: number): ProjectElement => ({
  id: `e${line_number}`, project_id: "p", scene_id: "s", element_type: type, content, line_number,
  formatting: {}, created_at: "", updated_at: "",
})
const scene = (heading: string, content: string, elements: ProjectElement[], order_index = 0): Scene => ({
  id: `s${order_index}`, project_id: "p", scene_heading: heading, content, elements, order_index,
  created_at: "", updated_at: "",
})
const project = (category: "poetry" | "lyrics", scenes: Scene[]): FullProject => ({
  id: "p", title: "Collection", description: "", owner_id: "u", category, status: "draft", is_starred: false,
  created_at: "", updated_at: "", scenes,
})

describe("poetry and lyrics workflows", () => {
  it("keeps prose poem paragraphs in paragraph mode on Enter", () => {
    const inserted: string[] = []
    const keymap = createPoetryKeymap({
      scenes: [], isLyrics: false,
      insertLineAfter: () => inserted.push("line"),
      insertProseBlockAfter: () => inserted.push("prose_block"),
      insertStanzaBreakAfter: () => {}, insertSectionLabelAfter: () => {},
      insertChordRowAfter: () => {}, deleteEmptyElement: () => {},
    })
    const event = { preventDefault: () => {} } as Parameters<typeof keymap.enter>[0]
    keymap.enter(event, { sceneId: "s", elementId: "p", elementType: "prose_block", elementIndex: 0 })
    keymap.enter(event, { sceneId: "s", elementId: "l", elementType: "line", elementIndex: 1 })
    expect(inserted).toEqual(["prose_block", "line"])
  })

  it("keeps spatial indentation on plain text import and centers submission Word lines", () => {
    const parsed = parsePlainTextToPoetry("    An indented line\nSecond line\n\nFinal line", "Poem")
    expect(parsed.scenes[0].elements).toEqual([
      { type: "line", content: "    An indented line" },
      { type: "line", content: "Second line" },
      { type: "stanza_break", content: "" },
      { type: "line", content: "Final line" },
    ])
    const data = project("poetry", [scene("Poem", writeDocumentMetadata("", { alignment: "center", targetLines: 3 }), [element("line", "    An indented line", 0)])])
    const docx = unzipSync(renderManuscriptDocxBytes(data, "poetry"))
    expect(strFromU8(docx["word/document.xml"])).toContain('w:pStyle w:val="PoetryLineCentered"')
    expect(strFromU8(docx["word/document.xml"])).toContain('xml:space="preserve">    An indented line')
  })

  it("round-trips poem collections through readable plain text", () => {
    const data = project("poetry", [
      scene("First", "", [element("line", "    Indented", 0), element("stanza_break", "", 1), element("line", "Next", 2)]),
      scene("Second", "", [element("line", "Another", 0)], 1),
    ])
    const parsed = parsePlainTextToPoetry(projectToVerseText(data), "Collection")
    expect(parsed.scenes.map((item) => item.heading)).toEqual(["First", "Second"])
    expect(parsed.scenes[0].elements).toEqual([
      { type: "line", content: "    Indented" }, { type: "stanza_break", content: "" }, { type: "line", content: "Next" },
    ])
  })

  it("round-trips song metadata, sections, repeats, tab, grid, and standalone chords", () => {
    const content = writeDocumentMetadata("", { artist: "A & B", key: "C", tempo: 120, time: "4/4", capo: 2 })
    const first = scene("Song One", content, [
      element("section_label", "Verse 1", 0), element("chord_row", "C      G", 1),
      element("line", "Hello, world", 2), element("stanza_break", "", 3),
      element("section_label", "Chorus", 4), element("line", "Sing", 5),
      element("section_repeat", "Chorus", 6), element("tab_row", "e|--0--|", 7),
      element("grid_row", "| C . . . | G . . . |", 8),
      element("chord_row", "Am F", 9),
    ])
    const second = scene("Song Two", "", [element("line", "Another", 0)], 1)
    const exported = projectToChordPro(project("lyrics", [first, second]))
    expect(exported).toContain("{start_of_verse: Verse 1}")
    expect(exported).toContain("{chorus}")
    expect(exported).toContain("{start_of_tab}")
    expect(exported).toContain("{start_of_grid}")
    const imported = parseChordProToPoetry(exported, "Fallback")
    expect(imported.scenes).toHaveLength(2)
    expect(imported.scenes[0].heading).toBe("Song One")
    expect(readDocumentMetadata(imported.scenes[0].content ?? "")).toMatchObject({ artist: "A & B", key: "C", tempo: 120, time: "4/4", capo: 2 })
    expect(imported.scenes[0].elements.map((item) => item.type)).toEqual([
      "section_label", "chord_row", "line", "stanza_break", "section_label", "line", "section_repeat", "tab_row", "grid_row", "chord_row",
    ])
    expect(imported.scenes[0].elements[1].content).toBe("C      G")
    expect(imported.scenes[1].heading).toBe("Song Two")
  })

  it("reads native ChordPro sections and retains unrecognized directives", () => {
    const parsed = parseChordProToPoetry("{title: Demo}\n{soc: label=\"Chorus 1\"}\n[C]Sing\n{eoc}\n{transpose: 2}\n{chorus}", "fallback")
    expect(parsed.scenes[0].elements).toEqual([
      { type: "section_label", content: "Chorus 1" },
      { type: "chord_row", content: "C" }, { type: "line", content: "Sing" },
      { type: "chordpro_directive", content: "{transpose: 2}" },
      { type: "section_repeat", content: "Chorus" },
    ])
  })

  it("preserves named section repeats with an Inkwell extension", () => {
    const data = project("lyrics", [scene("Demo", "", [element("section_repeat", "Verse 1", 0)])])
    const source = projectToChordPro(data)
    expect(source).toContain("{x_inkwell_repeat: Verse%201}")
    expect(parseChordProToPoetry(source, "fallback").scenes[0].elements).toContainEqual({ type: "section_repeat", content: "Verse 1" })
    const native = parseChordProToPoetry("{title: Demo}\n{chorus: Final}", "fallback")
    expect(native.scenes[0].elements).toContainEqual({ type: "section_repeat", content: "Chorus: Final" })
    const nativeScene = scene("Demo", "", [element("section_repeat", "Chorus: Final", 0)])
    expect(projectToChordPro(project("lyrics", [nativeScene]))).toContain("{chorus: Final}")
  })

  it("previews chord transposition and flags unknown tokens without changing source", () => {
    expect(transposeChordRow("C   Am7/G  F#", 2)).toBe("D   Bm7/A  G#")
    expect(chordRowIssues("C Am7/G nonsense")).toEqual(["nonsense"])
  })
})
