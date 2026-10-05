import {
  getDb,
  markDirty,
  now,
  softDeleteProjectChildren,
  SYNCED_PROJECT_CHILD_TABLES,
  toWorkspace,
  type WorkspaceRow,
} from "./shared"

const RECOVERY_DAYS = 30
export const WORKSPACE_PROJECT_RECOVERY_MS = RECOVERY_DAYS * 24 * 60 * 60 * 1000

interface PersonalProjectRow {
  id: string
  category: string
  workspace_removed_at: string | null
}

interface ExpiredProjectRow {
  id: string
  enabled: number
}

/** Removes app-owned rows. The user's external vault folder is never deleted. */
export async function purgeWorkspaceProject(projectId: string): Promise<void> {
  const db = await getDb()
  await db.execute("DELETE FROM project_knowledge WHERE project_id = ? OR vault_project_id = ?", [projectId, projectId])
  for (const { table } of [...SYNCED_PROJECT_CHILD_TABLES].reverse()) {
    await db.execute(`DELETE FROM ${table} WHERE project_id = ?`, [projectId])
  }
  for (const table of [
    "local_comments", "agent_undo", "note_embeddings", "note_links", "note_tags", "sync_outbox", "sync_state",
    "vault_manifest", "drive_backup", "drive_project", "drive_folder", "drive_selection",
  ]) {
    await db.execute(`DELETE FROM ${table} WHERE project_id = ?`, [projectId])
  }
  await db.execute("DELETE FROM projects WHERE id = ?", [projectId])
}

async function expireWorkspaceProject(projectId: string, timestamp: string): Promise<boolean> {
  const db = await getDb()
  const syncRows = await db.select<Array<{ enabled: number }>>(
    "SELECT enabled FROM sync_state WHERE project_id = ?",
    [projectId],
  )
  await db.execute(
    "UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    [timestamp, timestamp, projectId],
  )
  await markDirty(db, "project", projectId, projectId, "delete")
  await softDeleteProjectChildren(db, projectId, timestamp)
  if (syncRows[0]?.enabled === 1) return true
  await purgeWorkspaceProject(projectId)
  return false
}

/** Reconcile the local format-workspace membership. Removing the last personal
 * workspace for a format hides its projects without deleting or syncing them.
 * A new workspace for the same format does not undo that deletion: only an
 * explicit recovery action may clear workspace_removed_at. Expired local
 * projects are purged; synced ones become tombstones and are purged after sync
 * confirms the deletion. Returns expired synced IDs for a best-effort sync
 * attempt. */
async function reconcile(): Promise<string[]> {
  const db = await getDb()
  const timestamp = now()
  const cutoff = new Date(Date.parse(timestamp) - WORKSPACE_PROJECT_RECOVERY_MS).toISOString()
  const workspaceRows = await db.select<WorkspaceRow[]>(
    "SELECT * FROM workspaces WHERE type = 'personal'",
  )
  const workspaceCategories = workspaceRows.map((row) => toWorkspace(row).categories)
  const coversEveryCategory = workspaceCategories.some((categories) => categories.length === 0)
  const coveredCategories = new Set(workspaceCategories.flatMap((categories) => categories.map((category) => category.slug)))
  const projectRows = await db.select<PersonalProjectRow[]>(
    "SELECT id, category, workspace_removed_at FROM projects WHERE org_id IS NULL AND deleted_at IS NULL",
  )
  const expiredSyncedIds = new Set<string>()

  for (const project of projectRows) {
    const removedAt = project.workspace_removed_at
    if (removedAt && removedAt <= cutoff) {
      if (await expireWorkspaceProject(project.id, timestamp)) expiredSyncedIds.add(project.id)
    } else if (!removedAt && !coversEveryCategory && !coveredCategories.has(project.category)) {
      await db.execute(
        "UPDATE projects SET workspace_removed_at = ? WHERE id = ? AND workspace_removed_at IS NULL",
        [timestamp, project.id],
      )
    }
  }
  // A prior expiry may have happened while offline. Retry its tombstone on the
  // next launch; otherwise a hidden synced project could remain on disk forever.
  const previouslyExpired = await db.select<ExpiredProjectRow[]>(
    `SELECT p.id, COALESCE(ss.enabled, 0) AS enabled
     FROM projects p LEFT JOIN sync_state ss ON ss.project_id = p.id
     WHERE p.workspace_removed_at IS NOT NULL AND p.workspace_removed_at <= ?
       AND p.deleted_at IS NOT NULL`,
    [cutoff],
  )
  for (const project of previouslyExpired) {
    if (project.enabled === 1) expiredSyncedIds.add(project.id)
    else await purgeWorkspaceProject(project.id)
  }
  return [...expiredSyncedIds]
}

let pendingReconciliation: Promise<string[]> | null = null

export function reconcileWorkspaceProjects(): Promise<string[]> {
  if (!pendingReconciliation) {
    pendingReconciliation = reconcile().finally(() => { pendingReconciliation = null })
  }
  return pendingReconciliation
}
