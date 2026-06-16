import {
  readDir,
  readTextFile,
  writeTextFile,
  remove,
  exists,
  mkdir,
  rename,
} from "@tauri-apps/plugin-fs"

import type {
  VaultBacklink,
  VaultGraphEdge,
  VaultGraphNode,
  VaultNote,
  VaultStorage,
  VaultTag,
} from "@/lib/storage"
import { rewriteWikilinks } from "@/lib/vault/wikilink-sweep"
import { allowFsDir } from "@/lib/tauri-scope"
import { getDb, now } from "./shared"

// ─── Vault (markdown notes on disk) ──────────────────────────────────────

// Vault-as-knowledge keeps an embedding index in sync with note edits. The
// hooks are loaded lazily (dynamic import) so we don't create a static cycle
// with `./knowledge` (which imports this module's `vault` object), and they
// run fire-and-forget: a vault that nobody has wired as knowledge self-guards
// to a no-op, and a failed embed must never break the save itself.
function syncKnowledgeOnSave(
  projectId: string,
  filename: string,
  content: string,
): void {
  void import("./knowledge")
    .then(({ indexNoteOnSave }) => indexNoteOnSave(projectId, filename, content))
    .catch(() => {})
}

function syncKnowledgeRemoveNote(projectId: string, filename: string): void {
  void import("./knowledge")
    .then(({ removeNoteFromIndex }) => removeNoteFromIndex(projectId, filename))
    .catch(() => {})
}

function syncKnowledgeRemoveFolder(projectId: string, folderRel: string): void {
  void import("./knowledge")
    .then(({ removeNotesUnderFromIndex }) =>
      removeNotesUnderFromIndex(projectId, folderRel),
    )
    .catch(() => {})
}

function syncKnowledgeRename(
  projectId: string,
  oldFilename: string,
  newFilename: string,
): void {
  void import("./knowledge")
    .then(({ renameNoteInIndex }) =>
      renameNoteInIndex(projectId, oldFilename, newFilename),
    )
    .catch(() => {})
}

function joinPath(dir: string, filename: string): string {
  // Cross-platform join: prefer the OS separator already present in `dir`
  // when it's obviously Windows (`C:\`). Otherwise use `/` which Tauri's
  // fs plugin normalises on Windows too. Handles relative `filename` with
  // its own `/` separators — they get preserved when the base uses `/`
  // and flipped to `\\` on pure-Windows bases.
  const sep = /\\/.test(dir) && !/\//.test(dir) ? "\\" : "/"
  const cleanDir = dir.replace(/[\\/]+$/, "")
  const normalisedTail = sep === "\\" ? filename.replace(/\//g, "\\") : filename
  return `${cleanDir}${sep}${normalisedTail}`
}

/** Strips a leading `./` and collapses `\\` → `/` so we always carry
 *  forward-slash relative paths inside the app; the OS-specific join is
 *  only applied when we hand the path to the filesystem. */
function normaliseRelPath(rel: string): string {
  return rel.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "")
}

/** Sanitises a single path segment — folder name or note title. */
function sanitiseSegment(segment: string): string {
  const cleaned = segment
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
  return cleaned
}

// ─── Backlinks index ─────────────────────────────────────────────────────

/** Projects whose `note_links` rows we've reconciled this session.
 *  Prevents doing a full vault scan on every `listNotes`. */
const vaultIndexBuilt = new Set<string>()

/** Matches `[[Target]]` and `[[Target|Alias]]`. Bounded length keeps a
 *  stray `[[` from running away; non-greedy to avoid swallowing the next
 *  closing bracket in a sequence of links. */
const WIKILINK_PATTERN = /\[\[\s*([^\]|]{1,200}?)(?:\s*\|[^\]]{0,200})?\s*\]\]/g

/** Matches `#tag` / `#nested/tag`. Must be preceded by whitespace or
 *  start-of-string so `foo#bar` and URL fragments don't count. First
 *  character can't be a digit to keep numeric-only strings out —
 *  matches Obsidian's convention. Allows `_ - /` inside, forward slash
 *  for nested tags (`#project/alpha`). */
const TAG_PATTERN = /(?:^|\s)(#[A-Za-z_][\w\-/]{0,100})/g

function extractTags(body: string): string[] {
  // Strip fenced code blocks and inline code spans first — `#define`
  // in a code sample isn't a tag.
  const stripped = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
  const out = new Set<string>()
  // Preserve first-seen casing per lowered key.
  const canonByLower = new Map<string, string>()
  let m: RegExpExecArray | null
  TAG_PATTERN.lastIndex = 0
  while ((m = TAG_PATTERN.exec(stripped)) !== null) {
    // Drop the leading `#` and trim any trailing slash (e.g. `#foo/`).
    const tag = m[1].slice(1).replace(/\/+$/, "")
    if (!tag) continue
    const lower = tag.toLowerCase()
    if (!canonByLower.has(lower)) canonByLower.set(lower, tag)
    out.add(lower)
  }
  // Return in original casing, sorted alphabetical.
  return Array.from(out)
    .map((lower) => canonByLower.get(lower)!)
    .sort((a, b) => a.localeCompare(b))
}

/** Replaces every note_links + note_tags row for a given source file.
 *  Called on writeNote + during the initial full scan. Both indexes are
 *  rebuilt in one pass so the filesystem watcher can lean on a single
 *  entry point. */
async function reindexNoteLinks(
  projectId: string,
  filename: string,
  body: string,
): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    "DELETE FROM note_links WHERE project_id = ? AND from_filename = ?",
    [projectId, filename],
  )
  // We need the original (non-lowered) target so the backlinks UI can
  // show "Page" rather than "page". Re-parse the body to keep casing.
  const seen = new Set<string>()
  const lines = body.split(/\r?\n/)
  for (const line of lines) {
    WIKILINK_PATTERN.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = WIKILINK_PATTERN.exec(line)) !== null) {
      const title = m[1].trim()
      if (!title) continue
      const key = title.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      await db.execute(
        `INSERT OR REPLACE INTO note_links (project_id, from_filename, to_title, snippet, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [projectId, filename, title, line.trim().slice(0, 200), ts],
      )
    }
  }

  // Tags — wipe + re-insert. Parse against the full body (not per line)
  // because fenced code blocks span multiple lines and the extractor
  // handles stripping those internally.
  await db.execute(
    "DELETE FROM note_tags WHERE project_id = ? AND from_filename = ?",
    [projectId, filename],
  )
  for (const tag of extractTags(body)) {
    await db.execute(
      `INSERT OR REPLACE INTO note_tags (project_id, from_filename, tag, updated_at)
       VALUES (?, ?, ?, ?)`,
      [projectId, filename, tag, ts],
    )
  }
}

/** Recursively walks `folder` and returns every `.md` file it finds,
 *  yielding the relative path from the top-level folder (forward-slash
 *  separated) plus the matching absolute path. Hidden files starting
 *  with `.` are skipped so `.obsidian/` / `.git/` don't pollute the list. */
async function walkMarkdownFiles(
  folder: string,
  relPrefix = "",
): Promise<Array<{ rel: string; abs: string }>> {
  const out: Array<{ rel: string; abs: string }> = []
  let entries: Awaited<ReturnType<typeof readDir>>
  try {
    entries = await readDir(folder)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    const childRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
    const childAbs = joinPath(folder, entry.name)
    if (entry.isDirectory) {
      const nested = await walkMarkdownFiles(childAbs, childRel)
      out.push(...nested)
    } else if (entry.isFile && entry.name.toLowerCase().endsWith(".md")) {
      out.push({ rel: childRel, abs: childAbs })
    }
  }
  return out
}

/** Ensures every `.md` file in the vault has an up-to-date row set in
 *  `note_links`. Cheap no-op on subsequent calls — the in-memory
 *  `vaultIndexBuilt` set short-circuits repeated work per session. */
async function ensureVaultIndex(
  projectId: string,
  folder: string,
): Promise<void> {
  if (vaultIndexBuilt.has(projectId)) return
  const files = await walkMarkdownFiles(folder)
  for (const file of files) {
    try {
      const body = await readTextFile(file.abs)
      await reindexNoteLinks(projectId, file.rel, body)
    } catch {
      // Skip unreadable files silently; they just won't participate in
      // backlinks until the user opens them.
    }
  }
  vaultIndexBuilt.add(projectId)
}

async function getVaultPathOrThrow(projectId: string): Promise<string> {
  const db = await getDb()
  const rows = await db.select<Array<{ vault_path: string | null }>>(
    "SELECT vault_path FROM projects WHERE id = ?",
    [projectId],
  )
  const path = rows[0]?.vault_path
  if (!path) {
    throw new Error(
      `Vault project ${projectId} has no folder attached. Pick one via the folder picker first.`,
    )
  }
  // Grant this process read/write + asset access to the vault subtree before
  // any caller touches it. Every vault fs operation resolves its folder here,
  // so this is the one place that has to ensure the runtime scope.
  await allowFsDir(path, true)
  return path
}

export const vault: VaultStorage = {
  openVault: async (projectId, folderPath) => {
    const db = await getDb()
    const ts = now()
    await db.execute(
      "UPDATE projects SET vault_path = ?, updated_at = ? WHERE id = ?",
      [folderPath, ts, projectId],
    )
  },

  getVaultPath: async (projectId) => {
    const db = await getDb()
    const rows = await db.select<Array<{ vault_path: string | null }>>(
      "SELECT vault_path FROM projects WHERE id = ?",
      [projectId],
    )
    return rows[0]?.vault_path ?? null
  },

  listNotes: async (projectId) => {
    const folder = await getVaultPathOrThrow(projectId)
    // One-time-per-session full scan so backlinks work for notes that
    // already existed on disk before we had an index. Fast: O(files).
    await ensureVaultIndex(projectId, folder)

    const files = await walkMarkdownFiles(folder)
    const notes: VaultNote[] = files.map((file) => {
      const lastSlash = file.rel.lastIndexOf("/")
      const folderPart = lastSlash === -1 ? "" : file.rel.slice(0, lastSlash)
      const nameOnly = lastSlash === -1 ? file.rel : file.rel.slice(lastSlash + 1)
      return {
        filename: file.rel,
        path: file.abs,
        title: nameOnly.replace(/\.md$/i, ""),
        folder: folderPart,
        // `readDir` doesn't expose mtime; we'd need `stat` to fill this in.
        // For v0 use an empty string so the UI just falls back to the name.
        updatedAt: "",
      }
    })
    // Sort by full relative path so the tree UI gets stable ordering —
    // folders surface together, then files alphabetical per folder.
    notes.sort((a, b) => a.filename.localeCompare(b.filename))
    return notes
  },

  readNote: async (projectId, filename) => {
    const folder = await getVaultPathOrThrow(projectId)
    return readTextFile(joinPath(folder, normaliseRelPath(filename)))
  },

  writeNote: async (projectId, filename, content) => {
    const folder = await getVaultPathOrThrow(projectId)
    const rel = normaliseRelPath(filename)
    // Ensure the parent folder exists before writing. Cheap idempotent
    // mkdir — no harm if the directory is already there.
    const lastSlash = rel.lastIndexOf("/")
    if (lastSlash !== -1) {
      await mkdir(joinPath(folder, rel.slice(0, lastSlash)), {
        recursive: true,
      }).catch(() => {
        /* parent dir likely already exists */
      })
    }
    await writeTextFile(joinPath(folder, rel), content)
    // Keep the backlinks index in sync with every save; the cost is one
    // SQL write per wikilink in the note, negligible for human-sized notes.
    await reindexNoteLinks(projectId, rel, content)
    syncKnowledgeOnSave(projectId, rel, content)
  },

  createNote: async (projectId, title, folder) => {
    const vaultRoot = await getVaultPathOrThrow(projectId)
    const base = sanitiseSegment(title) || "Untitled"

    // `folder` may contain nested segments like `projects/alpha`. Each is
    // sanitised separately so a stray slash in the title doesn't escape
    // the vault. Empty-string or undefined folder → root-level note.
    const folderRel = folder
      ? normaliseRelPath(folder)
          .split("/")
          .map(sanitiseSegment)
          .filter((s) => s.length > 0)
          .join("/")
      : ""
    if (folderRel) {
      await mkdir(joinPath(vaultRoot, folderRel), { recursive: true }).catch(() => {
        /* idempotent */
      })
    }

    const makeRel = (name: string) =>
      folderRel ? `${folderRel}/${name}` : name
    let rel = makeRel(`${base}.md`)
    let path = joinPath(vaultRoot, rel)
    for (let i = 2; i < 1000 && (await exists(path)); i++) {
      rel = makeRel(`${base} ${i}.md`)
      path = joinPath(vaultRoot, rel)
    }
    const body = `# ${title}\n\n`
    await writeTextFile(path, body)
    await reindexNoteLinks(projectId, rel, body)
    syncKnowledgeOnSave(projectId, rel, body)

    const lastSlash = rel.lastIndexOf("/")
    const nameOnly = lastSlash === -1 ? rel : rel.slice(lastSlash + 1)
    return {
      filename: rel,
      path,
      title: nameOnly.replace(/\.md$/i, ""),
      folder: folderRel,
      updatedAt: "",
    }
  },

  renameNote: async (projectId, filename, newTitle) => {
    const vaultRoot = await getVaultPathOrThrow(projectId)
    const oldRel = normaliseRelPath(filename)
    const sanitised = sanitiseSegment(newTitle)
    if (!sanitised) {
      throw new Error("The title can't be empty.")
    }

    const lastSlash = oldRel.lastIndexOf("/")
    const folderRel = lastSlash === -1 ? "" : oldRel.slice(0, lastSlash)
    const oldBasename = lastSlash === -1 ? oldRel : oldRel.slice(lastSlash + 1)
    const oldTitle = oldBasename.replace(/\.md$/i, "")

    // Same title (casing included) → nothing to do. Return the current
    // record so callers don't need a branch.
    if (oldTitle === sanitised) {
      const path = joinPath(vaultRoot, oldRel)
      return {
        filename: oldRel,
        path,
        title: oldTitle,
        folder: folderRel,
        updatedAt: now(),
      }
    }

    const newRel = folderRel ? `${folderRel}/${sanitised}.md` : `${sanitised}.md`
    const oldPath = joinPath(vaultRoot, oldRel)
    const newPath = joinPath(vaultRoot, newRel)

    // Collision guard — only when the target is a different file. A
    // case-only change on a case-insensitive FS lands on the same inode,
    // which is fine.
    if (
      newRel.toLowerCase() !== oldRel.toLowerCase() &&
      (await exists(newPath))
    ) {
      throw new Error(
        `A note named "${sanitised}" already exists in this folder.`,
      )
    }

    await rename(oldPath, newPath)

    const files = await walkMarkdownFiles(vaultRoot)

    // Wikilinks are title-only (`[[Notes]]` carries no folder), so if another
    // note still shares `oldTitle`'s basename after this rename, every
    // `[[oldTitle]]` in the vault is ambiguous — rewriting them would silently
    // retarget the surviving same-named note's links. Only sweep + retarget
    // when this rename leaves no same-titled note behind; otherwise the
    // ambiguous links are left pointing at the survivor (the safe default).
    const titleOfRel = (rel: string) => {
      const slash = rel.lastIndexOf("/")
      const base = slash === -1 ? rel : rel.slice(slash + 1)
      return base.replace(/\.md$/i, "")
    }
    const oldTitleLower = oldTitle.toLowerCase()
    const duplicateTitleSurvives = files.some(
      (f) => f.rel !== newRel && titleOfRel(f.rel).toLowerCase() === oldTitleLower,
    )

    if (!duplicateTitleSurvives) {
      // Sweep every other note's body for references to `oldTitle` and
      // rewrite them to `sanitised`. See lib/vault/wikilink-sweep for the
      // exact shapes covered (plain, alias, heading, heading+alias).
      for (const f of files) {
        if (f.rel === newRel) continue
        let body: string
        try {
          body = await readTextFile(f.abs)
        } catch {
          continue
        }
        const rewritten = rewriteWikilinks(body, oldTitle, sanitised)
        if (rewritten !== body) {
          await writeTextFile(f.abs, rewritten)
          await reindexNoteLinks(projectId, f.rel, rewritten)
          syncKnowledgeOnSave(projectId, f.rel, rewritten)
        }
      }
    }

    // The file moved, so its own outbound link/tag rows must follow the new
    // filename regardless of any title ambiguity.
    const db = await getDb()
    await db.execute(
      "UPDATE note_links SET from_filename = ? WHERE project_id = ? AND from_filename = ?",
      [newRel, projectId, oldRel],
    )
    // Tag rows only key off from_filename — the tag text doesn't change
    // on rename, we just point the rows at the new filename.
    await db.execute(
      "UPDATE note_tags SET from_filename = ? WHERE project_id = ? AND from_filename = ?",
      [newRel, projectId, oldRel],
    )
    if (!duplicateTitleSurvives) {
      // Retarget links that pointed at `oldTitle` to the new title. OR REPLACE
      // collapses the case where the renamed file (excluded from the sweep
      // above) links to BOTH `[[oldTitle]]` and `[[sanitised]]`: without it,
      // turning its `(project_id, newRel, oldTitle)` row into
      // `(project_id, newRel, sanitised)` collides with the existing row on
      // the primary key and throws — after the file move + body rewrites have
      // already committed, leaving the vault half-migrated.
      await db.execute(
        "UPDATE OR REPLACE note_links SET to_title = ? WHERE project_id = ? AND to_title = ? COLLATE NOCASE",
        [sanitised, projectId, oldTitle],
      )
    }
    // The renamed file's content is unchanged, so re-point its embedding rows
    // rather than re-embedding from scratch.
    syncKnowledgeRename(projectId, oldRel, newRel)

    return {
      filename: newRel,
      path: newPath,
      title: sanitised,
      folder: folderRel,
      updatedAt: now(),
    }
  },

  deleteNote: async (projectId, filename) => {
    const folder = await getVaultPathOrThrow(projectId)
    const rel = normaliseRelPath(filename)
    await remove(joinPath(folder, rel))
    // Drop every outbound-from-this-file entry so deleted notes can't
    // appear as phantom backlink sources. Inbound rows (other notes
    // linking *to* this file) stay; they just won't resolve.
    const db = await getDb()
    await db.execute(
      "DELETE FROM note_links WHERE project_id = ? AND from_filename = ?",
      [projectId, rel],
    )
    await db.execute(
      "DELETE FROM note_tags WHERE project_id = ? AND from_filename = ?",
      [projectId, rel],
    )
    syncKnowledgeRemoveNote(projectId, rel)
  },

  createFolder: async (projectId, relPath) => {
    const vaultRoot = await getVaultPathOrThrow(projectId)
    const segments = normaliseRelPath(relPath)
      .split("/")
      .map(sanitiseSegment)
      .filter((s) => s.length > 0)
    if (segments.length === 0) return
    await mkdir(joinPath(vaultRoot, segments.join("/")), { recursive: true })
  },

  deleteFolder: async (projectId, relPath) => {
    const vaultRoot = await getVaultPathOrThrow(projectId)
    const rel = normaliseRelPath(relPath)
    if (!rel) return
    await remove(joinPath(vaultRoot, rel), { recursive: true })
    // Clean the backlinks index of every note that used to live here.
    // LIKE with the folder prefix catches nested notes as well.
    const db = await getDb()
    const prefix = `${rel}/`
    await db.execute(
      "DELETE FROM note_links WHERE project_id = ? AND (from_filename = ? OR from_filename LIKE ?)",
      [projectId, rel, `${prefix}%`],
    )
    await db.execute(
      "DELETE FROM note_tags WHERE project_id = ? AND (from_filename = ? OR from_filename LIKE ?)",
      [projectId, rel, `${prefix}%`],
    )
    syncKnowledgeRemoveFolder(projectId, rel)
  },

  reindexLinks: async (projectId, filename) => {
    // Called by the filesystem watcher when an external tool touches a
    // `.md` file. Keeps the backlinks index honest without waiting for
    // the user to re-save from Inkwell.
    const folder = await getVaultPathOrThrow(projectId)
    const path = joinPath(folder, filename)
    if (!(await exists(path))) {
      // File was deleted or renamed — drop its outbound rows so it stops
      // showing up as a backlink source.
      const db = await getDb()
      await db.execute(
        "DELETE FROM note_links WHERE project_id = ? AND from_filename = ?",
        [projectId, filename],
      )
      await db.execute(
        "DELETE FROM note_tags WHERE project_id = ? AND from_filename = ?",
        [projectId, filename],
      )
      syncKnowledgeRemoveNote(projectId, filename)
      return
    }
    try {
      const body = await readTextFile(path)
      await reindexNoteLinks(projectId, filename, body)
      syncKnowledgeOnSave(projectId, filename, body)
    } catch {
      // A writer may still be holding the file (atomic-write patterns
      // briefly rename a temp file into place). Skip this batch — the
      // watcher will fire again when the write settles.
    }
  },

  getGraph: async (projectId) => {
    const folder = await getVaultPathOrThrow(projectId)
    await ensureVaultIndex(projectId, folder)

    // Nodes: one per `.md` file on disk. We also build a lowered-title
    // → filename map so we can resolve `to_title` rows back to a real
    // node (SQL stores the target title, not filename, because the
    // target may not exist yet when the link is written).
    const files = await walkMarkdownFiles(folder)
    const titleToFile = new Map<string, string>()
    const nodes: VaultGraphNode[] = []
    for (const f of files) {
      const lastSlash = f.rel.lastIndexOf("/")
      const basename = lastSlash === -1 ? f.rel : f.rel.slice(lastSlash + 1)
      const title = basename.replace(/\.md$/i, "")
      titleToFile.set(title.toLowerCase(), f.rel)
      nodes.push({ filename: f.rel, title, degree: 0 })
    }

    const db = await getDb()
    const rows = await db.select<
      Array<{ from_filename: string; to_title: string }>
    >(
      "SELECT from_filename, to_title FROM note_links WHERE project_id = ?",
      [projectId],
    )

    const nodeIndex = new Map<string, VaultGraphNode>()
    for (const n of nodes) nodeIndex.set(n.filename, n)

    const edges: VaultGraphEdge[] = []
    const seenPair = new Set<string>()
    for (const row of rows) {
      const from = row.from_filename
      const to = titleToFile.get(row.to_title.toLowerCase())
      if (!to) continue // phantom target — no node to connect
      if (from === to) continue // self-link
      // Deduplicate undirected pair — A→B + B→A collapse to one line.
      const key = from < to ? `${from}|${to}` : `${to}|${from}`
      if (seenPair.has(key)) continue
      seenPair.add(key)
      edges.push({ from, to })
      const a = nodeIndex.get(from)
      const b = nodeIndex.get(to)
      if (a) a.degree++
      if (b) b.degree++
    }

    return { nodes, edges }
  },

  listTags: async (projectId) => {
    const folder = await getVaultPathOrThrow(projectId)
    await ensureVaultIndex(projectId, folder)
    const db = await getDb()
    const rows = await db.select<Array<{ tag: string; n: number }>>(
      `SELECT tag, COUNT(*) AS n
       FROM note_tags
       WHERE project_id = ?
       GROUP BY tag COLLATE NOCASE
       ORDER BY n DESC, tag COLLATE NOCASE ASC`,
      [projectId],
    )
    const results: VaultTag[] = rows.map((r) => ({ tag: r.tag, count: r.n }))
    return results
  },

  getNotesByTag: async (projectId, tag) => {
    const folder = await getVaultPathOrThrow(projectId)
    await ensureVaultIndex(projectId, folder)
    const db = await getDb()
    const rows = await db.select<Array<{ from_filename: string }>>(
      `SELECT from_filename
       FROM note_tags
       WHERE project_id = ? AND tag = ? COLLATE NOCASE
       ORDER BY from_filename`,
      [projectId, tag],
    )
    return rows.map((r) => r.from_filename)
  },

  getBacklinks: async (projectId, title) => {
    const target = title.trim()
    if (!target) return []
    const folder = await getVaultPathOrThrow(projectId)
    await ensureVaultIndex(projectId, folder)
    const db = await getDb()
    const rows = await db.select<
      Array<{ from_filename: string; snippet: string }>
    >(
      `SELECT from_filename, snippet
       FROM note_links
       WHERE project_id = ? AND to_title = ? COLLATE NOCASE
       ORDER BY from_filename`,
      [projectId, target],
    )
    const results: VaultBacklink[] = []
    for (const row of rows) {
      const sourceTitle = row.from_filename.replace(/\.md$/i, "")
      // Self-links are filtered at read time rather than write time so the
      // index stays authoritative even after a rename.
      if (sourceTitle.toLowerCase() === target.toLowerCase()) continue
      results.push({
        filename: row.from_filename,
        title: sourceTitle,
        snippet: row.snippet,
      })
    }
    return results
  },
}
