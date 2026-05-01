import type React from "react"
import type { ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"

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

/** Window for double-Enter detection. Two Enters within this many ms
 *  start a fresh scene; a single Enter falls through to the normal
 *  insert-next-element flow after the same delay so we can't fire both
 *  for what was meant to be a double-tap. */
const DOUBLE_ENTER_THRESHOLD = 300

/** Element type to insert when the user presses Enter inside an
 *  element of the given type. Drives the per-key dispatch instead of a
 *  switch statement that's just an inline lookup table. Scene
 *  headings are handled separately because they always insert ACTION. */
const NEXT_ELEMENT_AFTER_ENTER: Record<ToolbarScriptElementType, ToolbarScriptElementType> = {
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
const NEXT_ELEMENT_ON_TAB: Partial<Record<ToolbarScriptElementType, ToolbarScriptElementType>> = {
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

/** True on Apple platforms where Cmd is the primary modifier. Browsers
 *  expose `metaKey` for Cmd on Mac and the Win key on Windows; we want
 *  the former to count as "Mod" but not the latter. */
function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false
  return /Mac|iPad|iPhone|iPod/.test(navigator.platform)
}

/** Builds a canonical key string with the cross-platform "mod" modifier
 *  collapsing Cmd-on-Mac and Ctrl-elsewhere into a single token. The
 *  keymap keys use the same `mod+` convention so we don't end up with
 *  parallel ctrl+/meta+ entries. Modifier order is fixed
 *  (mod, shift, alt) so callers don't need to think about ordering. */
export const getKeyString = (e: React.KeyboardEvent): string => {
  const mac = isMacPlatform()
  const mod = mac ? e.metaKey : e.ctrlKey
  let key = e.key.toLowerCase()
  if (mod) key = `mod+${key}`
  if (e.shiftKey) key = `shift+${key}`
  if (e.altKey) key = `alt+${key}`
  return key
}

export const createKeymap = (handlers: KeymapHandlers) => {
  // Per-keymap closure state — owning the Enter timer here prevents
  // two simultaneous editor mounts from sharing it, which would let a
  // tap in one tab cancel a pending insert in the other.
  let lastEnterTime = 0
  let pendingEnterTimeout: ReturnType<typeof setTimeout> | null = null

  const cancelPendingEnter = () => {
    if (pendingEnterTimeout) {
      clearTimeout(pendingEnterTimeout)
      pendingEnterTimeout = null
    }
  }

  const handleEnter = (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean,
    elementType: ToolbarScriptElementType | "SCENE_HEADING",
  ) => {
    e.preventDefault()

    const now = Date.now()
    const isDoubleEnter = now - lastEnterTime < DOUBLE_ENTER_THRESHOLD
    lastEnterTime = now

    if (isDoubleEnter && handlers.handleAddNewScene) {
      cancelPendingEnter()
      handlers.handleAddNewScene()
      return
    }

    const currentContent = e.currentTarget.innerHTML
    cancelPendingEnter()
    pendingEnterTimeout = setTimeout(() => {
      pendingEnterTimeout = null
      handlers.handleFinalizeUpdate(elementId, currentContent, isScene)
      if (isScene) {
        handlers.handleInsertElement("ACTION", elementId, true)
        return
      }
      const nextType = NEXT_ELEMENT_AFTER_ENTER[elementType as ToolbarScriptElementType]
      if (nextType) {
        handlers.handleInsertElement(nextType, elementId, false)
      }
    }, DOUBLE_ENTER_THRESHOLD)
  }

  const handleTab = (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
    isScene: boolean,
    elementType: ToolbarScriptElementType | "SCENE_HEADING",
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
    elementId: string,
    isScene: boolean,
  ) => {
    const content = e.currentTarget.innerHTML
    if (content !== "" && content !== "<br>") return
    e.preventDefault()
    if (isScene) handlers.handleDeleteScene(elementId)
    else handlers.handleDeleteElement(elementId)
  }

  const handleArrowUp = (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
  ) => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    const element = e.currentTarget
    const isAtStart =
      range.startOffset === 0 &&
      (range.startContainer === element ||
        range.startContainer === element.firstChild ||
        element.textContent?.length === 0)
    if (isAtStart && handlers.handleNavigateToPrevious) {
      e.preventDefault()
      handlers.handleNavigateToPrevious(elementId)
    }
  }

  const handleArrowDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    elementId: string,
  ) => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    const element = e.currentTarget
    const textLength = element.textContent?.length || 0
    const isAtEnd =
      range.collapsed &&
      (range.endOffset === textLength ||
        (range.endContainer === element.lastChild &&
          range.endOffset === (range.endContainer.textContent?.length || 0)) ||
        textLength === 0)
    if (isAtEnd && handlers.handleNavigateToNext) {
      e.preventDefault()
      handlers.handleNavigateToNext(elementId)
    }
  }

  /** Factory for the seven mod+digit handlers. Each one swaps the
   *  current element to a different type without inserting a sibling. */
  const changeTypeHandler = (type: ToolbarScriptElementType) =>
    (
      e: React.KeyboardEvent<HTMLDivElement>,
      elementId: string,
      isScene: boolean,
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
    "mod+a": (e: React.KeyboardEvent<HTMLDivElement>) => {
      handlers.handleSelectAll(e)
    },
    ...Object.fromEntries(numberKeyEntries),
  }
}
