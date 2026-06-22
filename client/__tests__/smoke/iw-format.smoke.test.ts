import { describe, expect, it } from "vitest"

import { buildIwFile, parseIw, serializeIw, IW_FORMAT, IW_VERSION } from "@/lib/iw/format"
import type { FullProject } from "@/services/project"
import type { Beat, Connection, Lane, OutlineItem } from "@/lib/storage"

/**
 * Pins the `.iw` portable-project format: a build → serialize → parse round-trip
 * must preserve every field losslessly, and parse must reject non-.iw input.
 */

const project = {
  id: "p1",
  title: "The Lighthouse",
  description: "A novella.",
  owner_id: "u1",
  category: "novel",
  status: "draft",
  is_starred: true,
  created_at: "",
  updated_at: "",
  scenes: [
    {
      id: "s1",
      project_id: "p1",
      scene_heading: "Chapter 1",
      content: "",
      order_index: 0,
      created_at: "",
      updated_at: "",
      elements: [
        { id: "e1", project_id: "p1", scene_id: "s1", element_type: "paragraph", content: "The sea was loud.", line_number: 0, formatting: { bold: "1" }, created_at: "", updated_at: "" },
      ],
    },
  ],
} as unknown as FullProject

const beats: Beat[] = [
  { id: "b1", title: "Arrival", description: "", sceneNumbers: "1", color: "#FFD27F", position: { x: 10, y: 20 }, width: 200, height: 100, act: 1, order: 0, startPage: null, endPage: null, imageUrl: undefined },
]
const lanes: Lane[] = [{ id: "l1", name: "Act 1", color: "#CCC", order: 0 }]
const connections: Connection[] = []
const outlineItems: OutlineItem[] = [{ id: "o1", projectId: "p1", beatId: "b1", laneId: "l1", order: 0, timelinePosition: 5, width: 80 }]

describe("iw format", () => {
  it("round-trips a project losslessly (build → serialize → parse)", () => {
    const built = buildIwFile({
      project,
      characters: [{ id: "c1", project_id: "p1", name: "Mara", description: "keeper", role: "lead", attributes: {}, created_at: "", updated_at: "" }],
      locations: [{ id: "loc1", project_id: "p1", name: "Tower", description: "tall", type: "interior", created_at: "", updated_at: "" }],
      beats,
      lanes,
      connections,
      outlineItems,
      exportedAt: "2026-06-22T00:00:00.000Z",
    })

    const parsed = parseIw(serializeIw(built))

    expect(parsed.format).toBe(IW_FORMAT)
    expect(parsed.version).toBe(IW_VERSION)
    expect(parsed.project).toEqual({
      title: "The Lighthouse",
      description: "A novella.",
      category: "novel",
      status: "draft",
      isStarred: true,
    })
    expect(parsed.scenes[0].heading).toBe("Chapter 1")
    expect(parsed.scenes[0].elements[0]).toEqual({ type: "paragraph", content: "The sea was loud.", lineNumber: 0, formatting: { bold: "1" } })
    expect(parsed.characters[0]).toEqual({ name: "Mara", description: "keeper", role: "lead", attributes: {} })
    expect(parsed.locations[0]).toEqual({ name: "Tower", description: "tall", type: "interior" })
    // Beats/lanes keep their ids so the importer can remap references.
    expect(parsed.beats[0].id).toBe("b1")
    expect(parsed.lanes[0].id).toBe("l1")
    expect(parsed.outlineItems[0]).toEqual({ beatId: "b1", laneId: "l1", order: 0, timelinePosition: 5, width: 80 })
    // Whole-object structural equality is the real losslessness guarantee.
    expect(parsed).toEqual(built)
  })

  it("rejects a file that isn't an Inkwell project", () => {
    expect(() => parseIw(JSON.stringify({ hello: "world" }))).toThrow(/Inkwell project/)
    expect(() => parseIw("not json")).toThrow(/valid JSON/)
  })

  it("rejects a file from a newer schema version", () => {
    const future = JSON.stringify({ format: IW_FORMAT, version: IW_VERSION + 1, project: { category: "novel" } })
    expect(() => parseIw(future)).toThrow(/newer version/)
  })
})
