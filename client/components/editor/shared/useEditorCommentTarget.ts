import { useMemo } from "react"

import type { Scene } from "@/services/project"

import type { EditorSidebarCommentTarget } from "./EditorSidebar"

interface UseEditorCommentTargetOptions {
  units: Scene[]
  focusedElementId?: string | null
  focusedUnitId?: string | null
  activeUnitId?: string | null
}

/** Resolves the shared comment target rule: focused element, focused unit,
 * active unit, then the first unit in the document. */
export function useEditorCommentTarget({
  units,
  focusedElementId,
  focusedUnitId,
  activeUnitId,
}: UseEditorCommentTargetOptions): EditorSidebarCommentTarget | null {
  return useMemo(() => {
    if (focusedElementId) {
      for (const unit of units) {
        const element = (unit.elements ?? []).find((item) => item.id === focusedElementId)
        if (element) return { item: element, isScene: false }
      }
    }
    if (focusedUnitId) {
      const focused = units.find((unit) => unit.id === focusedUnitId)
      if (focused) return { item: focused, isScene: true }
    }
    const fallback = units.find((unit) => unit.id === activeUnitId) ?? units[0]
    return fallback ? { item: fallback, isScene: true } : null
  }, [activeUnitId, focusedElementId, focusedUnitId, units])
}
