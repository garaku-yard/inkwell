"use client"

import React from "react"
import type { Scene, ScriptElement } from "@/services/project"
import { cn } from "@/lib/utils"
import { SCRIPT_ELEMENT_CONFIG } from "@/lib/helpers/screenplay-config"

interface EditableElementProps {
  element: ScriptElement | Scene
  onUpdate: (id: string, content: string, isScene: boolean) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
  activeElementId: string | null // New prop for highlighting
  setActiveElementId: (id: string | null) => void // New prop for setting active element
}

/**
 * A memoized component that represents a single editable line in the screenplay.
 * It can be a scene heading or any other script element (Action, Character, etc.).
 * Memoization is crucial here to prevent re-rendering every line when only one changes.
 */
export const EditableElement = React.memo(
  React.forwardRef<HTMLDivElement, EditableElementProps>(
    ({ element, onUpdate, onKeyDown, activeElementId, setActiveElementId }, ref) => {
      // Determine if the element is a Scene or a ScriptElement
      const isScene = "setting" in element
      const type = isScene ? "SCENE_HEADING" : element.elementType
      const content = isScene ? element.setting : element.content
      const config = SCRIPT_ELEMENT_CONFIG[type]

      const isActive = element.id === activeElementId

      return (
        <div
          ref={ref}
          data-id={element.id}
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => {
            onUpdate(element.id, e.currentTarget.textContent || "", isScene)
            setActiveElementId(null) // Clear active element when focus leaves
          }}
          onFocus={() => setActiveElementId(element.id)} // Set active element on focus
          onKeyDown={onKeyDown}
          className={cn(
            "outline-none w-full py-2 font-['Courier_New',Courier,monospace] text-[12pt]", // Apply Courier 12pt and consistent vertical padding
            config.editorClasses,
            {
              "bg-blue-50": isActive, // Apply light blue background if active
            },
          )}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      )
    },
  ),
)

EditableElement.displayName = "EditableElement"
