"use client"

import React, { useEffect, useRef, useCallback } from "react"
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
    const isScene = "scene_heading" in element
    const type = isScene ? "SCENE_HEADING" : element.element_type
    const content = isScene ? element.scene_heading : element.content
    const config = SCRIPT_ELEMENT_CONFIG[type] || SCRIPT_ELEMENT_CONFIG.ACTION // Fallback to ACTION if type not found
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

    const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
      onContentChange(element.id, e.currentTarget.innerHTML, isScene)
    }, [element.id, isScene, onContentChange])

    return (
      <div
        className={cn(
          "outline-none w-full py-1 font-['Courier_New',Courier,monospace] text-[12pt] relative block",
          config.editorClasses,
          {
            "bg-blue-50 dark:bg-blue-900/20": isActive,
          },
        )}
      >
        <div
          ref={elementRef}
          data-id={element.id}
          data-screenplay-text
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onFocus={() => onFocus(element.id, type)}
          onBlur={(e) => {
            onFinalizeUpdate(element.id, e.currentTarget.innerHTML, isScene)
            onBlur()
          }}
          onKeyDown={(e) => onKeyDown(e, element.id, isScene, type)}
          dangerouslySetInnerHTML={{ __html: content }}
          className={cn(
            "leading-[1.5] outline-none resize-none block",
            "screenplay-text",
            "whitespace-pre-wrap",
            "empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400",
            "min-h-[1.5em]",
          )}
          data-placeholder={isScene ? "Scene heading..." : getPlaceholderText(type)}
        />
        {unresolvedCommentsCount > 0 && (
          <div className="absolute top-1 right-1 p-1 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs z-10">
            <MessageSquare className="h-3 w-3" />
            <span className="ml-1">{unresolvedCommentsCount}</span>
          </div>
        )}
      </div>
    )
  }),
)

// Helper function for placeholder text
function getPlaceholderText(type: ToolbarScriptElementType | "SCENE_HEADING") {
  switch (type) {
    case "ACTION":
      return "Describe the action..."
    case "CHARACTER":
      return "CHARACTER NAME"
    case "DIALOG":
      return "Character dialogue..."
    case "PARENTHETICAL":
      return "(stage direction)"
    case "TRANSITION":
      return "FADE IN:"
    case "SHOT":
      return "CLOSE UP:"
    default:
      return "Type here..."
  }
}

EditableElement.displayName = "EditableElement"
