"use client"

import { useCallback, useEffect, useRef } from "react"
import type { Dispatch, SetStateAction } from "react"

import { createSceneElement, getFullProject, type Scene } from "@/services/project"

interface UseEditorDocumentOptions {
  projectId: string
  userId?: string
  units: Scene[]
  setUnits: Dispatch<SetStateAction<Scene[]>>
  scheduleSave: (id: string, content: string, isUnit: boolean) => void
  broadcastEdit: (id: string, content: string, isUnit: boolean) => void
  /** When supplied, every empty unit is provisioned with one persisted element. */
  emptyUnitElementType?: string
  emptyUnitElementContent?: string
}

/** Shared document lifecycle for every editor backed by Scene[]. Format editors
 * keep rendering and keyboard semantics; this hook owns the common state writes,
 * persistence/realtime fan-out, empty-unit provisioning, and authoritative reload.
 */
export function useEditorDocument({
  projectId,
  userId,
  units,
  setUnits,
  scheduleSave,
  broadcastEdit,
  emptyUnitElementType,
  emptyUnitElementContent = "",
}: UseEditorDocumentOptions) {
  const provisioningRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!userId || !emptyUnitElementType) return
    for (const unit of units) {
      if ((unit.elements?.length ?? 0) > 0 || provisioningRef.current.has(unit.id)) continue
      provisioningRef.current.add(unit.id)
      void createSceneElement(projectId, unit.id, userId, {
        element_type: emptyUnitElementType,
        content: emptyUnitElementContent,
        order_index: 0,
      }).then((element) => {
        setUnits((current) => current.map((item) => (
          item.id === unit.id ? { ...item, elements: [element] } : item
        )))
      }).catch(() => {
        provisioningRef.current.delete(unit.id)
      })
    }
  }, [emptyUnitElementContent, emptyUnitElementType, projectId, setUnits, units, userId])

  const handleContentChange = useCallback((id: string, content: string, isUnit: boolean) => {
    setUnits((current) => current.map((unit) => {
      if (isUnit) return unit.id === id ? { ...unit, scene_heading: content } : unit
      return {
        ...unit,
        elements: (unit.elements ?? []).map((element) => (
          element.id === id ? { ...element, content } : element
        )),
      }
    }))
    scheduleSave(id, content, isUnit)
    broadcastEdit(id, content, isUnit)
  }, [broadcastEdit, scheduleSave, setUnits])

  const refreshDocument = useCallback(async () => {
    if (!userId) return
    const fresh = await getFullProject(projectId, userId)
    setUnits(fresh.scenes ?? [])
  }, [projectId, setUnits, userId])

  return { handleContentChange, refreshDocument }
}
