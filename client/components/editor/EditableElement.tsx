"use client"

import React, { useEffect, useRef, useCallback, useState } from "react"
import { cn } from "@/lib/utils"
import { SCRIPT_ELEMENT_CONFIG, type ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"
import { MessageSquare } from "lucide-react"
import type { Scene, ScriptElement } from "@/services/project"
import { SceneHeadingAutocomplete } from "./SceneHeadingAutocomplete"

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
    const config = SCRIPT_ELEMENT_CONFIG[type] || SCRIPT_ELEMENT_CONFIG.ACTION
    const isActive = element.id === activeElementId
    const unresolvedCommentsCount = element.comments?.filter((c) => !c.isResolved).length || 0

    const elementRef = useRef<HTMLDivElement>(null)
    const isTypingRef = useRef(false)
    const lastContentRef = useRef(content)
    React.useImperativeHandle(fwdRef, () => elementRef.current!)

    const handleSuggestionSelect = useCallback((suggestion: string) => {
      if (!elementRef.current) return

      const text = elementRef.current.textContent || ""
      const trimmedText = text.trim().toUpperCase()

      let newText = ""

      // Check if selecting a time of day (after dash)
      const dashMatch = trimmedText.match(/^(INT\.|EXT\.|I\/E\.|INT\.\/EXT\.)\s+(.+)\s+-\s*(.*)$/)
      if (dashMatch) {
        // Replace everything after the dash with the suggestion
        newText = `${dashMatch[1]} ${dashMatch[2]} - ${suggestion}`
      } else {
        // Replace the scene prefix
        newText = suggestion + " "
      }

      elementRef.current.textContent = newText
      onContentChange(element.id, newText, isScene)

      // Move cursor to end
      setTimeout(() => {
        if (elementRef.current) {
          const range = document.createRange()
          const selection = window.getSelection()
          range.selectNodeContents(elementRef.current)
          range.collapse(false)
          selection?.removeAllRanges()
          selection?.addRange(range)
          elementRef.current.focus()
        }
      }, 0)
    }, [element.id, isScene, onContentChange])

    useEffect(() => {
      // Only update innerHTML if:
      // 1. Element is not currently focused
      // 2. User is not actively typing
      // 3. Content has actually changed from what we last set
      if (
        elementRef.current && 
        document.activeElement !== elementRef.current &&
        !isTypingRef.current &&
        lastContentRef.current !== content
      ) {
        elementRef.current.innerHTML = content
        lastContentRef.current = content
      }
    }, [content])

    const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
      isTypingRef.current = true
      onContentChange(element.id, e.currentTarget.innerHTML, isScene)
      
      // Reset typing flag after a short delay
      setTimeout(() => {
        isTypingRef.current = false
      }, 100)
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
        {isScene && (
          <SceneHeadingAutocomplete
            elementRef={elementRef}
            isActive={isActive}
            onSuggestionSelect={handleSuggestionSelect}
          />
        )}
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
