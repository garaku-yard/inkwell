"use client"

import React, { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { SCRIPT_ELEMENT_CONFIG, type ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"
import { MessageSquare } from "lucide-react" // NEW: Import MessageSquare
import type { Scene, ScriptElement } from "@/services/project" // NEW: Import Comment

interface EditableElementProps {
  element: ScriptElement | Scene
  onContentChange: (id: string, content: string, isScene: boolean) => void
  onFinalizeUpdate: (id: string, content: string, isScene: boolean) => void
  onKeyDown: (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean,
    elementType: ToolbarScriptElementType | "SCENE_HEADING",
  ) => void
  activeElementId: string | null
  onFocus: (id: string, type: ToolbarScriptElementType | "SCENE_HEADING" | null) => void
  onBlur: () => void
}

export const EditableElement = React.memo(
  React.forwardRef<HTMLDivElement, EditableElementProps>((props, fwdRef) => {
    const { element, onContentChange, onFinalizeUpdate, onKeyDown, activeElementId, onFocus, onBlur } = props
    const isScene = "setting" in element
    const type = isScene ? "SCENE_HEADING" : element.elementType
    const content = isScene ? element.setting : element.content
    const config = SCRIPT_ELEMENT_CONFIG[type]
    const isActive = element.id === activeElementId
    const unresolvedCommentsCount = element.comments?.filter((c) => !c.isResolved).length || 0

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
        className={cn(
          "outline-none w-full py-2 font-['Courier_New',Courier,monospace] text-[12pt] relative", // Added relative
          config.editorClasses,
          {
            "bg-blue-50 dark:bg-blue-900/20": isActive,
          },
        )}
      >
        <div
          ref={elementRef}
          data-id={element.id}
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => onContentChange(element.id, e.currentTarget.innerHTML, isScene)}
          onFocus={() => onFocus(element.id, type)}
          onBlur={(e) => {
            onFinalizeUpdate(element.id, e.currentTarget.innerHTML, isScene)
            onBlur()
          }}
          onKeyDown={(e) => onKeyDown(e, element.id, isScene, type)}
          dangerouslySetInnerHTML={{ __html: content }}
          className="w-full h-full" // Ensure the inner div takes full space
        />
        {unresolvedCommentsCount > 0 && ( // Show badge only if there are unresolved comments
          <div className="absolute top-1 right-1 p-1 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs z-10">
            <MessageSquare className="h-3 w-3" />
            <span className="ml-1">{unresolvedCommentsCount}</span>
          </div>
        )}
      </div>
    )
  }),
)

EditableElement.displayName = "EditableElement"
