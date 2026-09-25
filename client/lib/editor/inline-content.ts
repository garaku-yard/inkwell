/** Versioned inline runs stored in the existing element content field. This
 * field already round-trips through SQLite, hosted sync, and .iw files. */
export const INLINE_KIND = "inkwell.editor.inline"

export interface InlineRun {
  text: string
  strong?: boolean
  emphasis?: boolean
  underline?: boolean
  smallCaps?: boolean
  href?: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function safeInlineHref(href: string): string | undefined {
  try {
    const url = new URL(href)
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? href : undefined
  } catch {
    return undefined
  }
}

function sameMarks(a: InlineRun, b: InlineRun): boolean {
  return !!a.strong === !!b.strong && !!a.emphasis === !!b.emphasis &&
    !!a.underline === !!b.underline && !!a.smallCaps === !!b.smallCaps && a.href === b.href
}

export function compactInlineRuns(runs: InlineRun[]): InlineRun[] {
  const result: InlineRun[] = []
  for (const run of runs) {
    if (!run.text) continue
    const safe: InlineRun = { text: run.text }
    if (run.strong) safe.strong = true
    if (run.emphasis) safe.emphasis = true
    if (run.underline) safe.underline = true
    if (run.smallCaps) safe.smallCaps = true
    if (run.href && safeInlineHref(run.href)) safe.href = run.href
    const last = result.at(-1)
    if (last && sameMarks(last, safe)) last.text += safe.text
    else result.push(safe)
  }
  return result
}

export function readInlineRuns(content: string): InlineRun[] {
  try {
    const value: unknown = JSON.parse(content)
    if (!isObject(value) || value.kind !== INLINE_KIND || value.version !== 1 || !Array.isArray(value.runs)) {
      return content ? [{ text: content }] : []
    }
    const runs: InlineRun[] = []
    for (const item of value.runs) {
      if (!isObject(item) || typeof item.text !== "string") return [{ text: content }]
      runs.push({
        text: item.text,
        strong: item.strong === true,
        emphasis: item.emphasis === true,
        underline: item.underline === true,
        smallCaps: item.smallCaps === true,
        href: typeof item.href === "string" ? safeInlineHref(item.href) : undefined,
      })
    }
    return compactInlineRuns(runs)
  } catch {
    return content ? [{ text: content }] : []
  }
}

export function writeInlineRuns(runs: InlineRun[]): string {
  const compact = compactInlineRuns(runs)
  if (compact.every((run) => !run.strong && !run.emphasis && !run.underline && !run.smallCaps && !run.href)) {
    return compact.map((run) => run.text).join("")
  }
  return JSON.stringify({ kind: INLINE_KIND, version: 1, runs: compact })
}

export function plainInlineText(content: string): string {
  return readInlineRuns(content).map((run) => run.text).join("")
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Both the editor and EPUB use only this safe HTML subset. */
export function inlineToHtml(content: string): string {
  return readInlineRuns(content).map((run) => {
    let text = escapeHtml(run.text).replace(/\n/g, "<br />")
    if (run.smallCaps) text = `<span data-inkwell-small-caps="true" style="font-variant:small-caps">${text}</span>`
    if (run.underline) text = `<u>${text}</u>`
    if (run.emphasis) text = `<em>${text}</em>`
    if (run.strong) text = `<strong>${text}</strong>`
    if (run.href) text = `<a href="${escapeHtml(run.href)}">${text}</a>`
    return text
  }).join("")
}

/** The contentEditable may contain browser paste markup; only known marks survive. */
export function editorHtmlToInline(html: string): string {
  const root = document.createElement("div")
  root.innerHTML = html
  const runs: InlineRun[] = []
  const append = (text: string, marks: Omit<InlineRun, "text">) => {
    if (text) runs.push({ text, ...marks })
  }
  const walk = (node: Node, marks: Omit<InlineRun, "text">) => {
    if (node.nodeType === Node.TEXT_NODE) {
      append(node.textContent ?? "", marks)
      return
    }
    if (!(node instanceof HTMLElement)) return
    const tag = node.tagName.toLowerCase()
    if (tag === "br") { append("\n", marks); return }
    if (["script", "style", "iframe", "img", "svg"].includes(tag)) return
    if (tag === "div" && runs.length > 0 && !runs.at(-1)?.text.endsWith("\n")) append("\n", marks)
    const next = { ...marks }
    if (tag === "strong" || tag === "b") next.strong = true
    if (tag === "em" || tag === "i") next.emphasis = true
    if (tag === "u") next.underline = true
    if (tag === "span" && (node.dataset.inkwellSmallCaps === "true" || node.style.fontVariant === "small-caps")) next.smallCaps = true
    if (tag === "a") next.href = safeInlineHref(node.getAttribute("href") ?? "")
    node.childNodes.forEach((child) => walk(child, next))
  }
  root.childNodes.forEach((child) => walk(child, {}))
  return writeInlineRuns(runs)
}

export function inlineToMarkdown(content: string): string {
  return readInlineRuns(content).map((run) => {
    let text = run.text
    if (run.smallCaps) text = `<span style="font-variant:small-caps">${escapeHtml(text)}</span>`
    if (run.underline) text = `<u>${text}</u>`
    if (run.emphasis) text = `*${text}*`
    if (run.strong) text = `**${text}**`
    if (run.href) text = `[${text}](${run.href.replace(/\)/g, "%29")})`
    return text
  }).join("")
}
