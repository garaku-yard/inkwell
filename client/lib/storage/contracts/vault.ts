// ─── Vault (Obsidian-style markdown, files-on-disk) ──────────────────────

/** A single markdown note inside a vault project. Notes are real `.md`
 *  files on the user's disk; the vault storage layer reads them on demand
 *  rather than caching the full text. */
export interface VaultNote {
  /** Relative path from the vault root, including `.md`. Use this as the
   *  stable key — two notes in different folders can share a title but
   *  never a full path. Examples: `"notes.md"`, `"projects/alpha/spec.md"`. */
  filename: string
  /** Absolute path to the note on disk. */
  path: string
  /** Basename without the `.md` extension, used as the display title. */
  title: string
  /** Relative parent folder within the vault. Empty string for
   *  vault-root notes, otherwise e.g. `"projects/alpha"`. */
  folder: string
  /** ISO 8601 timestamp of the last on-disk modification. */
  updatedAt: string
}

/** A note that links to the currently-open note via `[[Title]]`. The
 *  `snippet` is a short excerpt of the surrounding line for context. */
export interface VaultBacklink {
  filename: string
  title: string
  snippet: string
}

/** One node in the vault graph — one per `.md` file. `degree` is the
 *  total number of (resolved) links touching this note, used to size
 *  the circle when drawing. */
export interface VaultGraphNode {
  filename: string
  title: string
  degree: number
}

/** Undirected edge connecting two notes that reference each other via
 *  a `[[wikilink]]`. `from` / `to` are vault-relative filenames. */
export interface VaultGraphEdge {
  from: string
  to: string
}

export interface VaultGraph {
  nodes: VaultGraphNode[]
  edges: VaultGraphEdge[]
}

/** A tag and the number of notes that carry it. Tag casing is preserved
 *  from the first occurrence so the UI can show the user's preferred
 *  form (e.g. `Reading` not `reading`). */
export interface VaultTag {
  tag: string
  count: number
}

export interface VaultStorage {
  /** Attach a vault folder to an existing vault project. Idempotent — callers
   *  can re-run this to change the folder later. */
  openVault(projectId: string, folderPath: string): Promise<void>
  /** Returns the absolute vault path stored for the project, or null when
   *  the user hasn't chosen a folder yet. */
  getVaultPath(projectId: string): Promise<string | null>
  /** Lists every `.md` file in the vault recursively, sorted by relative
   *  path. `filename` on each entry is the vault-relative path. */
  listNotes(projectId: string): Promise<VaultNote[]>
  /** Reads the raw markdown content of a note. `filename` is the
   *  vault-relative path (possibly with folder segments). */
  readNote(projectId: string, filename: string): Promise<string>
  /** Writes raw markdown to a note, creating the file + any missing
   *  parent directories when needed. */
  writeNote(projectId: string, filename: string, content: string): Promise<void>
  /** Creates an empty note with the given title (`.md` added automatically).
   *  Optional `folder` places the note inside a subfolder (auto-created).
   *  Returns the created note record. Appends a counter when names collide. */
  createNote(projectId: string, title: string, folder?: string): Promise<VaultNote>
  /** Renames a note to `newTitle` (no `.md`), keeping its folder. Also
   *  rewrites every `[[oldTitle]]` and `[[oldTitle|alias]]` reference
   *  across the rest of the vault so links don't go stale. The alias
   *  portion is preserved. Rejects when the target filename already
   *  exists in the same folder. */
  renameNote(
    projectId: string,
    filename: string,
    newTitle: string,
  ): Promise<VaultNote>
  /** Deletes the note from disk. `filename` is the vault-relative path. */
  deleteNote(projectId: string, filename: string): Promise<void>
  /** Creates an empty subfolder inside the vault. `relPath` is relative
   *  to the vault root. Intermediate folders are created automatically. */
  createFolder(projectId: string, relPath: string): Promise<void>
  /** Deletes a subfolder and every note/subfolder underneath it. Use
   *  with care — the operation is irreversible. */
  deleteFolder(projectId: string, relPath: string): Promise<void>
  /** Scans every other note in the vault for `[[title]]` references and
   *  returns the matches. Case-insensitive by design so casual link
   *  authoring keeps working. Aliases (`[[title|alias]]`) match on title. */
  getBacklinks(projectId: string, title: string): Promise<VaultBacklink[]>
  /** Returns a graph of the vault: one node per `.md` file and one edge
   *  per resolvable `[[wikilink]]` between them. Phantom links (to
   *  non-existent notes) are dropped so the visualisation stays a pure
   *  notes-that-exist picture. Edges are de-duplicated undirected pairs. */
  getGraph(projectId: string): Promise<VaultGraph>
  /** Lists every tag used across the vault, with the number of notes
   *  that carry it. Sorted descending by count, then alphabetical. */
  listTags(projectId: string): Promise<VaultTag[]>
  /** Returns every note tagged with `tag` (case-insensitive). Filenames
   *  only — callers cross-reference against `listNotes()` to get full
   *  note records when needed. */
  getNotesByTag(projectId: string, tag: string): Promise<string[]>
  /** Re-reads a single note from disk and refreshes its row set in the
   *  backlinks index. Primarily used by the filesystem watcher when an
   *  external tool (vim, Obsidian, `git checkout`) writes into the vault.
   *  When the file no longer exists, the note's outbound rows are deleted
   *  instead — keeps ghost sources out of backlinks. */
  reindexLinks(projectId: string, filename: string): Promise<void>
  /** Reconciles the link / tag / embedding indexes against the notes that
   *  actually exist on disk, dropping every row whose source note is gone.
   *  reindexLinks keeps changed files honest, but some platforms emit no
   *  event for the old path of an external rename (a bare "create new" with
   *  no matching "delete old"), and renames that happen while the app is
   *  closed are never seen at all — both strand orphaned rows, embeddings
   *  especially (reindexLinks never touches them). This sweep clears them. */
  pruneOrphanedIndex(projectId: string): Promise<void>
}
