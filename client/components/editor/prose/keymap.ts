import {
  createElementNavigationKeymap,
  focusContentEditableAtEnd,
  focusContentEditableAtStart,
} from "@/lib/editor/element-navigation"
import { type Keymap } from "@/lib/editor/keymap"
import type { Scene } from "@/services/project"

/** Per-event context the prose keymap consumes. The editor passes
 *  these through from the contentEditable's onKeyDown. */
export interface ProseKeyContext {
  sceneId: string
  elementId: string
  elementIndex: number
}

interface CreateProseKeymapOptions {
  /** Latest scenes — re-pass on every render so the navigation lookup
   *  walks the current document. The keymap factory is cheap to
   *  recreate. */
  scenes: Scene[]
  /** Insert a fresh paragraph after the given index in the scene.
   *  Called on Enter. */
  insertParagraphAfter: (sceneId: string, afterIdx: number) => void
  /** Delete an empty element (Enter never lands here — backspace on
   *  an empty contentEditable does). The implementation also focuses
   *  the previous element. */
  deleteEmptyElement: (sceneId: string, elementId: string) => void
}

/** Walks the scenes top-to-bottom and returns the editable element
 *  ids in render order. Skips scene_break since it's a non-editable
 *  separator — arrow-down at the paragraph above it lands on the
 *  paragraph below it, never on the break itself. */
function flatNavigableIds(scenes: Scene[]): string[] {
  const ids: string[] = []
  for (const scene of scenes) {
    for (const el of scene.elements ?? []) {
      if (el.element_type === "scene_break") continue
      ids.push(el.id)
    }
  }
  return ids
}

/** Looks up the contentEditable rendered for `id`. ProseEditor sets
 *  `id="el-<elementId>"` on every editable element; we don't need a
 *  refs Map. */
function getElementNode(id: string): HTMLElement | null {
  if (typeof document === "undefined") return null
  return document.getElementById(`el-${id}`)
}

export function createProseKeymap(opts: CreateProseKeymapOptions): Keymap<ProseKeyContext> {
  return {
    ...createElementNavigationKeymap<ProseKeyContext>({
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
      if (e.shiftKey) return
      e.preventDefault()
      opts.insertParagraphAfter(ctx.sceneId, ctx.elementIndex)
    },
  }
}
