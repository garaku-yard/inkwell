"use client"

import React, { useEffect, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { SCRIPT_ELEMENT_CONFIG, type ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"
import { MessageSquare } from "lucide-react"
import type { Scene, ScriptElement } from "@/services/project"
import { SceneHeadingAutocomplete } from "./SceneHeadingAutocomplete"
import { CharacterAutocomplete } from "./CharacterAutocomplete"

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
  focusAtEnd?: boolean
  onFocusHandled?: () => void
  // For character autocomplete
  scenes?: Scene[]
  currentSceneId?: string
}

// Helper to place cursor at end of contentEditable
const placeCursorAtEnd = (el: HTMLElement) => {
  el.focus()
  const selection = window.getSelection()
  if (selection) {
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false) // false = collapse to end
    selection.removeAllRanges()
    selection.addRange(range)
  }
}

export const EditableElement = React.memo(
  React.forwardRef<HTMLDivElement, EditableElementProps>((props, fwdRef) => {
    const { element, onContentChange, onFinalizeUpdate, onKeyDown, activeElementId, onFocus, onBlur, focusAtEnd, onFocusHandled, scenes, currentSceneId } = props
    const isScene = "scene_heading" in element
    const type = isScene ? "SCENE_HEADING" : element.element_type as ToolbarScriptElementType | "SCENE_HEADING"
    const content = isScene ? element.scene_heading : element.content
    const config = SCRIPT_ELEMENT_CONFIG[type as keyof typeof SCRIPT_ELEMENT_CONFIG] || SCRIPT_ELEMENT_CONFIG.ACTION
    const isActive = element.id === activeElementId
    const unresolvedCommentsCount = element.comments?.filter((c) => !c.isResolved).length || 0

    const elementRef = useRef<HTMLDivElement>(null)
    const lastSyncedContent = useRef(content)
    const isInitialMount = useRef(true)
    
    // Expose the element ref and a method to focus at end
    React.useImperativeHandle(fwdRef, () => {
      const el = elementRef.current!
      return Object.assign(el, {
        focusAtEnd: () => {
          if (elementRef.current) {
            placeCursorAtEnd(elementRef.current)
          }
        }
      })
    })

    // Set initial content on mount only
    useEffect(() => {
      if (isInitialMount.current && elementRef.current) {
        elementRef.current.innerHTML = content
        lastSyncedContent.current = content
        isInitialMount.current = false
      }
    }, [])

    // Handle focusAtEnd prop - focus and place cursor at end
    useEffect(() => {
      if (focusAtEnd && elementRef.current) {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          if (elementRef.current) {
            placeCursorAtEnd(elementRef.current)
            onFocusHandled?.()
          }
        })
      }
    }, [focusAtEnd, onFocusHandled])

    // Sync content from props ONLY when element is not focused and content changed externally
    useEffect(() => {
      if (
        !isInitialMount.current &&
        elementRef.current && 
        document.activeElement !== elementRef.current &&
        lastSyncedContent.current !== content
      ) {
        elementRef.current.innerHTML = content
        lastSyncedContent.current = content
      }
    }, [content])

    const handleSuggestionSelect = useCallback((suggestion: string) => {
      if (!elementRef.current) return

      const text = elementRef.current.textContent || ""
      const trimmedText = text.trim().toUpperCase()

      let newText = ""

      // Check if selecting a time of day (after dash)
      const dashMatch = trimmedText.match(/^(INT\.|EXT\.|I\/E\.|INT\.\/EXT\.)\s+(.+)\s+-\s*(.*)$/)
      if (dashMatch) {
        newText = `${dashMatch[1]} ${dashMatch[2]} - ${suggestion}`
      } else {
        newText = suggestion + " "
      }

      elementRef.current.textContent = newText
      onContentChange(element.id, newText, isScene)
      lastSyncedContent.current = newText

      // Move cursor to end
      requestAnimationFrame(() => {
        if (elementRef.current) {
          placeCursorAtEnd(elementRef.current)
        }
      })
    }, [element.id, isScene, onContentChange])

    // Handle character name autocomplete selection
    const handleCharacterSelect = useCallback((characterName: string) => {
      if (!elementRef.current) return

      elementRef.current.textContent = characterName
      onContentChange(element.id, characterName, false)
      lastSyncedContent.current = characterName

      // Move cursor to end
      requestAnimationFrame(() => {
        if (elementRef.current) {
          placeCursorAtEnd(elementRef.current)
        }
      })
    }, [element.id, onContentChange])

    const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
      const newContent = e.currentTarget.innerHTML
      lastSyncedContent.current = newContent
      onContentChange(element.id, newContent, isScene)
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
          role="textbox"
          aria-multiline="true"
          aria-label={isScene ? "Scene heading" : `${type.toLowerCase()} element`}
          aria-placeholder={isScene ? "Scene heading..." : getPlaceholderText(type)}
          onInput={handleInput}
          onFocus={() => onFocus(element.id, type)}
          onBlur={(e) => {
            onFinalizeUpdate(element.id, e.currentTarget.innerHTML, isScene)
            onBlur()
          }}
          onKeyDown={(e) => onKeyDown(e, element.id, isScene, type)}
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
        {!isScene && type === "CHARACTER" && scenes && currentSceneId && (
          <CharacterAutocomplete
            elementRef={elementRef}
            isActive={isActive}
            onSuggestionSelect={handleCharacterSelect}
            scenes={scenes}
            currentSceneId={currentSceneId}
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
    case "TEXT":
      return "General text..."
    case "NOTE":
      return "Script note (not printed)..."
    case "OUTLINE":
      return "Outline beat..."
    case "NEW_ACT":
      return "ACT ONE"
    case "END_ACT":
      return "END OF ACT"
    case "LYRICS":
      return "♪ Lyrics go here... ♪"
    case "SEQUENCE":
      return "MONTAGE - SEQUENCE NAME"
    case "DUAL_DIALOG":
      return "Dual dialogue..."
    default:
      return "Type here..."
  }
}

EditableElement.displayName = "EditableElement"
