import type React from "react"

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

/** Lyrics `Shift+mod+digit` shortcuts. The `Shift+mod` prefix instead
 *  of plain `mod+digit` is intentional: poets and lyricists
 *  occasionally hold mod alone for editor commands and we don't want
 *  the digit row to clash with line-number-driven gestures the format
 *  may pick up later. The symbol fallbacks (`!`, `@`, `#`) cover the
 *  US-layout case where Shift remaps the digit row. Non-US layouts
 *  may need additional fallbacks if users report misses. */
const LYRICS_SHIFT_MOD_KEYS: Record<string, "line" | "section_label" | "chord_row"> = {
  "1": "line",
  "!": "line",
  "2": "section_label",
  "@": "section_label",
  "3": "chord_row",
  "#": "chord_row",
}

/** Poetry has no chord_row / section_label, so the same prefix only
 *  binds two slots: line on 1, stanza_break on 2. */
const POETRY_SHIFT_MOD_KEYS: Record<string, "line" | "stanza_break"> = {
  "1": "line",
  "!": "line",
  "2": "stanza_break",
  "@": "stanza_break",
}

interface CreatePoetryKeymapOptions {
  scenes: Scene[]
  isLyrics: boolean
  insertLineAfter: (sceneId: string, afterIdx: number) => void
  insertStanzaBreakAfter: (sceneId: string, afterIdx: number) => void
  insertSectionLabelAfter: (sceneId: string, afterIdx: number) => void
  insertChordRowAfter: (sceneId: string, afterIdx: number) => void
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
  const insertHandlerFor = (
    type: "line" | "stanza_break" | "section_label" | "chord_row",
  ) =>
    (e: React.KeyboardEvent<HTMLDivElement>, ctx: PoetryKeyContext) => {
      e.preventDefault()
      switch (type) {
        case "line":
          opts.insertLineAfter(ctx.sceneId, ctx.elementIndex)
          break
        case "stanza_break":
          opts.insertStanzaBreakAfter(ctx.sceneId, ctx.elementIndex)
          break
        case "section_label":
          opts.insertSectionLabelAfter(ctx.sceneId, ctx.elementIndex)
          break
        case "chord_row":
          opts.insertChordRowAfter(ctx.sceneId, ctx.elementIndex)
          break
      }
    }

  const shiftModEntries = Object.entries(
    opts.isLyrics ? LYRICS_SHIFT_MOD_KEYS : POETRY_SHIFT_MOD_KEYS,
  ).map(([key, type]) => [`shift+mod+${key}`, insertHandlerFor(type)] as const)

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
    ...Object.fromEntries(shiftModEntries),
  }
}
