/**
 * The undo journal behind "recently changed by AI" (ADR 0027, stage 4 of 0025).
 *
 * Confirmation covers the case where the writer says no. It does nothing for the
 * case that actually costs words: the writer said yes and the model still wrote
 * the wrong thing. Every destructive tool already soft-deletes, so the rows the
 * writer wants back are sitting on disk with `deleted_at` set — this records
 * which rows each call touched so they can be put back without guessing.
 *
 * Undo is deliberately not itself a tool: an agent that has just done the wrong
 * thing is the wrong thing to depend on to reverse it.
 */

import type Database from "@tauri-apps/plugin-sql"

import { getDb, markDirty, now } from "../shared"
import type { ApprovalSource } from "./approval"

export interface UndoEntry {
  id: string
  projectId: string
  tool: string
  source: ApprovalSource
  summary: string
  createdAt: string
  undoneAt: string | null
}

interface UndoRow {
  id: string
  project_id: string
  tool: string
  source: string
  summary: string
  scene_ids: string
  restore_element_ids: string
  remove_element_ids: string
  created_at: string
  undone_at: string | null
}

export interface RecordUndoInput {
  projectId: string
  tool: string
  source: ApprovalSource
  summary: string
  /** Scenes whose `deleted_at` undo should clear. */
  sceneIds?: string[]
  /** Elements whose `deleted_at` undo should clear. */
  restoreElementIds?: string[]
  /** Elements undo should soft-delete — what the call created in place of what
   *  it removed. */
  removeElementIds?: string[]
}

function parseIds(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []
  } catch {
    return []
  }
}

function toEntry(row: UndoRow): UndoEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    tool: row.tool,
    source: row.source === "mcp" ? "mcp" : "chat",
    summary: row.summary,
    createdAt: row.created_at,
    undoneAt: row.undone_at,
  }
}

/** Records what one destructive call touched.
 *
 *  Never throws into the caller: a tool that succeeded must not be reported as
 *  failed because its journal entry didn't land. A missing entry costs the undo
 *  affordance, not the writing. */
export async function recordUndo(input: RecordUndoInput): Promise<void> {
  try {
    const db = await getDb()
    await db.execute(
      `INSERT INTO agent_undo
         (id, project_id, tool, source, summary,
          scene_ids, restore_element_ids, remove_element_ids, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        input.projectId,
        input.tool,
        input.source,
        input.summary,
        JSON.stringify(input.sceneIds ?? []),
        JSON.stringify(input.restoreElementIds ?? []),
        JSON.stringify(input.removeElementIds ?? []),
        now(),
      ],
    )
  } catch {
    // See the doc comment: the write already happened.
  }
}

/** The recent destructive calls for one project, newest first. */
export async function listUndo(projectId: string, limit = 20): Promise<UndoEntry[]> {
  const db = await getDb()
  const rows = await db.select<UndoRow[]>(
    `SELECT * FROM agent_undo WHERE project_id = ?
     ORDER BY created_at DESC LIMIT ?`,
    [projectId, limit],
  )
  return rows.map(toEntry)
}

async function clearDeleted(
  db: Database,
  table: "scenes" | "script_elements",
  entity: "scene" | "element",
  projectId: string,
  ids: string[],
  ts: string,
): Promise<void> {
  for (const id of ids) {
    // `table` comes from this function's own union type, never from user input.
    await db.execute(
      `UPDATE ${table} SET deleted_at = NULL, updated_at = ? WHERE id = ?`,
      [ts, id],
    )
    // The row is live again and differs from what the server holds, so it has to
    // push as an upsert — the original delete already went out as a tombstone.
    await markDirty(db, entity, projectId, id, "upsert")
  }
}

/** Reverses one journalled call: what it deleted comes back, what it created in
 *  place of that goes away.
 *
 *  Restores before removing, mirroring `rewrite_scene`'s own ordering — a
 *  failure part-way leaves the scene holding both versions rather than neither.
 *  Returns false when the entry is unknown or already undone. */
export async function undoEntry(id: string): Promise<boolean> {
  const db = await getDb()
  const rows = await db.select<UndoRow[]>("SELECT * FROM agent_undo WHERE id = ?", [id])
  const row = rows[0]
  if (!row || row.undone_at) return false

  const ts = now()
  await clearDeleted(db, "scenes", "scene", row.project_id, parseIds(row.scene_ids), ts)
  await clearDeleted(
    db,
    "script_elements",
    "element",
    row.project_id,
    parseIds(row.restore_element_ids),
    ts,
  )

  for (const elementId of parseIds(row.remove_element_ids)) {
    await db.execute(
      "UPDATE script_elements SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
      [ts, ts, elementId],
    )
    await markDirty(db, "element", row.project_id, elementId, "delete")
  }

  await db.execute("UPDATE agent_undo SET undone_at = ? WHERE id = ?", [ts, id])
  return true
}
