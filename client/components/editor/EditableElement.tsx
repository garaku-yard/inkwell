"use client"

import React, { useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"
import { SCRIPT_ELEMENT_CONFIG, type ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"
import { MessageSquare } from "lucide-react"
import type { Scene, ScriptElement } from "@/services/project"
import { SceneHeadingAutocomplete } from "./SceneHeadingAutocomplete"
import { CharacterAutocomplete } from "./CharacterAutocomplete"
import { useStableContentEditable } from "./shared/StableContentEditable"

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

export const EditableElement = React.memo(
  React.forwardRef<HTMLDivElement, EditableElementProps>((props, fwdRef) => {
    const {
      element,
      onContentChange,
      onFinalizeUpdate,
      onKeyDown,
      activeElementId,
      onFocus,
      onBlur,
      focusAtEnd,
      onFocusHandled,
      scenes,
      currentSceneId,
    } = props
    const isScene = "scene_heading" in element
    const type = isScene ? "SCENE_HEADING" : (element.element_type as ToolbarScriptElementType | "SCENE_HEADING")
    const content = isScene ? element.scene_heading : element.content
    const config = SCRIPT_ELEMENT_CONFIG[type as keyof typeof SCRIPT_ELEMENT_CONFIG] || SCRIPT_ELEMENT_CONFIG.ACTION
    const isActive = element.id === activeElementId
    const unresolvedCommentsCount = element.comments?.filter((c) => !c.isResolved).length || 0

    // The contentEditable mechanics live in the shared primitive — we
    // wire it up via the hook so the autocomplete popovers below can
    // pin themselves to the same DOM node. Mode is "html" because
    // screenplay preserves bold/italic runs across save/load.
    const { ref, contentEditableProps, handle } = useStableContentEditable({
      value: content,
      onValueChange: useCallback(
        (next: string) => onContentChange(element.id, next, isScene),
        [element.id, isScene, onContentChange],
      ),
      mode: "html",
    })

    // Expose a DOM ref augmented with focusAtEnd so the screenplay
    // editor can keep its existing `ref.current.focusAtEnd()` call
    // sites unchanged. The augmentation is per-render; that's fine
    // because the underlying element is stable for the component's
    // lifetime.
    React.useImperativeHandle(fwdRef, () => {
      const el = handle.element
      if (!el) return null as unknown as HTMLDivElement
      return Object.assign(el, {
        focusAtEnd: () => handle.focusAtEnd(),
      })
    })

    // External `focusAtEnd` prop trigger — used by the editor when a
    // newly inserted element should claim focus. Defers to the
    // primitive's imperative method.
    useEffect(() => {
      if (focusAtEnd) {
        handle.focusAtEnd()
        onFocusHandled?.()
      }
      // handle is rebuilt every render but its closures all read the
      // same ref, so we deliberately depend only on the trigger flag.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusAtEnd, onFocusHandled])

    // Scene-heading autocomplete acceptance: replace the line with
    // the chosen suggestion (preserving any leading INT./EXT. + slug
    // that the user already typed) and park the caret at the end.
    const handleSuggestionSelect = useCallback(
      (suggestion: string) => {
        const text = handle.getContent().replace(/<[^>]+>/g, "")
        const trimmedText = text.trim().toUpperCase()
        const dashMatch = trimmedText.match(/^(INT\.|EXT\.|I\/E\.|INT\.\/EXT\.)\s+(.+)\s+-\s*(.*)$/)
        const newText = dashMatch ? `${dashMatch[1]} ${dashMatch[2]} - ${suggestion}` : `${suggestion} `
        handle.setContent(newText)
        handle.focusAtEnd()
      },
      [handle],
    )

    // Character-cue autocomplete acceptance: replace the entire line
    // with the chosen character name and park the caret at the end.
    const handleCharacterSelect = useCallback(
      (characterName: string) => {
        handle.setContent(characterName)
        handle.focusAtEnd()
      },
      [handle],
    )

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
          ref={ref}
          {...contentEditableProps}
          data-id={element.id}
          data-screenplay-text
          data-placeholder={isScene ? "Scene heading..." : getPlaceholderText(type)}
          aria-label={isScene ? "Scene heading" : `${type.toLowerCase()} element`}
          aria-placeholder={isScene ? "Scene heading..." : getPlaceholderText(type)}
          onFocus={(e) => {
            contentEditableProps.onFocus(e)
            onFocus(element.id, type)
          }}
          onBlur={(e) => {
            contentEditableProps.onBlur(e)
            onFinalizeUpdate(element.id, handle.getContent(), isScene)
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
        />
        {isScene && (
          <SceneHeadingAutocomplete
            elementRef={ref}
            isActive={isActive}
            onSuggestionSelect={handleSuggestionSelect}
          />
        )}
        {!isScene && type === "CHARACTER" && scenes && currentSceneId && (
          <CharacterAutocomplete
            elementRef={ref}
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
