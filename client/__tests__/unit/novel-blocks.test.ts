import { describe, expect, it } from "vitest"
import { novelNumbering, novelReferenceLabel, type NovelBlock } from "@/lib/editor/novel-blocks"
import { renderNovelHtml } from "@/lib/export/novel-html"
import type { FullProject, ProjectElement, Scene } from "@/services/project"

const element = (id: string, block: NovelBlock, line_number: number): ProjectElement => ({
  id, project_id: "book", scene_id: "", element_type: block.kind, content: JSON.stringify(block),
  line_number, formatting: {}, created_at: "", updated_at: "",
})
const scene = (id: string, order_index: number, elements: ProjectElement[]): Scene => ({
  id, project_id: "book", scene_heading: id, content: "", order_index, elements, created_at: "", updated_at: "",
})
const figure = (caption: string): NovelBlock => ({ kind: "figure", caption, alt: caption, image: "" })
const step = (title: string): NovelBlock => ({ kind: "step", title, body: "Do it", image: "" })

describe("novel blocks", () => {
  it("renumbers figures and steps from document order after moves", () => {
    const first = scene("Opening", 0, [element("f1", figure("First"), 0), element("s1", step("Cut"), 1), element("s2", step("Join"), 2)])
    const second = scene("Finish", 1, [element("f2", figure("Second"), 0)])
    const project = { category: "novel", scenes: [first, second] } as FullProject
    let numbers = novelNumbering(project)
    expect(numbers.figureLabels.get("f2")).toBe("Fig 2.1")
    expect(numbers.stepLabels.get("s2")).toBe("Step 2")
    second.order_index = 0
    first.order_index = 1
    first.elements = [first.elements![0], first.elements![2], first.elements![1]]
    numbers = novelNumbering(project)
    expect(numbers.figureLabels.get("f2")).toBe("Fig 1.1")
    expect(numbers.figureLabels.get("f1")).toBe("Fig 2.1")
    expect(numbers.stepLabels.get("s2")).toBe("Step 1")
    expect(novelReferenceLabel({ kind: "cross_reference", targetType: "figure", targetId: "f1" }, numbers)).toBe("Fig 2.1")
  })

  it("renders structured blocks and live references in standalone A7 HTML", () => {
    const project = {
      id: "book", title: "Build <Guide>", category: "novel",
      scenes: [scene("Workshop", 0, [
        element("f1", figure("A clamp"), 0),
        element("m1", { kind: "materials", materials: "Wood\nGlue", tools: "Saw" }, 1),
        element("c1", { kind: "callout", tone: "warning", body: "Wear goggles" }, 2),
        element("r1", { kind: "cross_reference", targetType: "figure", targetId: "f1" }, 3),
      ])],
    } as FullProject
    const html = renderNovelHtml(project, "a7")
    expect(html).toContain("@page { size: A7")
    expect(html).toContain("Fig 1.1. A clamp")
    expect(html).toContain('href="#figure-f1"')
    expect(html).toContain("<li>Wood</li><li>Glue</li>")
    expect(html).toContain("Wear goggles")
    expect(html).toContain("Build &lt;Guide&gt;")
  })

  it("sorts glossary and index terms and resolves index links after a chapter move", () => {
    const first = scene("Workshop", 0, [
      element("f1", figure("Clamp"), 0),
      element("g1", { kind: "glossary", entries: [{ term: "Vise", definition: "A holding tool" }, { term: "Awl", definition: "A pointed tool" }] }, 1),
      element("i1", { kind: "index", entries: [{ term: "Vise", targetType: "figure", targetId: "f1" }, { term: "Awl", targetType: "chapter", targetId: "s2" }] }, 2),
    ])
    const second = scene("s2", 1, [])
    const project = { id: "book", title: "Handbook", category: "novel", scenes: [first, second] } as FullProject
    second.order_index = 0
    first.order_index = 1
    const html = renderNovelHtml(project, "a6")
    expect(html.indexOf("<dt>Awl</dt>")).toBeLessThan(html.indexOf("<dt>Vise</dt>"))
    expect(html).toContain('href="#chapter-s2">Chapter 1 — s2</a>')
    expect(html).toContain('href="#figure-f1">Fig 2.1</a>')
    expect(html).toContain("@page { size: A6")
  })
})
