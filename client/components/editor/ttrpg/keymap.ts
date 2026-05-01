import type React from "react"

import {
  createElementNavigationKeymap,
  focusContentEditableAtEnd,
  focusContentEditableAtStart,
} from "@/lib/editor/element-navigation"
import { type Keymap } from "@/lib/editor/keymap"
import type { Scene } from "@/services/project"

/** TabletopRPG element types — keep in sync with the union in
 *  TabletopRPGEditor.tsx. */
export type RPGElementType =
  | "h2"
  | "body"
  | "stat_block"
  | "table"
  | "dice_table"
  | "callout"
  | "rule_box"

/** What Enter inserts after each element type. The multi-line types
 *  (stat_block / table / dice_table) never reach this keymap because
 *  they only mount their own multi-line key handling — Enter inside
 *  those elements should add a newline within the cell, not insert a
 *  fresh body below. The keymap only applies to single-line elements. */
const NEXT_ELEMENT_AFTER_ENTER: Partial<Record<RPGElementType, RPGElementType>> = {
  h2: "body",
  body: "body",
  callout: "body",
  rule_box: "body",
}

/** mod+digit inserts a specific element type. Covers the seven types
 *  the format ships — multi-line types (stat_block, table, dice_table)
 *  are present too because the shortcut is the only ergonomic way to
 *  drop one of those without mousing to the toolbar. The default
 *  content for those types is seeded by the editor's handleAddElement,
 *  not the keymap. */
const NUMBER_KEY_TO_ELEMENT: Record<string, RPGElementType> = {
  "1": "body",
  "2": "h2",
  "3": "stat_block",
  "4": "table",
  "5": "dice_table",
  "6": "callout",
  "7": "rule_box",
}

export interface RPGKeyContext {
  sectionId: string
  elementId: string
  elementType: RPGElementType
  elementIndex: number
}

interface CreateRPGKeymapOptions {
  sections: Scene[]
  insertElementAfter: (sectionId: string, type: RPGElementType, afterIdx: number) => void
  deleteEmptyElement: (sectionId: string, elementId: string) => void
}

function flatNavigableIds(sections: Scene[]): string[] {
  const ids: string[] = []
  for (const section of sections) {
    for (const el of section.elements ?? []) {
      ids.push(el.id)
    }
  }
  return ids
}

function getElementNode(id: string): HTMLElement | null {
  if (typeof document === "undefined") return null
  return document.getElementById(`el-${id}`)
}

export function createRPGKeymap(opts: CreateRPGKeymapOptions): Keymap<RPGKeyContext> {
  const insertViaDigit = (type: RPGElementType) =>
    (e: React.KeyboardEvent<HTMLDivElement>, ctx: RPGKeyContext) => {
      e.preventDefault()
      opts.insertElementAfter(ctx.sectionId, type, ctx.elementIndex)
    }

  const numberKeyEntries = Object.entries(NUMBER_KEY_TO_ELEMENT).map(
    ([digit, type]) => [`mod+${digit}`, insertViaDigit(type)] as const,
  )

  return {
    ...createElementNavigationKeymap<RPGKeyContext>({
      getNeighbour: (ctx, dir) => {
        const list = flatNavigableIds(opts.sections)
        const idx = list.indexOf(ctx.elementId)
        if (idx === -1) return null
        return dir === "up" ? (list[idx - 1] ?? null) : (list[idx + 1] ?? null)
      },
      focusElementAtStart: (id) => focusContentEditableAtStart(getElementNode(id)),
      focusElementAtEnd: (id) => focusContentEditableAtEnd(getElementNode(id)),
      deleteEmptyElement: (ctx) => opts.deleteEmptyElement(ctx.sectionId, ctx.elementId),
    }),
    enter: (e, ctx) => {
      if (e.shiftKey) return
      const next = NEXT_ELEMENT_AFTER_ENTER[ctx.elementType]
      if (!next) return // multi-line types fall through to native newline
      e.preventDefault()
      opts.insertElementAfter(ctx.sectionId, next, ctx.elementIndex)
    },
    ...Object.fromEntries(numberKeyEntries),
  }
}
