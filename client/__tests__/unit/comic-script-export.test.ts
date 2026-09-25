import { writeFileSync } from "node:fs"

import { strFromU8, unzipSync } from "fflate"
import { describe, expect, it } from "vitest"

import {
  renderComicScriptDocxBytes,
  renderComicScriptPdfBytes,
} from "@/lib/export/comic-script"
import type { FullProject, ProjectElement } from "@/services/project"

function element(type: string, content: string, line: number): ProjectElement {
  return {
    id: `element-${line}`,
    project_id: "project-1",
    scene_id: "page-1",
    element_type: type,
    content,
    line_number: line,
    formatting: {},
    created_at: "",
    updated_at: "",
  }
}

const project = {
  id: "project-1",
  title: "A & B: Issue #1",
  description: "An artist-ready <script>.",
  owner_id: "writer-1",
  category: "comic_script",
  status: "draft",
  is_starred: false,
  created_at: "",
  updated_at: "",
  scenes: [{
    id: "page-1",
    project_id: "project-1",
    scene_heading: "The arrival",
    content: "",
    order_index: 0,
    created_at: "",
    updated_at: "",
    elements: [
      element("panel", "A ship crosses the red sky.", 0),
      element("character", "Mara", 1),
      element("balloon", "We're here.", 2),
      element("caption", "Mars, 2140", 3),
      element("sfx", "Kra-koom!", 4),
      element("transition", "Cut to:", 5),
    ],
  }],
} as FullProject

describe("comic script exports", () => {
  it("renders a valid PDF byte stream", () => {
    const bytes = renderComicScriptPdfBytes(project)
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF")
    expect(bytes.length).toBeGreaterThan(1_000)
    if (process.env.INKWELL_COMIC_PDF_QA_OUTPUT) {
      writeFileSync(process.env.INKWELL_COMIC_PDF_QA_OUTPUT, bytes)
    }
  })

  it("renders a valid DOCX package with semantic script styles", () => {
    const bytes = renderComicScriptDocxBytes(project)
    if (process.env.INKWELL_COMIC_DOCX_QA_OUTPUT) {
      writeFileSync(process.env.INKWELL_COMIC_DOCX_QA_OUTPUT, bytes)
    }
    const entries = unzipSync(bytes)
    expect(entries["[Content_Types].xml"]).toBeDefined()
    expect(entries["_rels/.rels"]).toBeDefined()
    expect(entries["word/document.xml"]).toBeDefined()
    expect(entries["word/styles.xml"]).toBeDefined()
    expect(entries["word/_rels/document.xml.rels"]).toBeDefined()

    const document = strFromU8(entries["word/document.xml"])
    expect(document).toContain("A &amp; B: ISSUE #1")
    expect(document).toContain("An artist-ready &lt;script&gt;.")
    expect(document).toContain("PAGE 1 - The arrival")
    expect(document).toContain("PANEL 1")
    expect(document).toContain("A ship crosses the red sky.")
    expect(document).toContain("MARA")
    expect(document).toContain("We&apos;re here.")
    expect(document).toContain("CAPTION: Mars, 2140")
    expect(document).toContain("SFX: KRA-KOOM!")
    expect(document).toContain("CUT TO:")

    const styles = strFromU8(entries["word/styles.xml"])
    expect(styles).toContain('w:styleId="PanelHeading"')
    expect(styles).toContain('w:styleId="Character"')
    expect(styles).toContain('w:styleId="Dialogue"')
  })
})
