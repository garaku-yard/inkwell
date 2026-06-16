/**
 * Local vault-as-knowledge implementation. Embeds the in-scope notes of a
 * vault into `note_embeddings` (one row per chunk, keyed by the VAULT
 * project) and retrieves the closest chunks for an AI chat query via
 * brute-force cosine. The `project_knowledge` table maps a consuming
 * (non-vault) project to one or more vault scopes.
 *
 * The embedding model is loaded lazily by `@/lib/ai/embeddings`, so a vault
 * is only ever embedded once some project has wired it as knowledge — the
 * `indexNoteOnSave` guard short-circuits otherwise. This keeps the ~22MB
 * model out of the way for everyone who never touches the feature.
 */

import type {
  KnowledgeIndexStatus,
  KnowledgeScope,
  KnowledgeStorage,
  RetrievedChunk,
  ResolvedNote,
} from "@/lib/storage"
import { chunkNote } from "@/lib/vault/chunk"
import {
  deserializeVec,
  embed,
  embedOne,
  serializeVec,
} from "@/lib/ai/embeddings"
import { cosineTopK, type VectorRow } from "@/lib/ai/cosine"
import { getDb, now } from "./shared"
import { vault } from "./vault"

// ─── Helpers ──────────────────────────────────────────────────────────────

/** djb2 hash of a chunk's text, hex-encoded. Lets `indexNote` skip a note
 *  whose chunks are byte-for-byte unchanged since the last embed. */
function hashText(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16)
}

/** Strips a trailing `.md` to get a note's display title. */
function basenameTitle(filename: string): string {
  const lastSlash = filename.lastIndexOf("/")
  const name = lastSlash === -1 ? filename : filename.slice(lastSlash + 1)
  return name.replace(/\.md$/i, "")
}

interface EmbeddingRow {
  filename: string
  chunk_idx: number
  text: string
  vector: string
}

/** For a single vault, the set of in-scope filenames. `all` short-circuits
 *  the filename set when a whole-vault scope is present. */
interface VaultAllowance {
  all: boolean
  files: Set<string>
}

/** Resolves a project's scopes into per-vault filename allowances. Folder
 *  scopes include nested subfolders; tag scopes resolve through the vault's
 *  tag index. */
async function resolveAllowances(
  scopes: KnowledgeScope[],
): Promise<Map<string, VaultAllowance>> {
  const byVault = new Map<string, VaultAllowance>()
  const ensure = (vaultId: string): VaultAllowance => {
    let a = byVault.get(vaultId)
    if (!a) {
      a = { all: false, files: new Set<string>() }
      byVault.set(vaultId, a)
    }
    return a
  }

  for (const scope of scopes) {
    const allowance = ensure(scope.vaultProjectId)
    if (allowance.all) continue
    if (scope.scopeType === "vault") {
      allowance.all = true
      allowance.files.clear()
      continue
    }
    if (scope.scopeType === "folder") {
      const prefix = scope.scopeValue.replace(/\/+$/, "")
      const notes = await vault.listNotes(scope.vaultProjectId)
      for (const note of notes) {
        if (note.folder === prefix || note.folder.startsWith(`${prefix}/`)) {
          allowance.files.add(note.filename)
        }
      }
      continue
    }
    if (scope.scopeType === "tag") {
      const files = await vault.getNotesByTag(
        scope.vaultProjectId,
        scope.scopeValue,
      )
      for (const f of files) allowance.files.add(f)
    }
  }
  return byVault
}

/** Loads every embedding row for a vault, filtered to the allowed filenames
 *  (or all rows when the allowance is whole-vault). */
async function loadVectorRows(
  vaultProjectId: string,
  allowance: VaultAllowance,
): Promise<VectorRow<{ filename: string; text: string }>[]> {
  const db = await getDb()
  const rows = await db.select<EmbeddingRow[]>(
    "SELECT filename, chunk_idx, text, vector FROM note_embeddings WHERE project_id = ?",
    [vaultProjectId],
  )
  const out: VectorRow<{ filename: string; text: string }>[] = []
  for (const row of rows) {
    if (!allowance.all && !allowance.files.has(row.filename)) continue
    out.push({
      vector: deserializeVec(row.vector),
      payload: { filename: row.filename, text: row.text },
    })
  }
  return out
}

// ─── Index maintenance (called from the vault save path) ─────────────────

/** Whether any consuming project has wired this vault as knowledge. */
async function isVaultWired(vaultProjectId: string): Promise<boolean> {
  const db = await getDb()
  const rows = await db.select<Array<{ one: number }>>(
    "SELECT 1 AS one FROM project_knowledge WHERE vault_project_id = ? LIMIT 1",
    [vaultProjectId],
  )
  return rows.length > 0
}

/** Re-embeds a single note's chunks. Deletes the note's existing rows and
 *  re-inserts, unless the chunk set is byte-for-byte unchanged (hash match),
 *  in which case it's a cheap no-op. */
async function reindexNote(
  vaultProjectId: string,
  filename: string,
  content: string,
): Promise<void> {
  const db = await getDb()
  const chunks = chunkNote(content)

  const existing = await db.select<Array<{ chunk_idx: number; content_hash: string }>>(
    "SELECT chunk_idx, content_hash FROM note_embeddings WHERE project_id = ? AND filename = ? ORDER BY chunk_idx",
    [vaultProjectId, filename],
  )
  const unchanged =
    existing.length === chunks.length &&
    chunks.every((c, i) => existing[i]?.content_hash === hashText(c.text))
  if (unchanged) return

  await db.execute(
    "DELETE FROM note_embeddings WHERE project_id = ? AND filename = ?",
    [vaultProjectId, filename],
  )
  if (chunks.length === 0) return

  const vectors = await embed(chunks.map((c) => c.text))
  const ts = now()
  for (let i = 0; i < chunks.length; i++) {
    await db.execute(
      `INSERT OR REPLACE INTO note_embeddings
         (project_id, filename, chunk_idx, text, vector, content_hash, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        vaultProjectId,
        filename,
        chunks[i].idx,
        chunks[i].text,
        serializeVec(vectors[i]),
        hashText(chunks[i].text),
        ts,
      ],
    )
  }
}

/** Save-path hook: embed a note iff its vault is wired as knowledge. Safe to
 *  call fire-and-forget — it self-guards and never throws into the caller. */
export async function indexNoteOnSave(
  vaultProjectId: string,
  filename: string,
  content: string,
): Promise<void> {
  if (!(await isVaultWired(vaultProjectId))) return
  await reindexNote(vaultProjectId, filename, content)
}

/** Drops a note's embedding rows (note deleted/renamed away). */
export async function removeNoteFromIndex(
  vaultProjectId: string,
  filename: string,
): Promise<void> {
  const db = await getDb()
  await db.execute(
    "DELETE FROM note_embeddings WHERE project_id = ? AND filename = ?",
    [vaultProjectId, filename],
  )
}

/** Drops every embedding row under a deleted folder (prefix match). */
export async function removeNotesUnderFromIndex(
  vaultProjectId: string,
  folderRel: string,
): Promise<void> {
  const db = await getDb()
  await db.execute(
    "DELETE FROM note_embeddings WHERE project_id = ? AND (filename = ? OR filename LIKE ?)",
    [vaultProjectId, folderRel, `${folderRel}/%`],
  )
}

/** Re-points a renamed note's embedding rows at its new filename. Content is
 *  unchanged by a rename, so the vectors stay valid. */
export async function renameNoteInIndex(
  vaultProjectId: string,
  oldFilename: string,
  newFilename: string,
): Promise<void> {
  const db = await getDb()
  await db.execute(
    "UPDATE note_embeddings SET filename = ? WHERE project_id = ? AND filename = ?",
    [newFilename, vaultProjectId, oldFilename],
  )
}

// ─── Public Storage surface ──────────────────────────────────────────────

export const knowledge: KnowledgeStorage = {
  getScopes: async (projectId) => {
    const db = await getDb()
    const rows = await db.select<
      Array<{ vault_project_id: string; scope_type: string; scope_value: string }>
    >(
      "SELECT vault_project_id, scope_type, scope_value FROM project_knowledge WHERE project_id = ? ORDER BY vault_project_id, scope_type, scope_value",
      [projectId],
    )
    return rows.map((r) => ({
      vaultProjectId: r.vault_project_id,
      scopeType: r.scope_type as KnowledgeScope["scopeType"],
      scopeValue: r.scope_value,
    }))
  },

  setScopes: async (projectId, scopes) => {
    const db = await getDb()
    const ts = now()
    await db.execute("DELETE FROM project_knowledge WHERE project_id = ?", [
      projectId,
    ])
    for (const scope of scopes) {
      await db.execute(
        `INSERT OR REPLACE INTO project_knowledge
           (project_id, vault_project_id, scope_type, scope_value, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [projectId, scope.vaultProjectId, scope.scopeType, scope.scopeValue, ts],
      )
    }
  },

  hasScopes: async (projectId) => {
    const db = await getDb()
    const rows = await db.select<Array<{ one: number }>>(
      "SELECT 1 AS one FROM project_knowledge WHERE project_id = ? LIMIT 1",
      [projectId],
    )
    return rows.length > 0
  },

  buildIndex: async (vaultProjectId, onProgress) => {
    const notes = await vault.listNotes(vaultProjectId)
    const total = notes.length
    for (let i = 0; i < notes.length; i++) {
      try {
        const content = await vault.readNote(vaultProjectId, notes[i].filename)
        await reindexNote(vaultProjectId, notes[i].filename, content)
      } catch {
        // Skip unreadable notes; they just won't be retrievable.
      }
      onProgress?.({ done: i + 1, total })
    }
    return knowledge.getIndexStatus(vaultProjectId)
  },

  getIndexStatus: async (vaultProjectId) => {
    const db = await getDb()
    const rows = await db.select<Array<{ notes: number; chunks: number }>>(
      `SELECT COUNT(DISTINCT filename) AS notes, COUNT(*) AS chunks
       FROM note_embeddings WHERE project_id = ?`,
      [vaultProjectId],
    )
    const status: KnowledgeIndexStatus = {
      notes: rows[0]?.notes ?? 0,
      chunks: rows[0]?.chunks ?? 0,
    }
    return status
  },

  retrieve: async (projectId, queryText, k = 8) => {
    const query = queryText.trim()
    if (!query) return []
    const scopes = await knowledge.getScopes(projectId)
    if (scopes.length === 0) return []

    const allowances = await resolveAllowances(scopes)
    const rows: VectorRow<{ vaultProjectId: string; filename: string; text: string }>[] = []
    for (const [vaultProjectId, allowance] of allowances) {
      if (!allowance.all && allowance.files.size === 0) continue
      const vaultRows = await loadVectorRows(vaultProjectId, allowance)
      for (const r of vaultRows) {
        rows.push({ vector: r.vector, payload: { vaultProjectId, ...r.payload } })
      }
    }
    if (rows.length === 0) return []

    const queryVec = await embedOne(query)
    return cosineTopK(queryVec, rows, k).map<RetrievedChunk>((scored) => ({
      vaultProjectId: scored.payload.vaultProjectId,
      filename: scored.payload.filename,
      title: basenameTitle(scored.payload.filename),
      text: scored.payload.text,
      score: scored.score,
    }))
  },

  readNoteForTool: async (projectId, title) => {
    const wanted = title.trim().toLowerCase()
    if (!wanted) return null
    const scopes = await knowledge.getScopes(projectId)
    if (scopes.length === 0) return null

    const allowances = await resolveAllowances(scopes)
    for (const [vaultProjectId, allowance] of allowances) {
      const notes = await vault.listNotes(vaultProjectId)
      for (const note of notes) {
        if (!allowance.all && !allowance.files.has(note.filename)) continue
        if (basenameTitle(note.filename).toLowerCase() !== wanted) continue
        const content = await vault.readNote(vaultProjectId, note.filename)
        const resolved: ResolvedNote = {
          title: basenameTitle(note.filename),
          filename: note.filename,
          content,
        }
        return resolved
      }
    }
    return null
  },
}
