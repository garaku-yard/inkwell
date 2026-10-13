import { describe, expect, it } from "vitest"
import { colorMarkdownRange } from "@/lib/editor/markdown-color"

describe("Vault Markdown text color", () => {
  it("colors, recolors, and clears selected words without changing surrounding Markdown", () => {
    const source = "**A red door**"
    const colored = colorMarkdownRange(source, 4, 7, "#aa2233")!
    expect(colored.content).toBe('**A <span style="color:#aa2233">red</span> door**')
    const recolored = colorMarkdownRange(colored.content, colored.selectionStart, colored.selectionStart + 3, "#336699")!
    expect(recolored.content).toContain('style="color:#336699">red</span>')
    const cleared = colorMarkdownRange(recolored.content, recolored.selectionStart, recolored.selectionStart + 3, null)!
    expect(cleared.content).toBe(source)
  })

  it("rejects unsafe colors and invalid ranges", () => {
    expect(colorMarkdownRange("hello", 0, 5, "red;display:none")).toBeNull()
    expect(colorMarkdownRange("hello", 0, 6, "#aa2233")).toBeNull()
  })
})
