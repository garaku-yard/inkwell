import { describe, expect, it } from "vitest"
import { readFileSync, writeFileSync } from "node:fs"

import { projectToChordPro } from "@/lib/export/chordpro"
import { parseChordProToPoetry } from "@/lib/import/poetry"
import { writeInlineRuns } from "@/lib/editor/inline-content"
import type { FullProject } from "@/services/project"

function fakeProject(scenes: FullProject["scenes"]): FullProject {
  return {
    id: "p",
    title: "Test",
    description: "",
    owner_id: "u",
    category: "lyrics",
    status: "active",
    is_starred: false,
    created_at: "",
    updated_at: "",
    scenes,
  } as unknown as FullProject
}

function el(type: string, content: string, line_number: number) {
  return {
    id: `e-${line_number}`,
    project_id: "p",
    scene_id: "s1",
    element_type: type,
    content,
    line_number,
  } as unknown as NonNullable<NonNullable<FullProject["scenes"]>[number]["elements"]>[number]
}

describe("projectToChordPro", () => {
  it("emits a song title plus body lines", () => {
    const out = projectToChordPro(
      fakeProject([
        {
          id: "s1",
          scene_heading: "Sonnet 1",
          order_index: 0,
          elements: [el("line", "From fairest creatures", 0), el("line", "we desire increase,", 1)],
        } as never,
      ]),
    )
    expect(out).toContain("{title: Sonnet 1}")
    expect(out).toContain("From fairest creatures")
    expect(out).toContain("we desire increase,")
  })

  it("merges chord_row + line into inline ChordPro chords", () => {
    const out = projectToChordPro(
      fakeProject([
        {
          id: "s1",
          scene_heading: "",
          order_index: 0,
          elements: [
            // D above "H" (col 0), G above "w" (col 7).
            el("chord_row", "D      G", 0),
            el("line", "Hello, world.", 1),
          ],
        } as never,
      ]),
    )
    expect(out).toContain("[D]Hello, [G]world.")
  })

  it("appends chords past end of line so they don't disappear", () => {
    const out = projectToChordPro(
      fakeProject([
        {
          id: "s1",
          scene_heading: "",
          order_index: 0,
          elements: [
            el("chord_row", "    Em", 0),
            el("line", "Hi", 1),
          ],
        } as never,
      ]),
    )
    expect(out).toContain("[Em]")
    expect(out).toMatch(/Hi.*\[Em\]/)
  })

  it("renders semantic chorus sections", () => {
    const out = projectToChordPro(
      fakeProject([
        {
          id: "s1",
          scene_heading: "",
          order_index: 0,
          elements: [el("section_label", "Chorus", 0), el("line", "We sing along", 1)],
        } as never,
      ]),
    )
    expect(out).toContain("{start_of_chorus: Chorus}")
    expect(out).toContain("{end_of_chorus}")
  })

  it("preserves a standalone chord row with an extension directive", () => {
    const out = projectToChordPro(
      fakeProject([
        {
          id: "s1",
          scene_heading: "",
          order_index: 0,
          elements: [el("chord_row", "D G A", 0)],
        } as never,
      ]),
    )
    expect(out).toContain("{x_inkwell_chord_row: D%20G%20A}")
  })

  it("exports formatted tab and grid text without exposing stored inline runs", () => {
    const out = projectToChordPro(fakeProject([
      {
        id: "s1", scene_heading: "Test", order_index: 0,
        elements: [
          el("tab_row", writeInlineRuns([{ text: "hello", strong: true }, { text: " " }]), 0),
          el("grid_row", writeInlineRuns([{ text: "Am", emphasis: true }]), 1),
        ],
      } as never,
    ]))
    expect(out).toContain("{start_of_tab}\nhello \n{end_of_tab}")
    expect(out).toContain("{start_of_grid}\nAm\n{end_of_grid}")
    expect(out).not.toContain("inkwell.editor.inline")
  })

  it("builds a representative song for independent ChordPro validation", () => {
    const out = projectToChordPro(fakeProject([{
      id: "s1", scene_heading: "Evening Song", order_index: 0,
      elements: [
        el("chordpro_directive", "{key: C}", 0),
        el("section_label", "Verse 1", 1),
        el("chord_row", "C      G", 2),
        el("line", "Hello, world.", 3),
        el("section_label", "Chorus", 4),
        el("line", "Sing again", 5),
        el("tab_row", "e|----0----|", 6),
        el("grid_row", "C | G | Am | F", 7),
      ],
    } as never]))
    if (process.env.INKWELL_CHORDPRO_QA_PATH) writeFileSync(process.env.INKWELL_CHORDPRO_QA_PATH, out)
    expect(out).toContain("[C]Hello, [G]world.")
    expect(out).toContain("{start_of_chorus: Chorus}")
    expect(out).toContain("{start_of_tab}")
    expect(out).toContain("{start_of_grid}")
    if (process.env.INKWELL_CHORDPRO_ROUNDTRIP_PATH) {
      const imported = parseChordProToPoetry(readFileSync(process.env.INKWELL_CHORDPRO_ROUNDTRIP_PATH, "utf8"), "Fallback")
      const elements = imported.scenes[0].elements
      expect(elements.some(item => item.type === "chord_row" && item.content.includes("C"))).toBe(true)
      expect(elements.some(item => item.type === "tab_row" && item.content === "e|----0----|")).toBe(true)
      expect(elements.some(item => item.type === "grid_row" && item.content === "C | G | Am | F")).toBe(true)
      expect(elements.some(item => item.content.startsWith("#{chord"))).toBe(false)
    }
  })
})
