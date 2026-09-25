import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { strFromU8, unzipSync } from "fflate"
import { describe, expect, it, vi } from "vitest"

import { InlineFormattingToolbar, InlineTextEditable } from "@/components/editor/shared/InlineTextEditable"
import { buildIwFile, parseIw, serializeIw } from "@/lib/iw/format"
import { pushElement } from "@/lib/storage/local/sync-mappers"
import { buildEpub } from "@/lib/export/prose-epub"
import { editorHtmlToInline, inlineToHtml, inlineToMarkdown, plainInlineText, writeInlineRuns } from "@/lib/editor/inline-content"
import type { FullProject } from "@/services/project"

const rich = writeInlineRuns([
  { text: "The " },
  { text: "moon", strong: true, emphasis: true },
  { text: " rises; " },
  { text: "look", href: "https://example.org/moon" },
  { text: " up", smallCaps: true, underline: true },
])

describe("inline content", () => {
  it("round-trips marks and leaves legacy plain text unchanged", () => {
    expect(plainInlineText(rich)).toBe("The moon rises; look up")
    expect(inlineToHtml(rich)).toContain("<strong><em>moon</em></strong>")
    expect(inlineToMarkdown(rich)).toContain("***moon***")
    expect(editorHtmlToInline(inlineToHtml(rich))).toBe(rich)
    expect(editorHtmlToInline(inlineToHtml("2 < 3 & 4"))).toBe("2 < 3 & 4")
  })

  it("drops pasted scripts and unsafe links while preserving visible text", () => {
    const saved = editorHtmlToInline('<script>alert(1)</script><a href="javascript:alert(1)">read</a><img src=x onerror=alert(2)><b> on</b>')
    expect(plainInlineText(saved)).toBe("read on")
    expect(inlineToHtml(saved)).not.toMatch(/javascript:|script|img|onerror/)
    expect(inlineToHtml(saved)).toContain("<strong> on</strong>")
  })

  it("survives .iw and sync, and renders semantic EPUB XHTML", () => {
    const project = {
      id: "p", title: "Night", description: "", owner_id: "u", category: "novel", status: "draft",
      is_starred: false, created_at: "", updated_at: "",
      scenes: [{ id: "s", project_id: "p", scene_heading: "One", content: "", order_index: 0, created_at: "", updated_at: "", elements: [
        { id: "e", project_id: "p", scene_id: "s", element_type: "paragraph", content: rich, line_number: 0, formatting: {}, created_at: "", updated_at: "" },
      ] }],
    } as FullProject
    const file = buildIwFile({ project, characters: [], locations: [], beats: [], lanes: [], connections: [], outlineItems: [], exportedAt: "2026-09-25T00:00:00Z" })
    expect(parseIw(serializeIw(file)).scenes[0].elements[0].content).toBe(rich)
    expect(pushElement({ id: "e", project_id: "p", scene_id: "s", element_type: "paragraph", content: rich, line_number: 0, formatting_json: "{}" }).content).toBe(rich)
    const chapter = strFromU8(unzipSync(buildEpub(project))["OEBPS/chapter-001.xhtml"])
    expect(chapter).toContain("<strong><em>moon</em></strong>")
    expect(chapter).toContain('<a href="https://example.org/moon">look</a>')
  })

  it("applies keyboard and toolbar marks to the current selection", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<><InlineTextEditable value="the moon" onValueChange={onValueChange} /><InlineFormattingToolbar /></>)
    const editor = screen.getByRole("textbox")
    editor.focus()
    const range = document.createRange()
    range.setStart(editor.firstChild!, 4)
    range.setEnd(editor.firstChild!, 8)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    fireEvent.keyDown(editor, { key: "b", ctrlKey: true })
    expect(plainInlineText(onValueChange.mock.lastCall?.[0])).toBe("the moon")
    expect(inlineToHtml(onValueChange.mock.lastCall?.[0])).toContain("<strong>moon</strong>")

    await user.click(screen.getByRole("button", { name: "Underline" }))
    expect(inlineToHtml(onValueChange.mock.lastCall?.[0])).toContain("<u>moon</u>")
  })
})
