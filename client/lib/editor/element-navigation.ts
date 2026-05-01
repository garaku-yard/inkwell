import {
  isCaretAtElementEnd,
  isCaretAtElementStart,
  isElementEmpty,
  type Keymap,
} from "./keymap"

/**
 * Generic per-element navigation handlers (arrow-up at start jumps to
 * the previous element's end, arrow-down at end jumps to the next
 * element's start, backspace on an empty element deletes it). Every
 * format editor wants the same UX, but they disagree on what counts as
 * "the next element" — Interactive Fiction stays within a single
 * passage; Prose crosses chapter boundaries; Comic crosses panel
 * boundaries within a page. So the factory takes a `getNeighbour`
 * callback rather than a flattened-list array, and lets each consumer
 * decide.
 *
 * Usage: a per-format keymap config (e.g.
 * `components/editor/prose/keymap.ts`) calls this factory and spreads
 * the returned handlers into the keymap object it hands to
 * `dispatchKey`. See `components/editor/screenplay/keymap.ts` for the
 * pattern.
 */

export interface ElementNavigationConfig<TCtx> {
  /** Returns the id of the element above (dir="up") or below
   *  (dir="down") the current one, or null if there's no neighbour in
   *  that direction. The implementation decides how far to jump —
   *  staying within a passage, crossing chapter boundaries, etc. */
  getNeighbour: (ctx: TCtx, dir: "up" | "down") => string | null
  /** Focus the start of the element with the given id. Called on
   *  arrow-down so the caret lands at the start of the next
   *  element. */
  focusElementAtStart: (id: string) => void
  /** Focus the end of the element with the given id. Called on
   *  arrow-up so the caret lands at the end of the previous element. */
  focusElementAtEnd: (id: string) => void
  /** Called when the user presses backspace on an empty element. The
   *  caller decides whether to delete, merge with the previous, or do
   *  nothing — the factory only confirms emptiness and forwards the
   *  gesture. */
  deleteEmptyElement: (ctx: TCtx) => void
}

/** Returns the three handlers (arrowup / arrowdown / backspace) a
 *  consumer spreads into its own per-format keymap. */
export function createElementNavigationKeymap<TCtx>(
  config: ElementNavigationConfig<TCtx>,
): Pick<Keymap<TCtx>, "arrowup" | "arrowdown" | "backspace"> {
  return {
    arrowup: (e, ctx) => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return
      if (!isCaretAtElementStart(selection.getRangeAt(0), e.currentTarget)) return
      const target = config.getNeighbour(ctx, "up")
      if (target === null) return
      e.preventDefault()
      config.focusElementAtEnd(target)
    },
    arrowdown: (e, ctx) => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return
      if (!isCaretAtElementEnd(selection.getRangeAt(0), e.currentTarget)) return
      const target = config.getNeighbour(ctx, "down")
      if (target === null) return
      e.preventDefault()
      config.focusElementAtStart(target)
    },
    backspace: (e, ctx) => {
      if (!isElementEmpty(e.currentTarget)) return
      e.preventDefault()
      config.deleteEmptyElement(ctx)
    },
  }
}

/** Small helper to focus a contentEditable at its end. Most consumers
 *  end up writing this twice — once for arrow-up navigation, once for
 *  the after-insert focus. Available here so they don't have to. */
export function focusContentEditableAtEnd(el: HTMLElement | null): void {
  if (!el) return
  el.focus()
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

/** Mirror of focusContentEditableAtEnd for the start edge. */
export function focusContentEditableAtStart(el: HTMLElement | null): void {
  if (!el) return
  el.focus()
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}
