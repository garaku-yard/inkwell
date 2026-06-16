// ─── Knowledge (vault-as-knowledge RAG for non-vault projects) ───────────

/** How a knowledge scope selects notes from its source vault.
 *  - `vault`  — every note in the vault (`scopeValue` is `""`).
 *  - `folder` — notes under a relative folder, nested ones included.
 *  - `tag`    — notes carrying a `#tag` (`scopeValue` is the tag text). */
export type KnowledgeScopeType = "vault" | "folder" | "tag"

/** One wired knowledge source: a slice of `vaultProjectId` that a consuming
 *  (non-vault) project draws on for AI chat context. A project may wire
 *  several. */
export interface KnowledgeScope {
  /** The vault project supplying the notes. */
  vaultProjectId: string
  scopeType: KnowledgeScopeType
  /** Folder path or tag text; empty string for a whole-vault scope. */
  scopeValue: string
}

/** Coverage of a vault's embedding index, for the settings UI. */
export interface KnowledgeIndexStatus {
  /** Distinct notes with at least one embedded chunk. */
  notes: number
  /** Total embedded chunks across those notes. */
  chunks: number
}

/** Progress callback payload while (re)building a vault's index. */
export interface IndexProgress {
  done: number
  total: number
}

/** A chunk surfaced by retrieval, with its source note and similarity. */
export interface RetrievedChunk {
  vaultProjectId: string
  /** Vault-relative `.md` filename the chunk came from. */
  filename: string
  /** Note basename (no `.md`), used as a citation label and `read_note` key. */
  title: string
  /** The chunk text to fold into the prompt. */
  text: string
  /** Cosine similarity to the query (higher is closer). */
  score: number
}

/** The full body of a note resolved through the `read_note` tool, scoped to
 *  the consuming project's wired knowledge so the model can't read arbitrary
 *  files. */
export interface ResolvedNote {
  title: string
  filename: string
  content: string
}

/** Vault-as-knowledge storage. Desktop-only: the remote build no-ops every
 *  method so web callers degrade to plain chat with no retrieval. */
export interface KnowledgeStorage {
  /** Returns the knowledge scopes wired to a consuming project. */
  getScopes(projectId: string): Promise<KnowledgeScope[]>
  /** Replaces a consuming project's scopes wholesale. */
  setScopes(projectId: string, scopes: KnowledgeScope[]): Promise<void>
  /** Cheap probe: does this project have any knowledge wired? Used by the
   *  chat path to decide whether to retrieve + offer the `read_note` tool. */
  hasScopes(projectId: string): Promise<boolean>
  /** Embeds every in-scope note of a vault, reporting progress. Returns the
   *  resulting index coverage. */
  buildIndex(
    vaultProjectId: string,
    onProgress?: (p: IndexProgress) => void,
  ): Promise<KnowledgeIndexStatus>
  /** Returns the current embedding coverage for a vault. */
  getIndexStatus(vaultProjectId: string): Promise<KnowledgeIndexStatus>
  /** Embeds the query, ranks every in-scope chunk by cosine similarity, and
   *  returns the top `k` (default 8). Empty when no scopes are wired. */
  retrieve(
    projectId: string,
    queryText: string,
    k?: number,
  ): Promise<RetrievedChunk[]>
  /** Resolves a note title to its full body, but only within the project's
   *  wired scopes. Returns null when no in-scope note matches. Backs the
   *  `read_note(title)` chat tool. */
  readNoteForTool(projectId: string, title: string): Promise<ResolvedNote | null>
}
