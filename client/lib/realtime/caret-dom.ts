/**
 * DOM helpers for remote carets — the two pure mappings between a character
 * offset inside a contentEditable and a screen position. Editor-agnostic: they
 * key off the standard `contenteditable` attribute and the element's DOM `id`,
 * so any editor whose editables carry a stable id gets carets for free.
 *
 * Both sides use the element's *rendered* text (`Range.toString()` length and a
 * text-node walk), so they agree as long as both peers see the same content for
 * that element — which element-level last-write-wins keeps true.
 */

const EDITABLE_SELECTOR = "[contenteditable]"

/** The contentEditable host that contains `node`, if any. */
function hostFrom(node: Node | null): HTMLElement | null {
  if (!node) return null
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)
  return (el?.closest?.(EDITABLE_SELECTOR) as HTMLElement | null) ?? null
}

/**
 * The editable element (with its DOM id) that currently holds the selection,
 * or null when the caret isn't inside a tracked editable. The id is what gets
 * broadcast as the caret's `elementId`, so an editable with no id is skipped.
 */
export function editableHostFromSelection(): HTMLElement | null {
  const sel = typeof window !== "undefined" ? window.getSelection() : null
  if (!sel || sel.rangeCount === 0) return null
  const host = hostFrom(sel.anchorNode)
  return host && host.id ? host : null
}

/**
 * Character offset of the collapsed caret within `host`, or null when the
 * selection isn't inside it. Counts rendered text from the element start to the
 * selection anchor.
 */
export function caretOffsetInElement(host: HTMLElement): number | null {
  const sel = typeof window !== "undefined" ? window.getSelection() : null
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!host.contains(range.startContainer)) return null
  const pre = range.cloneRange()
  pre.selectNodeContents(host)
  pre.setEnd(range.startContainer, range.startOffset)
  return pre.toString().length
}

/**
 * Viewport-space rectangle for the caret at `offset` characters into `host`.
 * Returns a (typically zero-width) rect at the caret position; for an empty
 * element or an offset past the end it falls back to the host's left edge so a
 * caret still renders. Returns null only when `host` has no geometry.
 */
export function rectForOffset(host: HTMLElement, offset: number): DOMRect | null {
  const range = document.createRange()
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
  let remaining = Math.max(0, offset)
  let placed = false
  let node = walker.nextNode() as Text | null
  while (node) {
    const len = node.data.length
    if (remaining <= len) {
      range.setStart(node, remaining)
      range.collapse(true)
      placed = true
      break
    }
    remaining -= len
    node = walker.nextNode() as Text | null
  }
  if (!placed) {
    // Empty element or offset past the end — collapse to the end of the host.
    range.selectNodeContents(host)
    range.collapse(false)
  }
  const rects = range.getClientRects()
  if (rects.length > 0) {
    // The last rect handles a caret sitting at a soft line wrap's end.
    return rects[rects.length - 1] as DOMRect
  }
  // A collapsed range in an empty element yields no client rects; approximate
  // with the host box so the caret shows at the element's start.
  const hr = host.getBoundingClientRect()
  if (hr.width === 0 && hr.height === 0) return null
  return new DOMRect(hr.left, hr.top, 0, hr.height)
}
