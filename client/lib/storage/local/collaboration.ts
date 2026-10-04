import type { CollaborationStorage } from "@/lib/storage"
import type { Comment } from "@/services/project"
import { getDb, newId, now, reject } from "./shared"

interface CommentRow {
  id: string
  target_id: string
  is_scene: number
  user_name: string
  content: string
  is_resolved: number
  created_at: string
  project_id: string
  author_id: string | null
  sync_status: "pending_create" | "pending_update" | "pending_delete" | "synced"
}

const toComment = (row: CommentRow, accountId?: string | null): Comment => ({
  id: row.id, elementId: row.target_id, isScene: !!row.is_scene,
  userName: row.user_name, content: row.content,
  isResolved: !!row.is_resolved, timestamp: row.created_at,
  ...(accountId !== undefined ? { canEdit: !row.author_id || row.author_id === accountId } : {}),
})

async function requireCommentTarget(projectId: string, sceneId?: string, elementId?: string): Promise<void> {
  const db = await getDb()
  if (sceneId && elementId) throw new Error("Choose one comment target")
  if (sceneId) {
    const rows = await db.select<{ id: string }[]>(
      "SELECT id FROM scenes WHERE id = ? AND project_id = ? AND deleted_at IS NULL", [sceneId, projectId],
    )
    if (!rows[0]) throw new Error("Comment section is not in this project")
  }
  if (elementId) {
    const rows = await db.select<{ id: string }[]>(
      "SELECT id FROM script_elements WHERE id = ? AND project_id = ? AND deleted_at IS NULL", [elementId, projectId],
    )
    if (!rows[0]) throw new Error("Comment element is not in this project")
  }
}

async function requireEditableComment(commentId: string): Promise<CommentRow> {
  const db = await getDb()
  const rows = await db.select<CommentRow[]>("SELECT * FROM local_comments WHERE id = ? AND sync_status != 'pending_delete'", [commentId])
  const row = rows[0]
  if (!row) throw new Error("Comment not found")
  if (row.author_id) {
    const state = await db.select<Array<{ comment_account_id: string | null }>>(
      "SELECT comment_account_id FROM sync_state WHERE project_id = ?", [row.project_id],
    )
    if (row.author_id !== state[0]?.comment_account_id) throw new Error("Only the comment author can edit this desktop copy")
  }
  return row
}

// ─── Desktop collaboration: comments are local-first and synced separately ────

export const collaboration: CollaborationStorage = {
  addCollaborator: () => reject("collaboration"),
  listCollaborators: async () => [],
  getEditSessions: async () => [],
  updateCollaboratorRole: () => reject("collaboration"),
  removeCollaborator: () => reject("collaboration"),
  addComment: async (input) => {
    const db = await getDb()
    await requireCommentTarget(input.projectId, input.sceneId, input.scriptElementId)
    const id = newId()
    const ts = now()
    const targetId = input.scriptElementId || input.sceneId || input.projectId
    await db.execute(
      "INSERT INTO local_comments (id, project_id, target_id, is_scene, content, created_at, updated_at, line_number, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, input.projectId, targetId, input.sceneId ? 1 : 0, input.content, ts, ts, input.lineNumber, input.parentId ?? null],
    )
    const rows = await db.select<CommentRow[]>("SELECT * FROM local_comments WHERE id = ?", [id])
    return toComment(rows[0])
  },
  listComments: async (projectId) => {
    const db = await getDb()
    const rows = await db.select<CommentRow[]>(
      "SELECT * FROM local_comments WHERE project_id = ? AND sync_status != 'pending_delete' ORDER BY created_at, id", [projectId],
    )
    const state = await db.select<Array<{ comment_account_id: string | null }>>(
      "SELECT comment_account_id FROM sync_state WHERE project_id = ?", [projectId],
    )
    return rows.map(row => toComment(row, state[0]?.comment_account_id ?? null))
  },
  updateComment: async (commentId, patch) => {
    const db = await getDb()
    await requireEditableComment(commentId)
    if (patch.content !== undefined || patch.isResolved !== undefined) await db.execute(
      `UPDATE local_comments SET content = COALESCE(?, content), is_resolved = COALESCE(?, is_resolved),
       updated_at = ?, revision = revision + 1,
       resolution_dirty = CASE WHEN ? THEN 1 ELSE resolution_dirty END,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN sync_status ELSE 'pending_update' END WHERE id = ?`,
      [patch.content ?? null, patch.isResolved === undefined ? null : patch.isResolved ? 1 : 0,
        now(), patch.isResolved === undefined ? 0 : 1, commentId],
    )
    const rows = await db.select<CommentRow[]>("SELECT * FROM local_comments WHERE id = ?", [commentId])
    if (!rows[0]) throw new Error("Comment not found")
    return toComment(rows[0])
  },
  deleteComment: async (commentId) => {
    await requireEditableComment(commentId)
    const db = await getDb()
    await db.execute("UPDATE local_comments SET sync_status = 'pending_delete', revision = revision + 1, updated_at = ? WHERE id = ?", [now(), commentId])
  },
  listMembers: async () => [],
  inviteMember: () => reject("collaboration"),
  removeMember: () => reject("collaboration"),
  updateMemberRole: () => reject("collaboration"),
  acceptWorkspaceInvite: () => reject("collaboration"),
  declineWorkspaceInvite: () => reject("collaboration"),
  listPendingInvitations: async () => [],
  acceptInvitation: () => reject("collaboration"),
  declineInvitation: () => reject("collaboration"),
}
