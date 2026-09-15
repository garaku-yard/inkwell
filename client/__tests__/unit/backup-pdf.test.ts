import { writeFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { renderGenericPdfBytes } from "@/lib/export/generic-pdf"
import { renderScreenplayPdfBytes } from "@/lib/export/screenplay-pdf"
import type { FullProject } from "@/services/project"

const project = {
  id: "p1", title: "The Long Road", description: "A readable backup preview.", owner_id: "u1",
  category: "novel", status: "draft", is_starred: false, created_at: "", updated_at: "",
  scenes: Array.from({ length: 8 }, (_, index) => ({
    id: `s${index}`, project_id: "p1", scene_heading: `Chapter ${index + 1}`, content: "",
    order_index: index, created_at: "", updated_at: "",
    elements: [{ id: `e${index}`, project_id: "p1", scene_id: `s${index}`, element_type: "paragraph",
      content: "The road continued beyond the hills. ".repeat(35), line_number: 0, formatting: {}, created_at: "", updated_at: "" }],
  })),
} as FullProject

describe("Drive backup PDF renderers", () => {
  it("produce valid PDF byte streams without opening a save dialog", () => {
    const generic = renderGenericPdfBytes(project)
    const screenplay = renderScreenplayPdfBytes({ ...project, category: "screenplay" })
    expect(new TextDecoder().decode(generic.slice(0, 4))).toBe("%PDF")
    expect(new TextDecoder().decode(screenplay.slice(0, 4))).toBe("%PDF")
    expect(generic.length).toBeGreaterThan(1_000)
    expect(screenplay.length).toBeGreaterThan(1_000)

    if (process.env.INKWELL_PDF_QA_OUTPUT) {
      writeFileSync(process.env.INKWELL_PDF_QA_OUTPUT, generic)
    }
  })
})
