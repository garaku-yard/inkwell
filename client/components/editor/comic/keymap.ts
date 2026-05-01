import type React from "react"

import {
  createElementNavigationKeymap,
  focusContentEditableAtEnd,
  focusContentEditableAtStart,
} from "@/lib/editor/element-navigation"
import { type Keymap } from "@/lib/editor/keymap"
import type { Scene } from "@/services/project"

/** Comic script element types — keep in sync with the union in
 *  ComicScriptEditor.tsx. */
export type ComicElementType =
  | "panel"
  | "character"
  | "balloon"
  | "caption"
  | "sfx"
  | "transition"

/** Smart "what comes next" cycle when the user presses Enter. Mirrors
 *  Marvel/DC scripting conventions: panel description → character cue
 *  → balloon, then balloon ↔ character ping-pongs through dialogue.
 *  Captions stay in caption mode for narration runs; sfx jumps back
 *  to character; transition resets to a fresh panel. */
const NEXT_ELEMENT_AFTER_ENTER: Record<ComicElementType, ComicElementType> = {
  panel: "character",
  character: "balloon",
  balloon: "character",
  caption: "caption",
  sfx: "character",
  transition: "panel",
}

/** Tab cycles to the next element type the same way Enter does. Comic
 *  scriptwriters carrying habits over from screenwriting expect Tab
 *  to be a "next element" gesture; mapping it through the same table
 *  matches that muscle memory. The two keys diverge once we add
 *  format-specific overrides. */
const NEXT_ELEMENT_ON_TAB: Record<ComicElementType, ComicElementType> = NEXT_ELEMENT_AFTER_ENTER

/** mod+digit shortcuts to insert a specific element type after the
 *  current one. Cover all six types so writers don't have to mouse to
 *  the toolbar. */
const NUMBER_KEY_TO_ELEMENT: Record<string, ComicElementType> = {
  "1": "panel",
  "2": "character",
  "3": "balloon",
  "4": "caption",
  "5": "sfx",
  "6": "transition",
}

export interface ComicKeyContext {
  pageId: string
  elementId: string
  elementType: ComicElementType
  elementIndex: number
}

interface CreateComicKeymapOptions {
  pages: Scene[]
  insertElementAfter: (pageId: string, type: ComicElementType, afterIdx: number) => void
  deleteEmptyElement: (pageId: string, elementId: string) => void
}

function flatNavigableIds(pages: Scene[]): string[] {
  const ids: string[] = []
  for (const page of pages) {
    for (const el of page.elements ?? []) {
      ids.push(el.id)
    }
  }
  return ids
}

function getElementNode(id: string): HTMLElement | null {
  if (typeof document === "undefined") return null
  return document.getElementById(`el-${id}`)
}

export function createComicKeymap(opts: CreateComicKeymapOptions): Keymap<ComicKeyContext> {
  const insertViaDigit = (type: ComicElementType) =>
    (e: React.KeyboardEvent<HTMLDivElement>, ctx: ComicKeyContext) => {
      e.preventDefault()
      opts.insertElementAfter(ctx.pageId, type, ctx.elementIndex)
    }

  const numberKeyEntries = Object.entries(NUMBER_KEY_TO_ELEMENT).map(
    ([digit, type]) => [`mod+${digit}`, insertViaDigit(type)] as const,
  )

  return {
    ...createElementNavigationKeymap<ComicKeyContext>({
      getNeighbour: (ctx, dir) => {
        const list = flatNavigableIds(opts.pages)
        const idx = list.indexOf(ctx.elementId)
        if (idx === -1) return null
        return dir === "up" ? (list[idx - 1] ?? null) : (list[idx + 1] ?? null)
      },
      focusElementAtStart: (id) => focusContentEditableAtStart(getElementNode(id)),
      focusElementAtEnd: (id) => focusContentEditableAtEnd(getElementNode(id)),
      deleteEmptyElement: (ctx) => opts.deleteEmptyElement(ctx.pageId, ctx.elementId),
    }),
    enter: (e, ctx) => {
      if (e.shiftKey) return
      e.preventDefault()
      const next = NEXT_ELEMENT_AFTER_ENTER[ctx.elementType] ?? "caption"
      opts.insertElementAfter(ctx.pageId, next, ctx.elementIndex)
    },
    tab: (e, ctx) => {
      e.preventDefault()
      const next = NEXT_ELEMENT_ON_TAB[ctx.elementType] ?? "caption"
      opts.insertElementAfter(ctx.pageId, next, ctx.elementIndex)
    },
    ...Object.fromEntries(numberKeyEntries),
  }
}
