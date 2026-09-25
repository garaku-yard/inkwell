"use client"

import type { ComponentProps, KeyboardEvent as ReactKeyboardEvent, MouseEvent, ClipboardEvent } from "react"
import { Bold, Italic, Underline, Link2, CaseUpper } from "lucide-react"

import { Button } from "@/components/ui/button"
import { editorHtmlToInline, inlineToHtml, safeInlineHref } from "@/lib/editor/inline-content"
import { StableContentEditable } from "./StableContentEditable"

type Mark = "strong" | "emphasis" | "underline" | "smallCaps" | "link"
type Props = Omit<ComponentProps<typeof StableContentEditable>, "mode">

function selectedRange(): Range | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  const root = (range.commonAncestorContainer instanceof Element
    ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest("[data-inline-editor]")
  return root?.contains(range.startContainer) && root.contains(range.endContainer) ? range.cloneRange() : null
}

function applyMark(mark: Mark, href?: string, captured?: Range | null): boolean {
  const range = captured ?? selectedRange()
  if (!range) return false
  const root = (range.commonAncestorContainer instanceof Element
    ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest<HTMLElement>("[data-inline-editor]")
  if (!root) return false
  const tag = mark === "strong" ? "strong" : mark === "emphasis" ? "em" : mark === "underline" ? "u" : mark === "link" ? "a" : "span"
  const wrapper = document.createElement(tag)
  if (mark === "smallCaps") {
    wrapper.setAttribute("data-inkwell-small-caps", "true")
    ;(wrapper as HTMLElement).style.fontVariant = "small-caps"
  }
  if (mark === "link") {
    const safe = safeInlineHref(href ?? "")
    if (!safe) return false
    wrapper.setAttribute("href", safe)
  }
  wrapper.append(range.extractContents())
  range.insertNode(wrapper)
  const selection = window.getSelection()
  const next = document.createRange()
  next.selectNodeContents(wrapper)
  selection?.removeAllRanges()
  selection?.addRange(next)
  root.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText" }))
  root.focus()
  return true
}

function askForLink(captured?: Range | null): boolean {
  const range = captured ?? selectedRange()
  if (!range) return false
  const href = window.prompt("Link URL (https://, http://, or mailto:)", "https://")
  return href ? applyMark("link", href, range) : false
}

export function InlineTextEditable({ value, onValueChange, onKeyDown, onPaste, ...props }: Props) {
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

  return <StableContentEditable {...props} data-inline-editor="" mode="html" value={inlineToHtml(value)} onValueChange={(html) => onValueChange(editorHtmlToInline(html))} onKeyDown={keyDown} onPaste={paste} />
}

/** Pointer down preserves the manuscript selection while a mark button runs. */
export function InlineFormattingToolbar() {
  const click = (mark: Mark) => (_event: MouseEvent<HTMLButtonElement>) => {
    if (mark === "link") askForLink()
    else applyMark(mark)
  }
  const items = [
    { mark: "strong", label: "Strong emphasis", shortcut: "Ctrl/⌘ B", icon: Bold },
    { mark: "emphasis", label: "Emphasis", shortcut: "Ctrl/⌘ I", icon: Italic },
    { mark: "underline", label: "Underline", shortcut: "Ctrl/⌘ U", icon: Underline },
    { mark: "smallCaps", label: "Small caps", shortcut: "Ctrl/⌘ Shift C", icon: CaseUpper },
    { mark: "link", label: "Link", shortcut: "Ctrl/⌘ Shift K", icon: Link2 },
  ] as const
  return <div role="group" aria-label="Inline formatting" className="flex items-center gap-0.5 border-l pl-2">
    {items.map(({ mark, label, shortcut, icon: Icon }) => <Button key={mark} variant="ghost" size="icon" className="h-7 w-7" aria-label={label} title={`${label} (${shortcut})`} onMouseDown={(event) => event.preventDefault()} onClick={click(mark)}><Icon className="h-3.5 w-3.5" /></Button>)}
  </div>
}
