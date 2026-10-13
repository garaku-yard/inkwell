import { safeInlineColor } from "./inline-content"

/** Color a raw Markdown selection using portable inline HTML. Offsets are UTF-16 source offsets. */
export function colorMarkdownRange(source: string, start: number, end: number, requested: string | null): { content: string; selectionStart: number } | null {
  const color = requested === null ? null : safeInlineColor(requested)
  if ((requested !== null && !color) || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > source.length) return null
  const spans = /<span style="color:#[0-9a-fA-F]{6}">([\s\S]*?)<\/span>/g
  let match: RegExpExecArray | null
  while ((match = spans.exec(source))) {
    const opening = match[0].indexOf(">") + 1
    const innerFrom = match.index + opening
    const innerTo = innerFrom + match[1].length
    if (start < innerFrom || end > innerTo) continue
    const oldPrefix = match[0].slice(0, opening)
    const left = match[1].slice(0, start - innerFrom)
    const selected = match[1].slice(start - innerFrom, end - innerFrom)
    const right = match[1].slice(end - innerFrom)
    const newPrefix = color ? `<span style="color:${color}">` : ""
    const replacement = `${left ? `${oldPrefix}${left}</span>` : ""}${newPrefix}${selected}${color ? "</span>" : ""}${right ? `${oldPrefix}${right}</span>` : ""}`
    const selectionStart = match.index + (left ? oldPrefix.length + left.length + 7 : 0) + newPrefix.length
    return { content: source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length), selectionStart }
  }
  if (!color) return null
  const prefix = `<span style="color:${color}">`
  return { content: source.slice(0, start) + prefix + source.slice(start, end) + "</span>" + source.slice(end), selectionStart: start + prefix.length }
}
