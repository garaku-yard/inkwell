"use client"

import { useCallback } from "react"
import type { Dispatch, SetStateAction } from "react"

import { deleteScriptElement } from "@/services/editor"
import {
  createScene,
  createSceneElement,
  type ProjectElement,
  type Scene,
} from "@/services/project"

interface UseEditorMutationsOptions {
  projectId: string
  userId?: string
  units: Scene[]
  setUnits: Dispatch<SetStateAction<Scene[]>>
}

interface CreateUnitInput {
  title?: string
  content?: string
}

interface InsertElementInput {
  elementType: string
  content?: string
  afterIndex?: number
}

/** Shared structural writes for Scene[]-backed editors. Format code chooses
 * element types, seed content, focus behavior, transformations, and error UI. */
export function useEditorMutations({ projectId, userId, units, setUnits }: UseEditorMutationsOptions) {
  const createUnit = useCallback(async ({ title = "", content = "" }: CreateUnitInput = {}) => {
    if (!userId) return null
    const created = await createScene(projectId, userId, {
      scene_heading: title,
      content,
      order_index: units.length,
    })
    const unit = { ...created, elements: created.elements ?? [] }
    setUnits((current) => [...current, unit])
    return unit
  }, [projectId, setUnits, units.length, userId])

  const insertElement = useCallback(async (
    unitId: string,
    { elementType, content = "", afterIndex }: InsertElementInput,
  ): Promise<ProjectElement | null> => {
    if (!userId) return null
    const unit = units.find((item) => item.id === unitId)
    if (!unit) return null
    const insertAt = afterIndex === undefined ? (unit.elements?.length ?? 0) : afterIndex + 1
    const element = await createSceneElement(projectId, unitId, userId, {
      element_type: elementType,
      content,
      order_index: insertAt,
    })
    setUnits((current) => current.map((item) => {
      if (item.id !== unitId) return item
      const elements = [...(item.elements ?? [])]
      elements.splice(insertAt, 0, element)
      return { ...item, elements }
    }))
    return element
  }, [projectId, setUnits, units, userId])

  const deleteElement = useCallback(async (unitId: string, elementId: string) => {
    setUnits((current) => current.map((unit) => (
      unit.id === unitId
        ? { ...unit, elements: (unit.elements ?? []).filter((element) => element.id !== elementId) }
        : unit
    )))
    await deleteScriptElement(elementId)
  }, [setUnits])

  return { createUnit, insertElement, deleteElement }
}
