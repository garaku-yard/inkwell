import { readFileSync, writeFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { buildScreenplayFdx } from "@/lib/export/screenplay-fdx"
import { renderScreenplayPdfBytes } from "@/lib/export/screenplay-pdf"
import { parseFdx } from "@/lib/import/screenplay-fdx"
import type { FullProject, ProjectElement } from "@/services/project"

function fixture(): FullProject {
  const element = (type: string, content: string, line: number): ProjectElement => ({
    id: `e${line}`, project_id: "p", scene_id: "s", element_type: type, content, line_number: line,
    formatting: {}, created_at: "", updated_at: "",
  })
  return {
    id: "p", title: "The Crossing", description: "", owner_id: "u", category: "screenplay",
    status: "draft", is_starred: false, created_at: "", updated_at: "",
    scenes: [{ id: "s", project_id: "p", scene_heading: "INT. STATION - NIGHT", content: "", order_index: 0,
      created_at: "", updated_at: "", elements: [
        element("ACTION", "A <strong>train</strong> arrives &amp; stops.", 0),
        element("CHARACTER", "MARA", 1),
        element("DIALOG", "We have to cross before morning. ".repeat(120), 2),
      ] }],
  }
}

describe("screenplay submission exports", () => {
  it("keeps typed paragraphs and inline emphasis through FDX import", () => {
    const fdx = buildScreenplayFdx(fixture())
    if (process.env.INKWELL_FDX_QA_PATH) writeFileSync(process.env.INKWELL_FDX_QA_PATH, fdx)
    expect(fdx).toContain('<Text Style="Bold">train</Text>')
    const parsed = parseFdx(fdx)
    expect(parsed.warnings).toEqual([])
    expect(parsed.unsupportedStyles).toEqual([])
    expect(parsed.scenes[0].elements[0]).toEqual({ type: "ACTION", content: "A <strong>train</strong> arrives &amp; stops." })
    expect(parsed.scenes[0].elements[1].type).toBe("CHARACTER")
    expect(parsed.scenes[0].elements[2].type).toBe("DIALOG")
  })

  it("keeps words from an unfamiliar FDX paragraph and reports the type", () => {
    const fdx = buildScreenplayFdx(fixture()).replace('Type="Action"', 'Type="Singing"').replace('Style="Bold"', 'Style="Bold+AllCaps"')
    const parsed = parseFdx(fdx)
    expect(parsed.warnings).toEqual(["Singing"])
    expect(parsed.unsupportedStyles).toEqual(["AllCaps"])
    expect(parsed.scenes[0].elements[0].type).toBe("ACTION")
    expect(parsed.scenes[0].elements[0].content).toContain("train")
  })

  it("round-trips act break types within Inkwell FDX", () => {
    const data = fixture()
    data.scenes![0].elements!.push({ ...data.scenes![0].elements![0], id: "act", element_type: "END_ACT", content: "End of act", line_number: 3 })
    const parsed = parseFdx(buildScreenplayFdx(data))
    expect(parsed.scenes[0].elements.at(-1)?.type).toBe("END_ACT")
  })

  it("imports a screenplay file produced by an external FDX tool", () => {
    if (!process.env.INKWELL_EXTERNAL_FDX_PATH) return
    const parsed = parseFdx(readFileSync(process.env.INKWELL_EXTERNAL_FDX_PATH, "utf8"))
    expect(parsed.scenes.length).toBeGreaterThan(0)
    expect(parsed.scenes.flatMap(scene => scene.elements).some(item => item.type === "CHARACTER")).toBe(true)
    expect(parsed.scenes.flatMap(scene => scene.elements).some(item => item.type === "DIALOG")).toBe(true)
  })

  it("renders a long anonymous screenplay without author details", () => {
    const pdf = renderScreenplayPdfBytes(fixture(), { anonymous: true, byline: "Private Name", contact: "private@example.test" })
    if (process.env.INKWELL_SCREENPLAY_QA_PDF) writeFileSync(process.env.INKWELL_SCREENPLAY_QA_PDF, pdf)
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe("%PDF")
  })
})
