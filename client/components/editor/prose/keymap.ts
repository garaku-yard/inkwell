import type React from "react"

import {
  createElementNavigationKeymap,
  focusContentEditableAtEnd,
  focusContentEditableAtStart,
} from "@/lib/editor/element-navigation"
import { createDoubleTapDetector, type Keymap } from "@/lib/editor/keymap"
import type { Scene } from "@/services/project"

/** Prose element types — keep in sync with the union in
 *  ProseEditor.tsx. */
export type ProseElementType =
  | "chapter_heading"
  | "heading_2"
  | "heading_3"
  | "paragraph"
  | "dialogue"
  | "scene_break"
  | "scene_heading_stinger"

/** mod+digit insert shortcuts. Paragraph on 1 because that's the
 *  workhorse; chapter_heading on 2 for the obvious section break;
 *  scene_break on 3 for the rare "* * *" separator; dialogue on 4
 *  for run-on dialogue blocks; stinger on 5 for the "Three weeks
 *  later." opening line that needs more punch than a heading. */
const NUMBER_KEY_TO_ELEMENT: Record<string, ProseElementType> = {
  "1": "paragraph",
  "2": "chapter_heading",
  "3": "scene_break",
  "4": "dialogue",
  "5": "scene_heading_stinger",
}

/** Window for double-Enter detection. Two Enters within this many ms
 *  start a fresh chapter; a single Enter falls through to the paragraph
 *  insert flow after the same delay. The 300ms delay does mean a
 *  single-Enter has a slight perceived lag — same trade-off the
 *  screenplay editor's double-Enter-creates-scene gesture makes. */
const DOUBLE_ENTER_THRESHOLD = 300

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
  /** Insert any element type after the given index. Used by the
   *  mod+digit shortcuts. */
  insertElementAfter: (sceneId: string, type: ProseElementType, afterIdx: number) => void
  /** Create a fresh chapter at the end. Triggered by double-Enter. */
  insertNewChapter: () => void
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
  const enterDetector = createDoubleTapDetector(DOUBLE_ENTER_THRESHOLD)

  const insertViaDigit = (type: ProseElementType) =>
    (e: React.KeyboardEvent<HTMLDivElement>, ctx: ProseKeyContext) => {
      e.preventDefault()
      opts.insertElementAfter(ctx.sceneId, type, ctx.elementIndex)
    }

  const numberKeyEntries = Object.entries(NUMBER_KEY_TO_ELEMENT).map(
    ([digit, type]) => [`mod+${digit}`, insertViaDigit(type)] as const,
  )

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
      // Double-Enter starts a fresh chapter; single-Enter inserts a
      // paragraph after a 300ms delay so we can tell the two apart.
      const wasDouble = enterDetector.scheduleOrDoubleTap(() => {
        opts.insertParagraphAfter(ctx.sceneId, ctx.elementIndex)
      })
      if (wasDouble) {
        opts.insertNewChapter()
      }
    },
    ...Object.fromEntries(numberKeyEntries),
  }
}
