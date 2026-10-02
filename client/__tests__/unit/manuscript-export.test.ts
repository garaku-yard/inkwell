import { strFromU8, unzipSync } from "fflate"
import { writeFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { renderManuscriptDocxBytes, renderManuscriptPdfBytes } from "@/lib/export/manuscript"
import { writeInlineRuns } from "@/lib/editor/inline-content"
import { writeDocumentMetadata } from "@/lib/editor/document-metadata"
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

  it("preserves a formatted long poem line, epigraph, and prose paragraph in submission output", () => {
    const data = project("poetry")
    const scene = data.scenes![0]
    scene.content = writeDocumentMetadata("", { epigraph: "For the long road" })
    scene.elements = [
      element("line", writeInlineRuns([
        { text: "Bold opening ", strong: true },
        { text: "italic turn ", emphasis: true },
        { text: "underlined echo ", underline: true },
        { text: "and a deliberately long ending ".repeat(5) },
      ]), 0),
      element("stanza_break", "", 1),
      element("section_label", "Afterward", 2),
      element("prose_block", "A prose poem paragraph that flows across the page as one paragraph.", 3),
    ]

    const pdf = renderManuscriptPdfBytes(data, "poetry")
    if (process.env.INKWELL_POETRY_QA_PDF) writeFileSync(process.env.INKWELL_POETRY_QA_PDF, pdf)
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe("%PDF")

    const docx = renderManuscriptDocxBytes(data, "poetry")
    if (process.env.INKWELL_POETRY_QA_DOCX) writeFileSync(process.env.INKWELL_POETRY_QA_DOCX, docx)
    const document = strFromU8(unzipSync(docx)["word/document.xml"])
    expect(document).toContain('w:pStyle w:val="Epigraph"')
    expect(document).toContain("For the long road")
    expect(document).toContain('w:pStyle w:val="ProsePoem"')
    expect(document).toContain("A prose poem paragraph")
    expect(document).toContain("<w:b/>")
    expect(document).toContain("<w:i/>")
    expect(document).toContain('<w:u w:val="single"/>')
  })
})
