import { describe, it, expect } from "vitest"

import { mergeResyncedScenes } from "@/components/editor/shared/resync"
import type { Scene } from "@/services/project"

/** Minimal Scene factory for the merge tests. */
function scene(id: string, heading: string, els: Array<[string, string]> = []): Scene {
  return {
    id,
    project_id: "p",
    scene_heading: heading,
    content: "",
    order_index: 0,
    created_at: "",
    updated_at: "",
    elements: els.map(([eid, content]) => ({
      id: eid,
      project_id: "p",
      scene_id: id,
      element_type: "body",
      content,
      line_number: 0,
      formatting: {},
      created_at: "",
      updated_at: "",
    })),
  }
}

describe("mergeResyncedScenes", () => {
  it("takes the server's truth for non-active nodes", () => {
    const prev = [scene("s1", "Old", [["e1", "old body"]])]
    const fresh = [scene("s1", "New", [["e1", "new body"]])]
    const merged = mergeResyncedScenes(prev, fresh, null)
    expect(merged[0].scene_heading).toBe("New")
    expect(merged[0].elements?.[0].content).toBe("new body")
  })

  it("preserves the body element the writer is actively editing", () => {
    const prev = [scene("s1", "H", [["e1", "my in-progress text"]])]
    const fresh = [scene("s1", "H", [["e1", "stale server text"]])]
    const merged = mergeResyncedScenes(prev, fresh, "el-e1")
    expect(merged[0].elements?.[0].content).toBe("my in-progress text")
  })

  it("preserves the heading the writer is actively editing", () => {
    const prev = [scene("s1", "my draft title", [])]
    const fresh = [scene("s1", "stale title", [])]
    const merged = mergeResyncedScenes(prev, fresh, "head-s1")
    expect(merged[0].scene_heading).toBe("my draft title")
  })

  it("picks up passages and elements added while offline, drops removed ones", () => {
    const prev = [scene("s1", "Kept", [["e1", "a"]])]
    const fresh = [scene("s1", "Kept", [["e1", "a"], ["e2", "added"]]), scene("s2", "New passage")]
    const merged = mergeResyncedScenes(prev, fresh, null)
    expect(merged.map((s) => s.id)).toEqual(["s1", "s2"])
    expect(merged[0].elements?.map((e) => e.id)).toEqual(["e1", "e2"])
  })

  it("uses fresh content when the active node no longer exists in prev", () => {
    const prev: Scene[] = []
    const fresh = [scene("s1", "H", [["e1", "server"]])]
    // Active id references an element we have no prior copy of → fresh wins.
    const merged = mergeResyncedScenes(prev, fresh, "el-e1")
    expect(merged[0].elements?.[0].content).toBe("server")
  })
})
