import type React from "react"

import {
  createDoubleTapDetector,
  isCaretAtElementEnd,
  isCaretAtElementStart,
  isElementEmpty,
  type Keymap,
} from "@/lib/editor/keymap"
import type { ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"

/**
 * Screenplay-specific keyboard rules. The generic engine in
 * lib/editor/keymap.ts knows nothing about element types — these
 * tables and the createScreenplayKeymap factory are the per-format
 * config that wires the engine to the screenplay's vocabulary.
 *
 * Other format editors can build their own keymap config the same way
 * (a similar prose-keymap.ts, comic-keymap.ts, etc.) when their key
 * handling outgrows a 3-line if-Enter check.
 */

export interface KeymapHandlers {
  handleFinalizeUpdate: (id: string, content: string, isScene: boolean) => void
  handleInsertElement: (
    type: ToolbarScriptElementType,
    targetElementId?: string,
    isTargetScene?: boolean,
  ) => void
  handleDeleteScene: (sceneId: string) => void
  handleDeleteElement: (elementId: string) => void
  handleSelectAll: (e: React.KeyboardEvent<HTMLDivElement>) => void
  handleChangeElementType: (
    elementId: string,
    newType: ToolbarScriptElementType,
    currentContent: string,
  ) => void
  handleNavigateToPrevious?: (elementId: string) => void
  handleNavigateToNext?: (elementId: string) => void
  handleAddNewScene?: () => void
}

/** Caller-supplied per-event context the keymap handlers consume. */
export interface ScreenplayKeyContext {
  elementId: string
  isScene: boolean
  elementType: ToolbarScriptElementType | "SCENE_HEADING"
}

/** Window for double-Enter detection. Two Enters within this many ms
 *  start a fresh scene; a single Enter falls through to the normal
 *  insert-next-element flow after the same delay so we can't fire both
 *  for what was meant to be a double-tap. */
const DOUBLE_ENTER_THRESHOLD = 300

/** Element type to insert when the user presses Enter inside an
 *  element of the given type. Drives the per-key dispatch instead of a
 *  switch statement that's just an inline lookup table. Scene
 *  headings are handled separately because they always insert ACTION. */
const NEXT_ELEMENT_AFTER_ENTER: Record<
  ToolbarScriptElementType,
  ToolbarScriptElementType
> = {
  ACTION: "ACTION",
  CHARACTER: "DIALOG",
  DIALOG: "ACTION",
  PARENTHETICAL: "DIALOG",
  TRANSITION: "ACTION",
  SHOT: "ACTION",
  TEXT: "TEXT",
  NOTE: "ACTION",
  OUTLINE: "ACTION",
  NEW_ACT: "ACTION",
  END_ACT: "ACTION",
  LYRICS: "LYRICS",
  SEQUENCE: "ACTION",
  DUAL_DIALOG: "DUAL_DIALOG",
}

/** Tab inside one of these element types inserts a new sibling of the
 *  mapped type. Other element types ignore Tab (Tab on a scene heading
 *  is a no-op too). */
const NEXT_ELEMENT_ON_TAB: Partial<
  Record<ToolbarScriptElementType, ToolbarScriptElementType>
> = {
  ACTION: "CHARACTER",
  DIALOG: "PARENTHETICAL",
}

/** mod+digit shortcuts. Note: 1 and 7 both bind to SHOT — two ways to
 *  reach the same element type, intentional in the original code. */
const NUMBER_KEY_TO_ELEMENT: Record<string, ToolbarScriptElementType> = {
  "1": "SHOT",
  "2": "ACTION",
  "3": "CHARACTER",
  "4": "PARENTHETICAL",
  "5": "DIALOG",
  "6": "TRANSITION",
  "7": "SHOT",
}

export function createScreenplayKeymap(
  handlers: KeymapHandlers,
): Keymap<ScreenplayKeyContext> {
  // Per-keymap closure state — owning the Enter timer here prevents
  // two simultaneous editor mounts from sharing it, which would let a
  // tap in one tab cancel a pending insert in the other.
  const enterDetector = createDoubleTapDetector(DOUBLE_ENTER_THRESHOLD)

  const handleEnter = (
    e: React.KeyboardEvent<HTMLDivElement>,
    { elementId, isScene, elementType }: ScreenplayKeyContext,
  ) => {
    e.preventDefault()
    const currentContent = e.currentTarget.innerHTML

    const wasDouble = enterDetector.scheduleOrDoubleTap(() => {
      handlers.handleFinalizeUpdate(elementId, currentContent, isScene)
      if (isScene) {
        handlers.handleInsertElement("ACTION", elementId, true)
        return
      }
      const nextType = NEXT_ELEMENT_AFTER_ENTER[elementType as ToolbarScriptElementType]
      if (nextType) {
        handlers.handleInsertElement(nextType, elementId, false)
      }
    })

    if (wasDouble && handlers.handleAddNewScene) {
      handlers.handleAddNewScene()
    }
  }

  const handleTab = (
    e: React.KeyboardEvent<HTMLDivElement>,
    { elementId, isScene, elementType }: ScreenplayKeyContext,
  ) => {
    e.preventDefault()
    if (isScene) return
    const newType = NEXT_ELEMENT_ON_TAB[elementType as ToolbarScriptElementType]
    if (!newType) return
    handlers.handleFinalizeUpdate(elementId, e.currentTarget.innerHTML, isScene)
    handlers.handleInsertElement(newType, elementId, false)
  }

  const handleBackspace = (
    e: React.KeyboardEvent<HTMLDivElement>,
    { elementId, isScene }: ScreenplayKeyContext,
  ) => {
    if (!isElementEmpty(e.currentTarget)) return
    e.preventDefault()
    if (isScene) handlers.handleDeleteScene(elementId)
    else handlers.handleDeleteElement(elementId)
  }

  const handleArrowUp = (
    e: React.KeyboardEvent<HTMLDivElement>,
    { elementId }: ScreenplayKeyContext,
  ) => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    if (
      isCaretAtElementStart(selection.getRangeAt(0), e.currentTarget) &&
      handlers.handleNavigateToPrevious
    ) {
      e.preventDefault()
      handlers.handleNavigateToPrevious(elementId)
    }
  }

  const handleArrowDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    { elementId }: ScreenplayKeyContext,
  ) => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    if (
      isCaretAtElementEnd(selection.getRangeAt(0), e.currentTarget) &&
      handlers.handleNavigateToNext
    ) {
      e.preventDefault()
      handlers.handleNavigateToNext(elementId)
    }
  }

  /** Factory for the seven mod+digit handlers. Each one swaps the
   *  current element to a different type without inserting a sibling. */
  const changeTypeHandler =
    (type: ToolbarScriptElementType) =>
    (
      e: React.KeyboardEvent<HTMLDivElement>,
      { elementId, isScene }: ScreenplayKeyContext,
    ) => {
      e.preventDefault()
      if (isScene) return
      handlers.handleChangeElementType(elementId, type, e.currentTarget.textContent ?? "")
    }

  const numberKeyEntries = Object.entries(NUMBER_KEY_TO_ELEMENT).map(
    ([digit, type]) => [`mod+${digit}`, changeTypeHandler(type)] as const,
  )

  return {
    enter: handleEnter,
    tab: handleTab,
    backspace: handleBackspace,
    arrowup: handleArrowUp,
    arrowdown: handleArrowDown,
    "mod+a": (e) => {
      handlers.handleSelectAll(e)
    },
    ...Object.fromEntries(numberKeyEntries),
  }
}
