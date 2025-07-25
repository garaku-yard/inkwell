"use client"

import React, { useEffect, useRef } from "react"
import type { Scene, ScriptElement } from "@/services/project"
import { cn } from "@/lib/utils"
import { SCRIPT_ELEMENT_CONFIG, type ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"

interface EditableElementProps {
  element: ScriptElement | Scene
  onContentChange: (id: string, content: string, isScene: boolean) => void
  onFinalizeUpdate: (id: string, content: string, isScene: boolean) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, elementId: string, isScene: boolean) => void
  activeElementId: string | null
  onFocus: (id: string, type: ToolbarScriptElementType | "SCENE_HEADING" | null) => void
  onBlur: () => void
}

export const EditableElement = React.memo(
  React.forwardRef<HTMLDivElement, EditableElementProps>(
    (props, fwdRef) => {
      const { element, onContentChange, onFinalizeUpdate, onKeyDown, activeElementId, onFocus, onBlur } = props
      const isScene = "setting" in element
      const type = isScene ? "SCENE_HEADING" : element.elementType
      const content = isScene ? element.setting : element.content
      const config = SCRIPT_ELEMENT_CONFIG[type]
      const isActive = element.id === activeElementId

      const elementRef = useRef<HTMLDivElement>(null)
      React.useImperativeHandle(fwdRef, () => elementRef.current!)

      useEffect(() => {
        if (elementRef.current && document.activeElement !== elementRef.current) {
          if (elementRef.current.innerHTML !== content) {
            elementRef.current.innerHTML = content
          }
        }
      }, [content])

      return (
        <div
          ref={elementRef}
          data-id={element.id}
          contentEditable
          suppressContentEditableWarning
          // On input, we just notify the parent for debounced saving, without causing a re-render.
          onInput={(e) => onContentChange(element.id, e.currentTarget.innerHTML, isScene)}
          // On focus, we tell the parent which element is active for highlighting.
          onFocus={() => onFocus(element.id, type)}
          // On blur, we do a final sync to update React state and trigger an immediate save.
          onBlur={(e) => {
            onFinalizeUpdate(element.id, e.currentTarget.innerHTML, isScene)
            onBlur() // This resets the active element state in the parent.
          }}
          onKeyDown={(e) => onKeyDown(e, element.id, isScene)}
          className={cn(
            "outline-none w-full py-2 font-['Courier_New',Courier,monospace] text-[12pt]",
            config.editorClasses,
            {
              "bg-blue-50 dark:bg-blue-900/20": isActive,
            },
          )}
          // Set the initial content. `useEffect` will handle subsequent updates.
          dangerouslySetInnerHTML={{ __html: content }}
        />
      )
    },
  ),
)

EditableElement.displayName = "EditableElement"
