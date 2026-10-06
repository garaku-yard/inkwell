/** Offline comment queue for synced desktop projects. The collaboration service
 * owns comments, so this runs after the project-row round trip has created the
 * referenced scenes and elements on the server. */
import { apiClient, ApiError } from "@/lib/api"
import { getDb, now } from "./shared"

interface LocalComment {
  id: string
  project_id: string
  target_id: string
  is_scene: number
  content: string
  is_resolved: number
  resolution_dirty: number
  sync_status: "pending_create" | "pending_update" | "pending_delete" | "synced"
  revision: number
  line_number: number
  parent_id: string | null
}

interface HostedComment {
  id: string
  project_id: string
  script_element_id?: string | null
  scene_id?: string | null
  parent_id?: string | null
  line_number?: number
  user_id: string
  username: string
  content: string
  is_resolved: boolean
  created_at: string
  updated_at: string
}

const pageSize = 100

async function pushComment(row: LocalComment): Promise<void> {
  const db = await getDb()
  const endpoint = `comments/${encodeURIComponent(row.id)}`
  if (row.sync_status === "pending_create") {
    const created = await apiClient<HostedComment>("comments", { method: "POST", body: {
      client_comment_id: row.id,
      project_id: row.project_id,
      screenplay_id: row.project_id,
      content: row.content,
      line_number: row.line_number,
      script_element_id: row.target_id === row.project_id || row.is_scene ? undefined : row.target_id,
      scene_id: row.is_scene ? row.target_id : undefined,
      parent_id: row.parent_id ?? undefined,
    } })
    if (created.id !== row.id) throw new Error("Hosted comment service did not preserve the desktop comment ID")
    // A concurrent edit or delete advances revision; its state must survive.
    await db.execute(
      `UPDATE local_comments SET author_id = ?, user_name = ?, sync_status = 'pending_update'
       WHERE id = ? AND revision = ? AND sync_status = 'pending_create'`,
      [created.user_id, created.username || "You", row.id, row.revision],
    )
    // POST may have committed before its response was lost. PATCH the current
    // local body so a retry after an offline edit never restores stale text.
    await apiClient(endpoint, { method: "PATCH", body: {
      content: row.content, ...(row.resolution_dirty ? { is_resolved: !!row.is_resolved } : {}),
    } })
    await db.execute(
      "UPDATE local_comments SET sync_status = 'synced', resolution_dirty = 0 WHERE id = ? AND revision = ? AND sync_status = 'pending_update'",
      [row.id, row.revision],
    )
    return
  }
  if (row.sync_status === "pending_update") {
    await apiClient(endpoint, { method: "PATCH", body: {
      content: row.content, ...(row.resolution_dirty ? { is_resolved: !!row.is_resolved } : {}),
    } })
    await db.execute(
      "UPDATE local_comments SET sync_status = 'synced', resolution_dirty = 0 WHERE id = ? AND revision = ? AND sync_status = 'pending_update'",
      [row.id, row.revision],
    )
    return
  }
  if (row.sync_status === "pending_delete") {
    try {
      await apiClient(endpoint, { method: "DELETE" })
    } catch (error) {
      // An offline create deleted before upload, or a retry after a successful
      // delete, has no hosted row. Both are already in the desired state.
      if (!(error instanceof ApiError && error.status === 404)) throw error
    }
    await db.execute("DELETE FROM local_comments WHERE id = ? AND revision = ? AND sync_status = 'pending_delete'", [row.id, row.revision])
  }
}

async function pullComments(projectId: string): Promise<void> {
  const db = await getDb()
  const remote: HostedComment[] = []
  const seen = new Set<string>()
  for (let offset = 0; ; offset += pageSize) {
    const page = await apiClient<HostedComment[]>(
      `comments?screenplay_id=${encodeURIComponent(projectId)}&offset=${offset}`,
      { method: "GET" },
    )
    for (const comment of page) {
      if (seen.has(comment.id)) throw new Error("Hosted comment pagination repeated a row")
      seen.add(comment.id)
      remote.push(comment)
    }
    if (page.length < pageSize) break
  }

  const remoteIds = new Set<string>()
  for (const comment of remote) {
    if (comment.project_id !== projectId) throw new Error("Comment response belongs to another project")
    remoteIds.add(comment.id)
    const targetId = comment.script_element_id || comment.scene_id || projectId
    await db.execute(
      `INSERT INTO local_comments
       (id, project_id, target_id, is_scene, user_name, author_id, content, is_resolved, created_at, updated_at, line_number, parent_id, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
       ON CONFLICT(id) DO UPDATE SET target_id = excluded.target_id, is_scene = excluded.is_scene,
       user_name = excluded.user_name, author_id = excluded.author_id, content = excluded.content,
       is_resolved = excluded.is_resolved, updated_at = excluded.updated_at,
       line_number = excluded.line_number, parent_id = excluded.parent_id
       WHERE local_comments.sync_status = 'synced'`,
      [comment.id, projectId, targetId, comment.scene_id ? 1 : 0, comment.username || "User", comment.user_id,
        comment.content, comment.is_resolved ? 1 : 0, comment.created_at, comment.updated_at || now(),
        comment.line_number ?? 0, comment.parent_id ?? null],
    )
  }
  // The hosted API deletes comments outright. Reconcile only rows previously
  // confirmed there; pending local changes cannot be inferred from absence.
  const synced = await db.select<Array<{ id: string }>>(
    "SELECT id FROM local_comments WHERE project_id = ? AND sync_status = 'synced'", [projectId],
  )
  for (const row of synced) if (!remoteIds.has(row.id)) {
    await db.execute("DELETE FROM local_comments WHERE id = ? AND sync_status = 'synced'", [row.id])
  }
}

/** Pushes queued comments, then reconciles the complete hosted comment list. */
export async function syncProjectComments(projectId: string): Promise<void> {
  const db = await getDb()
  const account = await apiClient<{ user: { id: string } }>("users/me", { method: "GET" })
  const state = await db.select<Array<{ comment_account_id: string | null }>>(
    "SELECT comment_account_id FROM sync_state WHERE project_id = ?", [projectId],
  )
  const switchingAccount = !!state[0]?.comment_account_id && state[0].comment_account_id !== account.user.id
  if (switchingAccount) {
    const unsent = await db.select<Array<{ id: string }>>(
      "SELECT id FROM local_comments WHERE project_id = ? AND sync_status != 'synced' LIMIT 1", [projectId],
    )
    if (unsent.length) throw new Error("This project has unsent comments from another account")
  }
  if (!switchingAccount) {
    await db.execute("UPDATE sync_state SET comment_account_id = ? WHERE project_id = ?", [account.user.id, projectId])
  }

  const pending = await db.select<LocalComment[]>(
    "SELECT * FROM local_comments WHERE project_id = ? AND sync_status != 'synced' ORDER BY created_at, id", [projectId],
  )
  for (const row of pending) await pushComment(row)
  await pullComments(projectId)
  if (switchingAccount) {
    await db.execute("UPDATE sync_state SET comment_account_id = ? WHERE project_id = ?", [account.user.id, projectId])
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("inkwell-comments-synced", { detail: { projectId } }))
  }
}
