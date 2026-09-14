import { act, renderHook } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useEditorMutations } from "@/components/editor/shared/useEditorMutations"
import type { Scene } from "@/services/project"

const { createScene, createSceneElement, deleteScriptElement } = vi.hoisted(() => ({
  createScene: vi.fn(),
  createSceneElement: vi.fn(),
  deleteScriptElement: vi.fn(),
}))

vi.mock("@/services/project", () => ({ createScene, createSceneElement }))
vi.mock("@/services/editor", () => ({ deleteScriptElement }))

const initial: Scene[] = [{
  id: "unit-1",
  project_id: "project-1",
  scene_heading: "One",
  content: "",
  order_index: 0,
  created_at: "",
  updated_at: "",
  elements: [{
    id: "element-1",
    project_id: "project-1",
    scene_id: "unit-1",
    element_type: "paragraph",
    content: "First",
    line_number: 0,
    formatting: {},
    created_at: "",
    updated_at: "",
  }],
}]

describe("useEditorMutations", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates units and inserts and deletes ordered elements through one state path", async () => {
    createScene.mockResolvedValue({ ...initial[0], id: "unit-2", scene_heading: "Two", order_index: 1, elements: undefined })
    createSceneElement.mockResolvedValue({
      id: "element-2", project_id: "project-1", scene_id: "unit-1", element_type: "dialogue",
      content: "Second", line_number: 1, formatting: {}, created_at: "", updated_at: "",
    })
    deleteScriptElement.mockResolvedValue(undefined)

    const { result } = renderHook(() => {
      const [units, setUnits] = useState(initial)
      return {
        units,
        ...useEditorMutations({ projectId: "project-1", userId: "user-1", units, setUnits }),
      }
    })

    await act(async () => { await result.current.createUnit({ title: "Two" }) })
    expect(result.current.units.map((unit) => unit.id)).toEqual(["unit-1", "unit-2"])
    expect(createScene).toHaveBeenCalledWith("project-1", "user-1", expect.objectContaining({ order_index: 1 }))

    await act(async () => {
      await result.current.insertElement("unit-1", { elementType: "dialogue", content: "Second", afterIndex: 0 })
    })
    expect(result.current.units[0].elements?.map((element) => element.id)).toEqual(["element-1", "element-2"])

    await act(async () => { await result.current.deleteElement("unit-1", "element-1") })
    expect(result.current.units[0].elements?.map((element) => element.id)).toEqual(["element-2"])
    expect(deleteScriptElement).toHaveBeenCalledWith("element-1")
  })
})
