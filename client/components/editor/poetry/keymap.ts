import {
  createElementNavigationKeymap,
  focusContentEditableAtEnd,
  focusContentEditableAtStart,
} from "@/lib/editor/element-navigation"
import { type Keymap } from "@/lib/editor/keymap"
import type { Scene } from "@/services/project"

/** Per-event context the poetry keymap consumes. */
export interface PoetryKeyContext {
  sceneId: string
  elementId: string
  elementType: string
  elementIndex: number
}

interface CreatePoetryKeymapOptions {
  scenes: Scene[]
  insertLineAfter: (sceneId: string, afterIdx: number) => void
  insertStanzaBreakAfter: (sceneId: string, afterIdx: number) => void
  deleteEmptyElement: (sceneId: string, elementId: string) => void
}

/** Walks the scenes top-to-bottom and returns the editable element
 *  ids in render order. Skips stanza_break since it's a non-editable
 *  blank separator — arrow-down at the line above one lands on the
 *  line below it, never on the break. */
function flatNavigableIds(scenes: Scene[]): string[] {
  const ids: string[] = []
  for (const scene of scenes) {
    for (const el of scene.elements ?? []) {
      if (el.element_type === "stanza_break") continue
      ids.push(el.id)
    }
  }
  return ids
}

function getElementNode(id: string): HTMLElement | null {
  if (typeof document === "undefined") return null
  return document.getElementById(`el-${id}`)
}

export function createPoetryKeymap(opts: CreatePoetryKeymapOptions): Keymap<PoetryKeyContext> {
  return {
    ...createElementNavigationKeymap<PoetryKeyContext>({
      getNeighbour: (ctx, dir) => {
        const list = flatNavigableIds(opts.scenes)
        const idx = list.indexOf(ctx.elementId)
        if (idx === -1) return null
        return dir === "up" ? (list[idx - 1] ?? null) : (list[idx + 1] ?? null)
      },
      focusElementAtStart: (id) => focusContentEditableAtStart(getElementNode(id)),
      focusElementAtEnd: (id) => focusContentEditableAtEnd(getElementNode(id)),
      deleteEmptyElement: (ctx) => opts.deleteEmptyElement(ctx.sceneId, ctx.elementId),
    }),
    enter: (e, ctx) => {
      e.preventDefault()
      opts.insertLineAfter(ctx.sceneId, ctx.elementIndex)
    },
    "shift+enter": (e, ctx) => {
      // Only `line` had the original Shift+Enter → stanza_break gesture.
      // Section labels and chord rows ignore Shift+Enter so the browser's
      // default in-paragraph break works (rare on one-line elements but
      // doesn't hurt).
      if (ctx.elementType !== "line") return
      e.preventDefault()
      opts.insertStanzaBreakAfter(ctx.sceneId, ctx.elementIndex)
    },
  }
}
