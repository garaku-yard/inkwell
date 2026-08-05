import { describe, expect, it } from "vitest"

import { mergeScenes } from "@/components/editor/shared/mergeScenes"
import type { Scene } from "@/services/project"

const scene = (id: string, heading: string, elements: Array<[string, string]> = []): Scene =>
  ({
    id,
    project_id: "p1",
    scene_heading: heading,
    content: "",
    order_index: 0,
    created_at: "",
    updated_at: "",
    elements: elements.map(([elId, content]) => ({
      id: elId,
      project_id: "p1",
      scene_id: id,
      element_type: "body",
      content,
      line_number: 0,
      formatting: {},
      created_at: "",
      updated_at: "",
    })),
  }) as Scene

describe("mergeScenes", () => {
  it("adds scenes the editor hasn't seen", () => {
    const local = [scene("s1", "Wake Up")]
    const merged = mergeScenes(local, [scene("s1", "Wake Up"), scene("s2", "The Long Room")])
    expect(merged.map((s) => s.id)).toEqual(["s1", "s2"])
  })

  it("adds new elements to a scene already on screen", () => {
    const local = [scene("s1", "Wake Up", [["e1", "first"]])]
    const merged = mergeScenes(local, [
      scene("s1", "Wake Up", [
        ["e1", "first"],
        ["e2", "second"],
      ]),
    ])
    expect(merged[0].elements?.map((e) => e.content)).toEqual(["first", "second"])
  })

  // The point of the whole function: a refetch must not overwrite what the
  // writer has typed but not yet saved.
  it("never overwrites the text of an element already on screen", () => {
    const local = [scene("s1", "Wake Up", [["e1", "half-typed sentence"]])]
    const merged = mergeScenes(local, [scene("s1", "Wake Up", [["e1", "stale from the database"]])])
    expect(merged[0].elements?.[0].content).toBe("half-typed sentence")
  })

  it("keeps a scene the database no longer reports, rather than pulling it away", () => {
    const local = [scene("s1", "Wake Up"), scene("s2", "Unsaved")]
    const merged = mergeScenes(local, [scene("s1", "Wake Up")])
    expect(merged.map((s) => s.id)).toEqual(["s1", "s2"])
  })

  it("returns the same array when nothing is new, so React can skip the render", () => {
    const local = [scene("s1", "Wake Up", [["e1", "first"]])]
    expect(mergeScenes(local, [scene("s1", "Wake Up", [["e1", "first"]])])).toBe(local)
  })

  it("fills an empty editor from scratch", () => {
    const merged = mergeScenes([], [scene("s1", "The Long Room")])
    expect(merged.map((s) => s.id)).toEqual(["s1"])
  })
})
