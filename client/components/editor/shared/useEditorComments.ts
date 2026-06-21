"use client"

import { useCallback, useEffect, useState } from "react"

import {
  addComment as addCommentSvc,
  deleteComment as deleteCommentSvc,
  getComments,
  toggleCommentResolved as toggleCommentResolvedSvc,
  updateComment as updateCommentSvc,
  type Comment,
} from "@/services/project"

/**
 * useEditorComments — shared comment state + handlers for the format editors.
 *
 * Comments are generic at the storage layer (they key on a target element/scene
 * id), so every editor can carry them, not just the screenplay. This hook loads
 * the project's comments once, exposes the list, and wraps the add / update /
 * delete / resolve service calls so each one refreshes afterwards. The handler
 * signatures match {@link CommentPanel}'s props verbatim so it drops straight in.
 *
 * @param projectId - The project whose comments to manage.
 */
export function useEditorComments(projectId: string) {
  const [comments, setComments] = useState<Comment[]>([])

  const reloadComments = useCallback(async () => {
    try {
      setComments(await getComments(projectId))
    } catch (err) {
      // Collaboration may be unavailable (e.g. a desktop build with no hosted
      // backend); degrade to an empty list rather than breaking the editor.
      console.error("Failed to load comments:", err)
      setComments([])
    }
  }, [projectId])

  useEffect(() => {
    void reloadComments()
  }, [reloadComments])

  const onAddComment = useCallback(
    async (elementId: string, isScene: boolean, content: string) => {
      if (!content.trim()) return
      try {
        await addCommentSvc(
          projectId,
          projectId,
          content,
          0,
          isScene ? undefined : elementId,
          isScene ? elementId : undefined,
          undefined,
        )
        await reloadComments()
      } catch (err) {
        console.error("Failed to add comment:", err)
      }
    },
    [projectId, reloadComments],
  )

  const onUpdateComment = useCallback(
    async (commentId: string, content: string) => {
      try {
        await updateCommentSvc(commentId, content)
        await reloadComments()
      } catch (err) {
        console.error("Failed to update comment:", err)
      }
    },
    [reloadComments],
  )

  const onDeleteComment = useCallback(
    async (commentId: string) => {
      try {
        await deleteCommentSvc(commentId)
        await reloadComments()
      } catch (err) {
        console.error("Failed to delete comment:", err)
      }
    },
    [reloadComments],
  )

  const onToggleCommentResolved = useCallback(
    async (_elementId: string, commentId: string, _isScene: boolean, newResolvedState: boolean) => {
      try {
        await toggleCommentResolvedSvc(commentId, newResolvedState)
        await reloadComments()
      } catch (err) {
        console.error("Failed to toggle comment resolved status:", err)
      }
    },
    [reloadComments],
  )

  return {
    comments,
    onAddComment,
    onUpdateComment,
    onDeleteComment,
    onToggleCommentResolved,
    reloadComments,
  }
}
