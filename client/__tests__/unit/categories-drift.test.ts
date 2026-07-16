/** Keeps the two copies of the category list honest.
 *
 *  `client/lib/categories.json` is authoritative; the workspace-service seeds the
 *  hosted build from `server/internal/workspace/categories.json`. They're copies
 *  because the Docker build contexts are ./client and ./server, so neither tree
 *  can import the other's file — `task categories:sync` copies it and this test
 *  is what makes the copy trustworthy.
 *
 *  This isn't theoretical. The lists were seeded independently (a TS constant and
 *  a SQL migration) and silently diverged: the web called `novel` "Novel" while
 *  the desktop called the same slug "Prose", the descriptions disagreed, and the
 *  icons used two different naming conventions. Nothing noticed, because the two
 *  are never rendered side by side.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { BUILTIN_CATEGORIES } from "@/lib/storage/local/shared"

const CLIENT_ROOT = join(__dirname, "..", "..")
const REPO_ROOT = join(CLIENT_ROOT, "..")

const CLIENT_LIST = join(CLIENT_ROOT, "lib", "categories.json")
const SERVER_LIST = join(REPO_ROOT, "server", "internal", "workspace", "categories.json")

const read = (p: string) => readFileSync(p, "utf8")

describe("category list", () => {
  it("is byte-identical between client and server", () => {
    expect(
      read(SERVER_LIST),
      "server/internal/workspace/categories.json is out of sync with the authoritative " +
        "client/lib/categories.json — run `task categories:sync`",
    ).toBe(read(CLIENT_LIST))
  })

  it("feeds the desktop's BUILTIN_CATEGORIES (every category, hosted or not)", () => {
    const file = JSON.parse(read(CLIENT_LIST)) as { categories: Array<{ slug: string; name: string }> }
    expect(BUILTIN_CATEGORIES.map((c) => c.slug)).toEqual(file.categories.map((c) => c.slug))
    expect(BUILTIN_CATEGORIES.map((c) => c.name)).toEqual(file.categories.map((c) => c.name))
  })

  it("keeps vault desktop-only and board hosted", () => {
    const file = JSON.parse(read(CLIENT_LIST)) as {
      categories: Array<{ slug: string; hosted: boolean }>
    }
    const bySlug = new Map(file.categories.map((c) => [c.slug, c]))
    // A vault is a folder of real files — it cannot exist on the web build.
    expect(bySlug.get("vault")?.hosted, "vault must stay desktop-only").toBe(false)
    // Board is a pure-canvas project type and works hosted; it was missing from
    // the server's seed, which is why it never appeared in the web picker.
    expect(bySlug.get("board")?.hosted, "board should be available on the web build").toBe(true)
  })

  it("has a unique, non-empty slug/name/description per category", () => {
    const file = JSON.parse(read(CLIENT_LIST)) as {
      categories: Array<{ slug: string; name: string; description: string }>
    }
    const slugs = file.categories.map((c) => c.slug)
    expect(new Set(slugs).size, "duplicate slug").toBe(slugs.length)
    for (const c of file.categories) {
      expect(c.name.trim(), `${c.slug} has no name`).not.toBe("")
      expect(c.description.trim(), `${c.slug} has no description`).not.toBe("")
    }
  })
})
