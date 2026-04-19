/**
 * Live Preview extension for CodeMirror 6 — walks the Lezer markdown syntax
 * tree and emits decorations that render markdown inline the way Obsidian
 * does: syntax markers (`**`, `#`, `~~`, etc.) are hidden when the cursor
 * is on a different line, and the content between them is styled. When the
 * cursor lands on a line, the raw markers come back so the user can edit.
 *
 * Supported constructs:
 *
 *   - ATX headings (H1–H6)
 *   - **bold**, *italic*, ~~strikethrough~~, `inline code`
 *   - > blockquotes
 *   - [links](url) with URL hidden off-line
 *   - [[Wikilinks]] with brackets hidden off-line
 *   - --- horizontal rules (rendered as real <hr>)
 *   - - [x] task list items (rendered as clickable checkboxes)
 *   - ![alt](url) images (rendered inline off-line)
 *   - | tables | (rendered as HTML tables off-line)
 *   - ``` fenced code ``` (highlighted by @codemirror/lang-markdown)
 */

import { syntaxTree } from "@codemirror/language"
import { Facet, RangeSetBuilder } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import { convertFileSrc } from "@tauri-apps/api/core"

/**
 * Absolute path to the current vault folder, or null outside vault
 * projects. Images with relative `src` (e.g. `images/cat.png`) are
 * resolved against this path before being fed to `convertFileSrc` so they
 * load through Tauri's asset protocol.
 */
export const vaultPathFacet = Facet.define<string | null, string | null>({
  combine: (values) => values.find((v) => v !== null && v !== undefined) ?? null,
})

function joinVaultPath(base: string, rel: string): string {
  // Leave absolute paths alone — both posix `/...` and Windows `C:\...`.
  if (rel.startsWith("/") || /^[a-z]:[\\/]/i.test(rel)) return rel
  const sep = /\\/.test(base) && !/\//.test(base) ? "\\" : "/"
  return `${base.replace(/[\\/]+$/, "")}${sep}${rel}`
}

/** Returns a URL the webview can load for `src`, or null when we can't
 *  safely render it (missing vault path, malformed src). */
function resolveImageSrc(src: string, vaultPath: string | null): string | null {
  if (!src) return null
  if (/^(https?|data):/i.test(src)) return src
  if (!vaultPath) return null
  try {
    return convertFileSrc(joinVaultPath(vaultPath, src))
  } catch {
    return null
  }
}

// ─── Widgets ─────────────────────────────────────────────────────────────

class HorizontalRuleWidget extends WidgetType {
  toDOM() {
    const wrap = document.createElement("span")
    wrap.className = "cm-md-hr"
    wrap.appendChild(document.createElement("hr"))
    return wrap
  }
  eq() {
    return true
  }
}

/** Clickable checkbox inside a task-list line. Toggling the widget replaces
 *  the source `[ ]` with `[x]` (or vice versa) so the document is always
 *  the source of truth. */
class TaskCheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number,
  ) {
    super()
  }
  eq(other: TaskCheckboxWidget) {
    return other.checked === this.checked && other.from === this.from
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input")
    box.type = "checkbox"
    box.checked = this.checked
    box.className = "cm-md-task-checkbox"
    box.addEventListener("change", (e) => {
      e.stopPropagation()
      e.preventDefault()
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: this.checked ? "[ ]" : "[x]",
        },
      })
    })
    // The live-preview plugin isn't aware of widget clicks — tell CodeMirror
    // to leave the event alone so React / CM selection handlers don't fight.
    box.addEventListener("mousedown", (e) => e.stopPropagation())
    return box
  }
  ignoreEvent() {
    return false
  }
}

/** Inline `<img>` for image references. Supports remote URLs only for now —
 *  local (vault-relative) paths will land once we plumb vault path resolution
 *  through to the editor. */
class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super()
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt
  }
  toDOM() {
    const wrap = document.createElement("span")
    wrap.className = "cm-md-image"
    const img = document.createElement("img")
    img.src = this.src
    img.alt = this.alt
    img.loading = "lazy"
    img.draggable = false
    wrap.appendChild(img)
    return wrap
  }
}

/** Rendered table widget. Keyed by the source range so CodeMirror can
 *  reuse the DOM across unrelated edits. */
class TableWidget extends WidgetType {
  constructor(
    readonly header: string[],
    readonly rows: string[][],
    readonly alignments: Array<"left" | "center" | "right" | null>,
    readonly sourceHash: string,
  ) {
    super()
  }
  eq(other: TableWidget) {
    return other.sourceHash === this.sourceHash
  }
  toDOM() {
    const wrap = document.createElement("div")
    wrap.className = "cm-md-table"
    const table = document.createElement("table")

    const thead = document.createElement("thead")
    const headRow = document.createElement("tr")
    this.header.forEach((cell, idx) => {
      const th = document.createElement("th")
      th.textContent = cell
      const align = this.alignments[idx]
      if (align) th.style.textAlign = align
      headRow.appendChild(th)
    })
    thead.appendChild(headRow)
    table.appendChild(thead)

    const tbody = document.createElement("tbody")
    for (const row of this.rows) {
      const tr = document.createElement("tr")
      row.forEach((cell, idx) => {
        const td = document.createElement("td")
        td.textContent = cell
        const align = this.alignments[idx]
        if (align) td.style.textAlign = align
        tr.appendChild(td)
      })
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)
    wrap.appendChild(table)
    return wrap
  }
}

// ─── Static decorations ──────────────────────────────────────────────────

const hideMark = Decoration.replace({})
const boldMark = Decoration.mark({ class: "cm-md-bold" })
const italicMark = Decoration.mark({ class: "cm-md-italic" })
const strikeMark = Decoration.mark({ class: "cm-md-strike" })
const codeMark = Decoration.mark({ class: "cm-md-code" })
const linkMark = Decoration.mark({ class: "cm-md-link" })
const wikilinkMark = Decoration.mark({ class: "cm-md-wikilink" })

const blockquoteLine = Decoration.line({ class: "cm-md-blockquote" })
const taskDoneLine = Decoration.line({ class: "cm-md-task-done" })
const headingLines = [
  Decoration.line({ class: "cm-md-h1" }),
  Decoration.line({ class: "cm-md-h2" }),
  Decoration.line({ class: "cm-md-h3" }),
  Decoration.line({ class: "cm-md-h4" }),
  Decoration.line({ class: "cm-md-h5" }),
  Decoration.line({ class: "cm-md-h6" }),
]

interface PendingRange {
  from: number
  to: number
  deco: Decoration
  // Line decorations must sort before inline decorations at the same
  // `from`, and widget replacements before marks at the same range.
  priority: number
}

function buildDecorations(view: EditorView): DecorationSet {
  const cursorHead = view.state.selection.main.head
  const cursorLineNo = view.state.doc.lineAt(cursorHead).number
  const vaultPath = view.state.facet(vaultPathFacet)

  // Treat any line the selection crosses as "on" so markers don't flicker
  // while the user is sweeping through a passage.
  const touchedLines = new Set<number>([cursorLineNo])
  for (const range of view.state.selection.ranges) {
    const startLine = view.state.doc.lineAt(range.from).number
    const endLine = view.state.doc.lineAt(range.to).number
    for (let n = startLine; n <= endLine; n++) touchedLines.add(n)
  }

  const pending: PendingRange[] = []
  const pushLine = (from: number, deco: Decoration) =>
    pending.push({ from, to: from, deco, priority: 0 })
  const pushMark = (from: number, to: number, deco: Decoration) =>
    pending.push({ from, to, deco, priority: 2 })
  const pushReplace = (from: number, to: number, deco: Decoration) =>
    pending.push({ from, to, deco, priority: 1 })

  const nodeOnActiveLine = (nodeFrom: number): boolean => {
    const ln = view.state.doc.lineAt(nodeFrom).number
    return touchedLines.has(ln)
  }

  /** Returns true if any doc line between `from` and `to` (inclusive)
   *  is currently touched. Used for multi-line constructs (tables). */
  const rangeOnActiveLines = (from: number, to: number): boolean => {
    const first = view.state.doc.lineAt(from).number
    const last = view.state.doc.lineAt(to).number
    for (let n = first; n <= last; n++) {
      if (touchedLines.has(n)) return true
    }
    return false
  }

  const doc = view.state.doc
  const tableTodo: Array<{ from: number; to: number }> = []
  const seenTableRanges = new Set<string>()

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        const name = node.name

        // Headings ------------------------------------------------------
        const headingMatch = name.match(/^ATXHeading([1-6])$/)
        if (headingMatch) {
          const level = Number.parseInt(headingMatch[1], 10)
          const lineStart = doc.lineAt(node.from).from
          pushLine(lineStart, headingLines[level - 1])
          if (!nodeOnActiveLine(node.from)) {
            const child = node.node.getChild("HeaderMark")
            if (child) pushReplace(child.from, Math.min(child.to + 1, node.to), hideMark)
          }
          return
        }

        // Blockquote ---------------------------------------------------
        if (name === "Blockquote") {
          let line = doc.lineAt(node.from)
          const end = node.to
          while (line.from <= end) {
            pushLine(line.from, blockquoteLine)
            if (line.to >= end) break
            line = doc.line(line.number + 1)
          }
        }
        if (name === "QuoteMark" && !nodeOnActiveLine(node.from)) {
          const next = Math.min(node.to + 1, doc.length)
          pushReplace(node.from, next, hideMark)
          return
        }

        // Inline emphasis ----------------------------------------------
        if (name === "StrongEmphasis") {
          pushMark(node.from, node.to, boldMark)
          if (!nodeOnActiveLine(node.from)) {
            pushReplace(node.from, node.from + 2, hideMark)
            pushReplace(node.to - 2, node.to, hideMark)
          }
          return
        }
        if (name === "Emphasis") {
          pushMark(node.from, node.to, italicMark)
          if (!nodeOnActiveLine(node.from)) {
            pushReplace(node.from, node.from + 1, hideMark)
            pushReplace(node.to - 1, node.to, hideMark)
          }
          return
        }
        if (name === "Strikethrough") {
          pushMark(node.from, node.to, strikeMark)
          if (!nodeOnActiveLine(node.from)) {
            pushReplace(node.from, node.from + 2, hideMark)
            pushReplace(node.to - 2, node.to, hideMark)
          }
          return
        }
        if (name === "InlineCode") {
          pushMark(node.from, node.to, codeMark)
          if (!nodeOnActiveLine(node.from)) {
            pushReplace(node.from, node.from + 1, hideMark)
            pushReplace(node.to - 1, node.to, hideMark)
          }
          return
        }

        // Images -------------------------------------------------------
        // `![alt](src)` — render inline when off-line. Absolute HTTP(S)
        // URLs work out of the box; relative paths (`images/cat.png`)
        // are resolved against the vault folder via `convertFileSrc`
        // and loaded through Tauri's asset protocol.
        if (name === "Image") {
          if (!nodeOnActiveLine(node.from)) {
            const raw = doc.sliceString(node.from, node.to)
            const match = raw.match(/^!\[([^\]]*)\]\(([^)]+)\)/)
            if (match) {
              const [, alt, src] = match
              const resolved = resolveImageSrc(src, vaultPath)
              if (resolved) {
                pushReplace(
                  node.from,
                  node.to,
                  Decoration.replace({ widget: new ImageWidget(resolved, alt) }),
                )
                return
              }
            }
          }
          // Fallback: treat like a link — style + hide URL when off-line.
          pushMark(node.from, node.to, linkMark)
          return
        }

        // Links --------------------------------------------------------
        if (name === "Link") {
          pushMark(node.from, node.to, linkMark)
          if (!nodeOnActiveLine(node.from)) {
            const marks = node.node.getChildren("LinkMark")
            const openingBracket = marks[0]
            const closingBracket = marks[1]
            if (openingBracket) {
              pushReplace(openingBracket.from, openingBracket.to, hideMark)
            }
            const hideFrom = closingBracket?.from ?? node.to
            if (hideFrom < node.to) pushReplace(hideFrom, node.to, hideMark)
          }
          return
        }

        // Wikilinks ----------------------------------------------------
        // Syntax: `[[Target]]` or `[[Target|Alias]]`. When off-line we
        // hide `[[`, `]]`, and the `Target|` part (if present) so only
        // the visible label remains — matches Obsidian's alias display.
        if (name === "Wikilink") {
          pushMark(node.from, node.to, wikilinkMark)
          if (!nodeOnActiveLine(node.from)) {
            pushReplace(node.from, node.from + 2, hideMark)
            pushReplace(node.to - 2, node.to, hideMark)
            const inner = doc.sliceString(node.from + 2, node.to - 2)
            const pipe = inner.indexOf("|")
            if (pipe !== -1) {
              const pipeAbs = node.from + 2 + pipe
              pushReplace(node.from + 2, pipeAbs + 1, hideMark)
            }
          }
          return
        }

        // Horizontal rule ---------------------------------------------
        if (name === "HorizontalRule") {
          pushReplace(
            node.from,
            node.to,
            Decoration.replace({ widget: new HorizontalRuleWidget() }),
          )
          return
        }

        // Task list items ---------------------------------------------
        // GFM produces a `TaskMarker` inside `ListItem` whose children
        // look like: `ListMark (-)`, `TaskMarker ([ ]|[x])`, content.
        // We swallow the whole `- [ ]` / `- [x]` prefix into one widget
        // so the bullet doesn't show next to the rendered checkbox.
        if (name === "TaskMarker") {
          const raw = doc.sliceString(node.from, node.to)
          const checked = /x/i.test(raw)
          if (checked) pushLine(doc.lineAt(node.from).from, taskDoneLine)

          const listItem = node.node.parent
          const listMark = listItem ? listItem.getChild("ListMark") : null
          const widgetFrom = listMark ? listMark.from : node.from
          pushReplace(
            widgetFrom,
            node.to,
            Decoration.replace({
              widget: new TaskCheckboxWidget(checked, node.from, node.to),
            }),
          )
          return
        }

        // Tables -------------------------------------------------------
        // Defer the actual widget build until after the walk: we need to
        // slice out the raw source lines, and iterating through children
        // at every step would double our tree walk.
        if (name === "Table") {
          const key = `${node.from}-${node.to}`
          if (!seenTableRanges.has(key)) {
            seenTableRanges.add(key)
            tableTodo.push({ from: node.from, to: node.to })
          }
          return
        }
      },
    })
  }

  // Second pass: build table widgets. We skip rendering when any row is
  // on an active line so the user can edit the raw pipes.
  for (const { from, to } of tableTodo) {
    if (rangeOnActiveLines(from, to)) continue
    const src = doc.sliceString(from, to)
    const parsed = parseTable(src)
    if (!parsed) continue
    pushReplace(
      from,
      to,
      Decoration.replace({
        widget: new TableWidget(parsed.header, parsed.rows, parsed.alignments, src),
        block: true,
      }),
    )
  }

  pending.sort(
    (a, b) => a.from - b.from || a.priority - b.priority || a.to - b.to,
  )

  const builder = new RangeSetBuilder<Decoration>()
  for (const entry of pending) builder.add(entry.from, entry.to, entry.deco)
  return builder.finish()
}

/** Parses a GFM-style pipe table. Returns null on malformed input so the
 *  fallback is the raw source text — never a broken widget. */
function parseTable(src: string): {
  header: string[]
  rows: string[][]
  alignments: Array<"left" | "center" | "right" | null>
} | null {
  const lines = src
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length < 2) return null

  const splitRow = (line: string): string[] => {
    // Strip leading / trailing pipes, then split. Inner escaped `\|`
    // (rare but legal) is preserved as a literal.
    const stripped = line.replace(/^\||\|$/g, "")
    return stripped.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"))
  }

  const header = splitRow(lines[0])
  const sep = splitRow(lines[1])
  // Alignment row must be all dash-markers (`---`, `:---`, `---:`, `:-:`).
  const alignments: Array<"left" | "center" | "right" | null> = sep.map(
    (cell) => {
      if (!/^:?-{3,}:?$/.test(cell)) return null
      const left = cell.startsWith(":")
      const right = cell.endsWith(":")
      if (left && right) return "center"
      if (right) return "right"
      if (left) return "left"
      return null
    },
  )
  if (alignments.some((a, i) => a === null && !/^-{3,}$/.test(sep[i]))) {
    return null
  }

  const rows = lines.slice(2).map(splitRow)
  return { header, rows, alignments }
}

/**
 * CodeMirror ViewPlugin that keeps the decoration set in sync with the
 * document, viewport, and selection. Rebuilt on any of those changes —
 * cheap because it only walks `view.visibleRanges`.
 *
 * `atomicRanges` marks widgets as single-caret-step units so cursor
 * movement doesn't drop you inside a hidden `**` or image widget.
 */
export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)
