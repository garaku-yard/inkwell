import type React from "react"

import {
  createElementNavigationKeymap,
  focusContentEditableAtEnd,
  focusContentEditableAtStart,
} from "@/lib/editor/element-navigation"
import { type Keymap } from "@/lib/editor/keymap"
import type { Scene } from "@/services/project"

/** Interactive Fiction element types — keep in sync with the union in
 *  InteractiveFictionEditor.tsx. */
export type IFElementType = "body" | "choice" | "conditional" | "set" | "note"

/** Tab cycles between body and choice — the two most-frequently
 *  alternating types when laying out a branch. Other types ignore Tab
 *  (no obvious counterpart and we don't want Tab to mean "insert
 *  random other type"). */
const NEXT_ELEMENT_ON_TAB: Partial<Record<IFElementType, IFElementType>> = {
  body: "choice",
  choice: "body",
}

/** mod+digit shortcuts for the five element types. body on 1 because
 *  it's the most common; choice on 2 because branches are the next
 *  most common; conditional / set / note round out 3-5. */
const NUMBER_KEY_TO_ELEMENT: Record<string, IFElementType> = {
  "1": "body",
  "2": "choice",
  "3": "conditional",
  "4": "set",
  "5": "note",
}

export interface IFKeyContext {
  passageId: string
  elementId: string
  elementType: IFElementType
}

interface CreateIFKeymapOptions {
  /** The currently-active passage. Navigation stays within it —
   *  arrow-up at the first element is a no-op, never jumps to the
   *  previous passage. */
  activePassage: Scene | null
  /** IF appends new elements at the end of the active passage rather
   *  than inserting after the current index — preserves the original
   *  behaviour of handleAddElement. The choice of next type follows
   *  the source: body→body, anything-else→choice. */
  insertElementAtEnd: (type: IFElementType) => void
  deleteEmptyElement: (passageId: string, elementId: string) => void
}

function flatNavigableIds(passage: Scene | null): string[] {
  if (!passage) return []
  return (passage.elements ?? []).map((el) => el.id)
}

function getElementNode(id: string): HTMLElement | null {
  if (typeof document === "undefined") return null
  return document.getElementById(`el-${id}`)
}

export function createIFKeymap(opts: CreateIFKeymapOptions): Keymap<IFKeyContext> {
  const insertViaDigit = (type: IFElementType) =>
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      e.preventDefault()
      opts.insertElementAtEnd(type)
    }

  const numberKeyEntries = Object.entries(NUMBER_KEY_TO_ELEMENT).map(
    ([digit, type]) => [`mod+${digit}`, insertViaDigit(type)] as const,
  )

  return {
    ...createElementNavigationKeymap<IFKeyContext>({
      getNeighbour: (ctx, dir) => {
        const list = flatNavigableIds(opts.activePassage)
        const idx = list.indexOf(ctx.elementId)
        if (idx === -1) return null
        return dir === "up" ? (list[idx - 1] ?? null) : (list[idx + 1] ?? null)
      },
      focusElementAtStart: (id) => focusContentEditableAtStart(getElementNode(id)),
      focusElementAtEnd: (id) => focusContentEditableAtEnd(getElementNode(id)),
      deleteEmptyElement: (ctx) => opts.deleteEmptyElement(ctx.passageId, ctx.elementId),
    }),
    enter: (e, ctx) => {
      if (e.shiftKey) return
      e.preventDefault()
      // Match the original: body→body, anything else→choice. Choice is
      // the most common follow-up after notes/sets/conditionals.
      opts.insertElementAtEnd(ctx.elementType === "body" ? "body" : "choice")
    },
    tab: (e, ctx) => {
      const next = NEXT_ELEMENT_ON_TAB[ctx.elementType]
      if (!next) return
      e.preventDefault()
      opts.insertElementAtEnd(next)
    },
    ...Object.fromEntries(numberKeyEntries),
  }
}
