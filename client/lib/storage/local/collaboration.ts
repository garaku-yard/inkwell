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
}

const toComment = (row: CommentRow): Comment => ({
  id: row.id, elementId: row.target_id, isScene: !!row.is_scene,
  userName: row.user_name, content: row.content,
  isResolved: !!row.is_resolved, timestamp: row.created_at,
})

// ─── Desktop collaboration: comments are local, other features hosted ────

export const collaboration: CollaborationStorage = {
  addCollaborator: () => reject("collaboration"),
  listCollaborators: async () => [],
  getEditSessions: async () => [],
  updateCollaboratorRole: () => reject("collaboration"),
  removeCollaborator: () => reject("collaboration"),
  addComment: async (input) => {
    const db = await getDb()
    const id = newId()
    const ts = now()
    const targetId = input.scriptElementId || input.sceneId || input.projectId
    await db.execute(
      "INSERT INTO local_comments (id, project_id, target_id, is_scene, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, input.projectId, targetId, input.sceneId ? 1 : 0, input.content, ts, ts],
    )
    const rows = await db.select<CommentRow[]>("SELECT * FROM local_comments WHERE id = ?", [id])
    return toComment(rows[0])
  },
  listComments: async (projectId) => {
    const rows = await (await getDb()).select<CommentRow[]>(
      "SELECT * FROM local_comments WHERE project_id = ? ORDER BY created_at, id", [projectId],
    )
    return rows.map(toComment)
  },
  updateComment: async (commentId, patch) => {
    const db = await getDb()
    if (patch.content !== undefined) await db.execute("UPDATE local_comments SET content = ?, updated_at = ? WHERE id = ?", [patch.content, now(), commentId])
    if (patch.isResolved !== undefined) await db.execute("UPDATE local_comments SET is_resolved = ?, updated_at = ? WHERE id = ?", [patch.isResolved ? 1 : 0, now(), commentId])
    const rows = await db.select<CommentRow[]>("SELECT * FROM local_comments WHERE id = ?", [commentId])
    if (!rows[0]) throw new Error("Comment not found")
    return toComment(rows[0])
  },
  deleteComment: async (commentId) => {
    await (await getDb()).execute("DELETE FROM local_comments WHERE id = ?", [commentId])
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
