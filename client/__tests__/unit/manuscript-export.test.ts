import { strFromU8, unzipSync } from "fflate"
import { writeFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { renderManuscriptDocxBytes, renderManuscriptPdfBytes } from "@/lib/export/manuscript"
import { writeInlineRuns } from "@/lib/editor/inline-content"
import type { FullProject, ProjectElement } from "@/services/project"

function element(type: string, content: string, line: number): ProjectElement {
  return { id: `e${line}`, project_id: "p1", scene_id: "s1", element_type: type, content,
    line_number: line, formatting: {}, created_at: "", updated_at: "" }
}

function project(category: "novel" | "poetry"): FullProject {
  return {
    id: "p1", title: "A & B", description: "", owner_id: "u1", category, status: "draft",
    is_starred: false, created_at: "", updated_at: "",
    scenes: [{ id: "s1", project_id: "p1", scene_heading: "Opening <scene>", content: "", order_index: 0,
      created_at: "", updated_at: "", elements: [
        element(category === "poetry" ? "line" : "paragraph", writeInlineRuns([
          { text: "Bold", strong: true }, { text: " and ", emphasis: true }, { text: "small", smallCaps: true },
        ]), 0),
        element(category === "poetry" ? "stanza_break" : "scene_break", "", 1),
      ] }],
  }
}

describe("manuscript exports", () => {
  it.each(["prose", "poetry"] as const)("renders %s as PDF and styled Word", (profile) => {
    const data = project(profile === "poetry" ? "poetry" : "novel")
    const pdf = renderManuscriptPdfBytes(data, profile)
    if (process.env.INKWELL_MANUSCRIPT_QA_DIR) {
      writeFileSync(`${process.env.INKWELL_MANUSCRIPT_QA_DIR}/${profile}.pdf`, pdf)
    }
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe("%PDF")
    expect(pdf.length).toBeGreaterThan(1_000)

    const docx = renderManuscriptDocxBytes(data, profile)
    if (process.env.INKWELL_MANUSCRIPT_QA_DIR) {
      writeFileSync(`${process.env.INKWELL_MANUSCRIPT_QA_DIR}/${profile}.docx`, docx)
    }
    const entries = unzipSync(docx)
    const document = strFromU8(entries["word/document.xml"])
    const styles = strFromU8(entries["word/styles.xml"])
    expect(document).toContain("Opening &lt;scene&gt;")
    expect(document).toContain("<w:b/>")
    expect(document).toContain("<w:i/>")
    expect(document).toContain("<w:smallCaps/>")
    expect(document).toContain(profile === "poetry" ? 'w:pStyle w:val="StanzaBreak"' : 'w:pStyle w:val="SceneBreak"')
    expect(styles).toContain(profile === "poetry" ? 'w:styleId="PoetryLine"' : 'w:styleId="ProseBody"')
  })
})
