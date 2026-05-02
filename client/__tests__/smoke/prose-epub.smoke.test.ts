import { describe, expect, it } from "vitest"
import { unzipSync, strFromU8 } from "fflate"

import { buildEpub } from "@/lib/export/prose-epub"
import type { FullProject } from "@/services/project"

function fakeProject(scenes: FullProject["scenes"]): FullProject {
  return {
    id: "p",
    title: "Test Book",
    description: "",
    owner_id: "u",
    category: "novel",
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

describe("buildEpub", () => {
  it("emits a valid EPUB archive with the required entries", () => {
    const bytes = buildEpub(
      fakeProject([
        {
          id: "s1",
          scene_heading: "The Beginning",
          order_index: 0,
          elements: [el("paragraph", "Once upon a time.", 0)],
        } as never,
      ]),
    )
    const entries = unzipSync(bytes)
    expect(Object.keys(entries)).toContain("mimetype")
    expect(Object.keys(entries)).toContain("META-INF/container.xml")
    expect(Object.keys(entries)).toContain("OEBPS/content.opf")
    expect(Object.keys(entries)).toContain("OEBPS/nav.xhtml")
    expect(strFromU8(entries["mimetype"])).toBe("application/epub+zip")
  })

  it("declares one spine itemref per chapter and a manifest entry", () => {
    const bytes = buildEpub(
      fakeProject([
        { id: "s1", scene_heading: "Ch1", order_index: 0, elements: [el("paragraph", "x", 0)] } as never,
        { id: "s2", scene_heading: "Ch2", order_index: 1, elements: [el("paragraph", "y", 0)] } as never,
      ]),
    )
    const opf = strFromU8(unzipSync(bytes)["OEBPS/content.opf"])
    expect(opf.match(/<itemref/g)?.length).toBe(2)
    expect(opf).toContain('id="chap-1"')
    expect(opf).toContain('id="chap-2"')
  })

  it("renders chapter content as XHTML with paragraph elements", () => {
    const bytes = buildEpub(
      fakeProject([
        {
          id: "s1",
          scene_heading: "Quoted",
          order_index: 0,
          elements: [
            el("paragraph", "He said: <hello> & goodbye.", 0),
            el("dialogue", "“Hi.”", 1),
            el("scene_break", "* * *", 2),
          ],
        } as never,
      ]),
    )
    const xhtml = strFromU8(unzipSync(bytes)["OEBPS/chapter-001.xhtml"])
    // XML-escapes preserved
    expect(xhtml).toContain("&lt;hello&gt;")
    expect(xhtml).toContain("&amp; goodbye.")
    // Per-type classes applied
    expect(xhtml).toContain('class="dialogue"')
    expect(xhtml).toContain('class="scene-break"')
  })

  it("escapes title characters in metadata", () => {
    const project = fakeProject([
      { id: "s1", scene_heading: "Ch", order_index: 0, elements: [] } as never,
    ])
    project.title = `R&D <"epic">`
    const opf = strFromU8(unzipSync(buildEpub(project))["OEBPS/content.opf"])
    // Quotes don't need escaping inside an XML text node (only <, >, &).
    expect(opf).toContain(`R&amp;D &lt;"epic"&gt;`)
  })
})
