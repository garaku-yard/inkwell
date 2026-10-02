"use client"

import { useEffect, useRef, useState } from "react"
import type { ComponentProps, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ClipboardEvent } from "react"
import { Bold, Italic, Underline, Link2, CaseUpper } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { editorHtmlToInline, inlineToHtml, plainInlineText, readInlineRuns, safeInlineHref, writeInlineRuns, type InlineRun } from "@/lib/editor/inline-content"
import { StableContentEditable, type StableContentEditableHandle } from "./StableContentEditable"

type Mark = "strong" | "emphasis" | "underline" | "smallCaps" | "link"
type MarkState = "off" | "mixed" | "on"
type Props = Omit<ComponentProps<typeof StableContentEditable>, "mode">
const MARKS: Mark[] = ["strong", "emphasis", "underline", "smallCaps", "link"]
const EMPTY_MARK_STATES: Record<Mark, MarkState> = {
  strong: "off", emphasis: "off", underline: "off", smallCaps: "off", link: "off",
}

function selectedRange(): Range | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  const root = (range.commonAncestorContainer instanceof Element
    ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest("[data-inline-editor]")
  return root?.contains(range.startContainer) && root.contains(range.endContainer) ? range.cloneRange() : null
}

function textOffset(root: HTMLElement, node: Node, offset: number): number {
  const prefix = document.createRange()
  prefix.selectNodeContents(root)
  prefix.setEnd(node, offset)
  const container = document.createElement("div")
  container.append(prefix.cloneContents())
  return plainInlineText(editorHtmlToInline(container.innerHTML)).length
}

function boundaryAt(root: HTMLElement, offset: number): { node: Node; offset: number } {
  let remaining = offset
  const walk = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0
      if (remaining <= length) return { node, offset: remaining }
      remaining -= length
      return null
    }
    if (node instanceof HTMLBRElement) {
      const parent = node.parentNode!
      const index = Array.prototype.indexOf.call(parent.childNodes, node) as number
      if (remaining === 0) return { node: parent, offset: index }
      remaining--
      if (remaining === 0) return { node: parent, offset: index + 1 }
      return null
    }
    for (const child of node.childNodes) {
      const found = walk(child)
      if (found) return found
    }
    return null
  }
  return walk(root) ?? { node: root, offset: root.childNodes.length }
}

function selectionContext(captured?: Range | null, includeCaret = false) {
  const selection = window.getSelection()
  const range = captured ?? (includeCaret && selection?.rangeCount ? selection.getRangeAt(0) : selectedRange())
  if (!range) return null
  const root = (range.commonAncestorContainer instanceof Element
    ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest<HTMLElement>("[data-inline-editor]")
  if (!root || !root.isConnected) return null
  const start = textOffset(root, range.startContainer, range.startOffset)
  const end = textOffset(root, range.endContainer, range.endOffset)
  if (start > end || (!includeCaret && start === end)) return null
  return { root, start, end, runs: readInlineRuns(editorHtmlToInline(root.innerHTML)) }
}

function selectedRuns(runs: InlineRun[], start: number, end: number): InlineRun[] {
  let position = 0
  return runs.filter((run) => {
    const overlaps = position < end && position + run.text.length > start
    position += run.text.length
    return overlaps
  })
}

function markStatesAtSelection(): Record<Mark, MarkState> {
  const context = selectionContext(undefined, true)
  if (!context) return EMPTY_MARK_STATES
  const { runs, start, end } = context
  let relevant: InlineRun[]
  if (start === end) {
    let position = 0
    relevant = runs.filter((run, index) => {
      const containsCaret = start >= position && (start < position + run.text.length || index === runs.length - 1)
      position += run.text.length
      return containsCaret
    }).slice(0, 1)
  } else relevant = selectedRuns(runs, start, end)
  const states = { ...EMPTY_MARK_STATES }
  for (const mark of MARKS) {
    const marked = relevant.filter((run) => mark === "link" ? !!run.href : !!run[mark]).length
    states[mark] = marked === 0 ? "off" : marked === relevant.length ? "on" : "mixed"
  }
  return states
}

function applyMark(mark: Mark, href?: string, captured?: Range | null): boolean {
  const context = selectionContext(captured)
  if (!context) return false
  const { root, start, end, runs } = context
  const selected = selectedRuns(runs, start, end)
  const allMarked = selected.length > 0 && selected.every((run) => mark === "link" ? !!run.href : !!run[mark])
  const safeHref = mark === "link" && !allMarked ? safeInlineHref(href ?? "") : undefined
  if (mark === "link" && !allMarked && !safeHref) return false
  let position = 0
  const nextRuns: InlineRun[] = []
  for (const run of runs) {
    const runStart = position
    const runEnd = position + run.text.length
    position = runEnd
    if (runEnd <= start || runStart >= end) {
      nextRuns.push(run)
      continue
    }
    const from = Math.max(start - runStart, 0)
    const to = Math.min(end - runStart, run.text.length)
    if (from > 0) nextRuns.push({ ...run, text: run.text.slice(0, from) })
    const middle: InlineRun = { ...run, text: run.text.slice(from, to) }
    if (mark === "link") {
      if (allMarked) delete middle.href
      else middle.href = safeHref
    } else if (allMarked) delete middle[mark]
    else middle[mark] = true
    nextRuns.push(middle)
    if (to < run.text.length) nextRuns.push({ ...run, text: run.text.slice(to) })
  }
  root.innerHTML = inlineToHtml(writeInlineRuns(nextRuns))
  root.focus()
  const selection = window.getSelection()
  const next = document.createRange()
  const startBoundary = boundaryAt(root, start)
  const endBoundary = boundaryAt(root, end)
  next.setStart(startBoundary.node, startBoundary.offset)
  next.setEnd(endBoundary.node, endBoundary.offset)
  selection?.removeAllRanges()
  selection?.addRange(next)
  root.dispatchEvent(new Event("inkwell:inline-format", { bubbles: true }))
  return true
}

function askForLink(captured?: Range | null): boolean {
  const range = captured ?? selectedRange()
  if (!range) return false
  const context = selectionContext(range)
  if (!context) return false
  if (selectedRuns(context.runs, context.start, context.end).every((run) => !!run.href)) {
    return applyMark("link", undefined, range)
  }
  const href = window.prompt("Link URL (https://, http://, or mailto:)", "https://")
  return href ? applyMark("link", href, range) : false
}

export function InlineTextEditable({ value, onValueChange, onKeyDown, onPaste, className, ...props }: Props) {
  const editable = useRef<StableContentEditableHandle>(null)
  useEffect(() => {
    const element = editable.current?.element
    if (!element) return
    const commit = () => editable.current?.commitContent()
    element.addEventListener("inkwell:inline-format", commit)
    return () => element.removeEventListener("inkwell:inline-format", commit)
  }, [])
  const keyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const key = event.key.toLowerCase()
      const mark: Mark | null = !event.shiftKey && key === "b" ? "strong"
        : !event.shiftKey && key === "i" ? "emphasis"
        : !event.shiftKey && key === "u" ? "underline"
        : event.shiftKey && key === "c" ? "smallCaps" : null
      if (mark) {
        event.preventDefault()
        applyMark(mark)
        return
      }
      if (event.shiftKey && key === "k") {
        event.preventDefault()
        askForLink()
        return
      }
    }
    onKeyDown?.(event)
  }

  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const text = event.clipboardData.getData("text/plain")
    const selection = window.getSelection()
    if (!selection?.rangeCount) return
    const range = selection.getRangeAt(0)
    range.deleteContents()
    const node = document.createTextNode(text)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    event.currentTarget.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }))
    onPaste?.(event)
  }

  return <StableContentEditable {...props} ref={editable} className={cn("[&_strong]:font-bold [&_em]:italic [&_u]:underline", className)} data-inline-editor="" mode="html" value={inlineToHtml(value)} onValueChange={(html) => onValueChange(editorHtmlToInline(html))} onKeyDown={keyDown} onPaste={paste} />
}

/** Pointer down preserves the manuscript selection while a mark button runs. */
export function InlineFormattingToolbar() {
  const capturedRange = useRef<Range | null>(null)
  const [markStates, setMarkStates] = useState<Record<Mark, MarkState>>(EMPTY_MARK_STATES)
  useEffect(() => {
    const update = () => {
      const next = markStatesAtSelection()
      setMarkStates((current) => MARKS.every((mark) => current[mark] === next[mark]) ? current : next)
    }
    update()
    document.addEventListener("selectionchange", update)
    document.addEventListener("pointerup", update)
    document.addEventListener("keyup", update)
    document.addEventListener("inkwell:inline-format", update)
    return () => {
      document.removeEventListener("selectionchange", update)
      document.removeEventListener("pointerup", update)
      document.removeEventListener("keyup", update)
      document.removeEventListener("inkwell:inline-format", update)
    }
  }, [])
  const click = (mark: Mark) => (_event: ReactMouseEvent<HTMLButtonElement>) => {
    const range = capturedRange.current ?? selectedRange()
    capturedRange.current = null
    if (mark === "link") askForLink(range)
    else applyMark(mark, undefined, range)
  }
  const keepSelection = (event: ReactPointerEvent<HTMLButtonElement>) => {
    capturedRange.current = selectedRange()
    event.preventDefault()
  }
  const items = [
    { mark: "strong", label: "Strong emphasis", shortcut: "Ctrl/⌘ B", icon: Bold },
    { mark: "emphasis", label: "Emphasis", shortcut: "Ctrl/⌘ I", icon: Italic },
    { mark: "underline", label: "Underline", shortcut: "Ctrl/⌘ U", icon: Underline },
    { mark: "smallCaps", label: "Small caps", shortcut: "Ctrl/⌘ Shift C", icon: CaseUpper },
    { mark: "link", label: "Link", shortcut: "Ctrl/⌘ Shift K", icon: Link2 },
  ] as const
  return <div role="group" aria-label="Inline formatting" className="flex items-center gap-0.5 border-l pl-2">
    {items.map(({ mark, label, shortcut, icon: Icon }) => <Button key={mark} variant="ghost" size="icon" className={cn("h-7 w-7", markStates[mark] === "on" && "bg-primary text-primary-foreground hover:bg-primary/90", markStates[mark] === "mixed" && "bg-primary/10 text-primary ring-1 ring-primary/40")} aria-label={label} aria-pressed={markStates[mark] === "mixed" ? "mixed" : markStates[mark] === "on"} title={`${label} (${shortcut})`} onPointerDown={keepSelection} onMouseDown={(event) => { if (!capturedRange.current) capturedRange.current = selectedRange(); event.preventDefault() }} onClick={click(mark)}><Icon className="h-3.5 w-3.5" /></Button>)}
  </div>
}
