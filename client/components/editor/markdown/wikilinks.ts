/**
 * Registers `[[Wikilink]]` as an inline syntax node in the markdown parser.
 *
 * Plain markdown has no concept of wikilinks, but Obsidian popularised the
 * `[[Page Title]]` (optionally `[[Page|Alias]]`) shorthand. We teach the
 * Lezer parser about it by adding two delimiters and one inline "InlineContext"
 * parser that scans for the opening `[[`, finds the matching `]]`, and emits a
 * `Wikilink` node with two `WikilinkMark` children. Once the tree carries these
 * nodes, the live-preview plugin can hide the markers off-line and decorate
 * the body exactly like any built-in construct.
 */

import { syntaxTree } from "@codemirror/language"
import type { Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import type { MarkdownConfig } from "@lezer/markdown"
import type { SyntaxNode } from "@lezer/common"

/** Node + mark names the live-preview plugin looks for. */
const WIKILINK = "Wikilink"
const WIKILINK_MARK = "WikilinkMark"

export const wikilinkParser: MarkdownConfig = {
  defineNodes: [
    // No highlight style — the live-preview plugin owns the rendering via
    // Decoration classes, so there's nothing for Lezer's highlighter to do.
    { name: WIKILINK },
    { name: WIKILINK_MARK },
  ],
  parseInline: [
    {
      name: WIKILINK,
      parse(cx, next, pos) {
        // `next` is the code point at `pos`. A wikilink starts with `[[`.
        if (next !== 91 /* '[' */) return -1
        if (cx.char(pos + 1) !== 91) return -1

        // Scan ahead for the matching `]]`, staying within the current
        // inline context (no newlines, bounded by the inline parser's
        // end offset). Bail out early on anything too long so a lone
        // `[[` doesn't gobble the rest of the document.
        const MAX_LEN = 200
        const end = Math.min(cx.end, pos + 2 + MAX_LEN)
        let close = -1
        for (let i = pos + 2; i < end; i++) {
          const ch = cx.char(i)
          if (ch === 10 /* '\n' */) return -1
          if (ch === 93 /* ']' */ && cx.char(i + 1) === 93) {
            close = i
            break
          }
        }
        if (close === -1) return -1

        const opening = cx.elt(WIKILINK_MARK, pos, pos + 2)
        const closing = cx.elt(WIKILINK_MARK, close, close + 2)
        return cx.addElement(cx.elt(WIKILINK, pos, close + 2, [opening, closing]))
      },
    },
  ],
}

/**
 * CodeMirror extension that routes clicks on rendered `[[Wikilink]]` spans
 * back into React. We take a getter (not a direct handler) so callers can
 * hand us a stable ref-backed closure and change the handler without
 * rebuilding the editor state.
 *
 * Behaviour:
 *  - Finds the nearest `.cm-md-wikilink` element under the click.
 *  - Resolves the document position to a Wikilink syntax node.
 *  - Strips `[[` / `]]` and any optional `|alias` suffix.
 *  - Invokes the handler with the bare target title.
 *
 * Returning true from the handler swallows the mousedown so CodeMirror
 * doesn't move the caret into the widget.
 */
export function wikilinkClickExtension(
  getHandler: () => ((target: string) => void) | undefined,
): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      const handler = getHandler()
      if (!handler) return false
      const el = event.target as HTMLElement | null
      if (!el || !el.closest(".cm-md-wikilink")) return false

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos == null) return false

      let node: SyntaxNode | null = syntaxTree(view.state).resolve(pos, 1)
      while (node && node.name !== WIKILINK) node = node.parent
      if (!node) return false

      const raw = view.state.doc.sliceString(node.from, node.to)
      const match = raw.match(/^\[\[([\s\S]+?)\]\]$/)
      if (!match) return false

      event.preventDefault()
      event.stopPropagation()
      const target = match[1].split("|")[0].trim()
      if (target) handler(target)
      return true
    },
  })
}
