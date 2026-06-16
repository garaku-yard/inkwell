import { describe, expect, it } from "vitest"

import { MAX_CHARS, chunkNote } from "@/lib/vault/chunk"

describe("chunkNote", () => {
  it("returns nothing for blank input", () => {
    expect(chunkNote("")).toEqual([])
    expect(chunkNote("   \n\n  ")).toEqual([])
  })

  it("keeps a short note as a single chunk", () => {
    const chunks = chunkNote("# Title\n\nA short note about cats.")
    expect(chunks).toHaveLength(1)
    expect(chunks[0].idx).toBe(0)
    expect(chunks[0].text).toContain("cats")
  })

  it("packs several short paragraphs together under the cap", () => {
    const note = ["First para.", "Second para.", "Third para."].join("\n\n")
    const chunks = chunkNote(note)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toContain("First")
    expect(chunks[0].text).toContain("Third")
  })

  it("splits a paragraph longer than the cap into multiple chunks", () => {
    const long = "word ".repeat(300) // ~1500 chars, well over the cap
    const chunks = chunkNote(long)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      // Allow a little overlap slack beyond the cap.
      expect(c.text.length).toBeLessThanOrEqual(MAX_CHARS + 64)
    }
  })

  it("assigns sequential, zero-based chunk indices", () => {
    const note = Array.from({ length: 6 }, (_, i) =>
      `Paragraph ${i} `.repeat(40),
    ).join("\n\n")
    const chunks = chunkNote(note)
    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach((c, i) => expect(c.idx).toBe(i))
  })
})
