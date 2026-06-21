"use client"

import React, { useState, useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, Edit, Trash2, Check, RotateCcw } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { Scene, ProjectElement, Comment } from "@/services/project"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type ActiveScriptItem = (Scene & { isScene: true }) | (ProjectElement & { isScene: false })

interface CommentPanelProps {
  activeElement: ActiveScriptItem | null
  onAddComment: (elementId: string, isScene: boolean, content: string) => void
  onUpdateComment: (commentId: string, content: string) => void
  onDeleteComment: (commentId: string) => void
  onToggleCommentResolved: (elementId: string, commentId: string, isScene: boolean, newResolvedState: boolean) => void
}

export const CommentPanel = React.memo(
  ({ activeElement, onAddComment, onUpdateComment, onDeleteComment, onToggleCommentResolved }: CommentPanelProps) => {
    const [newCommentContent, setNewCommentContent] = useState("")
    const [editingComment, setEditingComment] = useState<{ id: string; content: string } | null>(null)
    const commentsEndRef = useRef<HTMLDivElement>(null)

    const comments = activeElement?.comments || []

    const handleAddComment = () => {
      if (newCommentContent.trim() && activeElement) {
        onAddComment(activeElement.id, activeElement.isScene, newCommentContent)
        setNewCommentContent("")
      }
    }

    const handleStartEdit = (comment: Comment) => {
      if (!comment.isResolved) {
        setEditingComment({ id: comment.id, content: comment.content })
      }
    }

    const handleCancelEdit = () => {
      setEditingComment(null)
    }

    const handleSaveEdit = () => {
      if (editingComment && editingComment.content.trim()) {
        onUpdateComment(editingComment.id, editingComment.content)
        setEditingComment(null)
      }
    }

    useEffect(() => {
      commentsEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [comments.length, activeElement?.id])

    const formatTimestamp = (isoString: string) => {
      const date = new Date(isoString)
      return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    }

    return (
      <Card className="h-full flex flex-col border-none shadow-none">
        <CardContent className="flex-1 flex flex-col px-4 pt-4 pb-2">
          {!activeElement ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-center">
              Select a scene or element to view comments.
            </div>
          ) : (
            <>
              <div className="mb-4 text-sm text-muted-foreground truncate">
                Comments for:{" "}
                <span className="font-medium text-foreground">
                  {activeElement.isScene ? activeElement.scene_heading : activeElement.content.substring(0, 50) + "..."}
                </span>
              </div>
              <ScrollArea className="flex-1 pr-4 -mr-4">
                <div className="space-y-4">
                  {comments.length === 0 ? (
                    <div className="text-muted-foreground text-sm text-center py-4">No comments yet. Be the first!</div>
                  ) : (
                    comments.map((comment) => (
                      <div
                        key={comment.id}
                        className={cn(
                          "p-3 rounded-lg border relative",
                          comment.isResolved
                            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-muted-foreground opacity-70 pointer-events-none"
                            : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-600",
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div className="text-xs text-muted-foreground mb-2">
                            <span className="font-semibold text-foreground">{comment.userName}</span>
                            <span className="mx-1.5">&middot;</span>
                            <span>{formatTimestamp(comment.timestamp)}</span>
                          </div>
                          <div className="flex items-center gap-1 -mt-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-6 w-6",
                                comment.isResolved ? "text-green-600 pointer-events-auto" : "text-gray-500",
                              )}
                              onClick={() => {
                                if (activeElement) {
                                  const newResolvedState = !comment.isResolved;
                                  onToggleCommentResolved(activeElement.id, comment.id, activeElement.isScene, newResolvedState);
                                }
                              }}
                              title={comment.isResolved ? "Reopen comment" : "Mark as resolved"}
                            >
                              {comment.isResolved ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                            </Button>
                            {!comment.isResolved && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => handleStartEdit(comment)}
                                    disabled={comment.isResolved}
                                  >
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => onDeleteComment(comment.id)}
                                    className="text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>

                        {editingComment?.id === comment.id && !comment.isResolved ? (
                          <div className="space-y-2 pointer-events-auto">
                            <Textarea
                              value={editingComment.content}
                              onChange={(e) => setEditingComment({ ...editingComment, content: e.target.value })}
                              className="text-sm"
                              rows={3}
                              autoFocus
                            />
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                                Cancel
                              </Button>
                              <Button size="sm" onClick={handleSaveEdit}>
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p
                            className={cn(
                              "text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap",
                              comment.isResolved && "line-through",
                            )}
                          >
                            {comment.content}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={commentsEndRef} />
                </div>
              </ScrollArea>
              <div className="mt-4 flex gap-2 flex-shrink-0">
                <Input
                  placeholder="Add a comment..."
                  value={newCommentContent}
                  onChange={(e) => setNewCommentContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleAddComment()
                    }
                  }}
                  className="flex-1"
                />
                <Button onClick={handleAddComment}>Post</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    )
  },
)

CommentPanel.displayName = "CommentPanel"
