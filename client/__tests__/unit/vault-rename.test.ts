import { describe, expect, it, vi, beforeEach } from "vitest"

// In-memory vault: absolute path -> file content. The fake fs below is driven
// entirely off this map so each test can lay out a small vault.
const files = new Map<string, string>()
const writeSpy = vi.fn()

function dirChildren(dir: string) {
  const prefix = dir.endsWith("/") ? dir : `${dir}/`
  const seenDirs = new Set<string>()
  const out: Array<{ name: string; isFile: boolean; isDirectory: boolean }> = []
  for (const path of files.keys()) {
    if (!path.startsWith(prefix)) continue
    const rest = path.slice(prefix.length)
    const slash = rest.indexOf("/")
    if (slash === -1) {
      out.push({ name: rest, isFile: true, isDirectory: false })
    } else {
      const d = rest.slice(0, slash)
      if (!seenDirs.has(d)) {
        seenDirs.add(d)
        out.push({ name: d, isFile: false, isDirectory: true })
      }
    }
  }
  return out
}

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: async (dir: string) => dirChildren(dir),
  readTextFile: async (path: string) => {
    if (!files.has(path)) throw new Error(`ENOENT ${path}`)
    return files.get(path)!
  },
  writeTextFile: async (path: string, content: string) => {
    writeSpy(path, content)
    files.set(path, content)
  },
  rename: async (from: string, to: string) => {
    const content = files.get(from)
    if (content === undefined) throw new Error(`ENOENT ${from}`)
    files.delete(from)
    files.set(to, content)
  },
  exists: async (path: string) => files.has(path),
  mkdir: async () => {},
  remove: async (path: string) => {
    files.delete(path)
  },
}))

vi.mock("@/lib/tauri-scope", () => ({ allowFsDir: async () => {} }))

// Dumb db: vault_path lookups resolve to the vault root; everything else is a
// recorded no-op. This test exercises the on-disk body sweep (#9), not the
// SQL index, so the index statements don't need real semantics.
vi.mock("@/lib/storage/local/shared", () => ({
  now: () => "t",
  getDb: async () => ({
    select: async (sql: string) =>
      sql.includes("vault_path") ? [{ vault_path: "/vault" }] : [],
    execute: async () => ({ rowsAffected: 0 }),
  }),
}))

// Knowledge sync is fire-and-forget; stub it so the dynamic import resolves
// without pulling the embedding pipeline.
vi.mock("@/lib/storage/local/knowledge", () => ({
  indexNoteOnSave: async () => {},
  removeNoteFromIndex: async () => {},
  removeNotesUnderFromIndex: async () => {},
  renameNoteInIndex: async () => {},
}))

import { vault } from "@/lib/storage/local/vault"

describe("vault.renameNote — cross-folder same-basename safety (#9)", () => {
  beforeEach(() => {
    files.clear()
    writeSpy.mockClear()
  })

  it("rewrites [[oldTitle]] references when the rename is unambiguous", async () => {
    files.set("/vault/Alpha.md", "# Alpha\n")
    files.set("/vault/Ref.md", "See [[Alpha]] for details.\n")

    await vault.renameNote("p1", "Alpha.md", "Beta")

    const ref = files.get("/vault/Ref.md")!
    expect(ref).toContain("[[Beta]]")
    expect(ref).not.toContain("[[Alpha]]")
  })

  it("does NOT rewrite ambiguous links when a same-named note survives in another folder", async () => {
    files.set("/vault/a/Notes.md", "# Notes\n")
    files.set("/vault/b/Notes.md", "# Notes\n")
    files.set("/vault/Ref.md", "Link to [[Notes]].\n")

    await vault.renameNote("p1", "a/Notes.md", "Renamed")

    // b/Notes.md still answers to "Notes", so the [[Notes]] link is ambiguous
    // and must be left pointing at the survivor — Ref.md is untouched.
    const ref = files.get("/vault/Ref.md")!
    expect(ref).toBe("Link to [[Notes]].\n")
    expect(writeSpy).not.toHaveBeenCalledWith("/vault/Ref.md", expect.anything())
    // The file itself still moved.
    expect(files.has("/vault/a/Renamed.md")).toBe(true)
    expect(files.has("/vault/a/Notes.md")).toBe(false)
  })
})
