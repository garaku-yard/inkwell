import { describe, expect, it } from "vitest"

import { rewriteWikilinks } from "@/lib/vault/wikilink-sweep"

describe("rewriteWikilinks", () => {
  it("rewrites a plain `[[Old]]` link", () => {
    expect(rewriteWikilinks("see [[Old Note]] for details", "Old Note", "New Note"))
      .toBe("see [[New Note]] for details")
  })

  it("preserves the alias on `[[Old|alias]]`", () => {
    expect(rewriteWikilinks("[[Old Note|the alias]] here", "Old Note", "New Note"))
      .toBe("[[New Note|the alias]] here")
  })

  it("preserves the heading anchor on `[[Old#heading]]`", () => {
    expect(rewriteWikilinks("see [[Old Note#Section 2]] now", "Old Note", "New Note"))
      .toBe("see [[New Note#Section 2]] now")
  })

  it("preserves both heading and alias on `[[Old#heading|alias]]`", () => {
    expect(
      rewriteWikilinks("[[Old Note#Section|alias text]]", "Old Note", "New Note"),
    ).toBe("[[New Note#Section|alias text]]")
  })

  it("matches case-insensitively but writes the canonical casing", () => {
    expect(rewriteWikilinks("link to [[old note]]", "Old Note", "New Note"))
      .toBe("link to [[New Note]]")
  })

  it("rewrites every occurrence in a body", () => {
    expect(rewriteWikilinks("[[Old]] then [[Old|x]] then [[Old#h]]", "Old", "New"))
      .toBe("[[New]] then [[New|x]] then [[New#h]]")
  })

  it("leaves unrelated wikilinks alone", () => {
    expect(rewriteWikilinks("[[Other]] [[OldNote]] not [[Old Note]]", "Old", "New"))
      .toBe("[[Other]] [[OldNote]] not [[Old Note]]")
  })

  it("escapes regex metacharacters in the title", () => {
    expect(rewriteWikilinks("see [[A.B (draft)]] now", "A.B (draft)", "Final"))
      .toBe("see [[Final]] now")
  })

  it("returns the input unchanged when no matches", () => {
    const body = "no link here"
    expect(rewriteWikilinks(body, "Old", "New")).toBe(body)
  })

  it("returns the input unchanged when oldTitle === newTitle", () => {
    const body = "[[Same]] same"
    expect(rewriteWikilinks(body, "Same", "Same")).toBe(body)
  })

  it("ignores empty old title", () => {
    expect(rewriteWikilinks("[[X]]", "", "Y")).toBe("[[X]]")
  })

  it("tolerates whitespace inside the brackets", () => {
    expect(rewriteWikilinks("[[ Old | alias ]]", "Old", "New"))
      .toBe("[[ New | alias ]]")
  })
})
