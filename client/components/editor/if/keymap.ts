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
  }
}
