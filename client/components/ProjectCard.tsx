"use client"

import { Clock, MoreHorizontal, Star, UserPlus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { CardSyncToggle } from "@/components/sync/CardSyncToggle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { Project } from "@/services/project"

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (diffInSeconds < 60) return "Just now"
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  return date.toLocaleDateString()
}

const CATEGORY_META: Record<string, { label: string; accent: string }> = {
  screenplay:          { label: "Screenplay",         accent: "bg-amber-400" },
  novel:               { label: "Novel",              accent: "bg-emerald-500" },
  poetry:              { label: "Poetry",             accent: "bg-violet-500" },
  lyrics:              { label: "Lyrics",             accent: "bg-rose-400" },
  comic:               { label: "Comic",              accent: "bg-orange-400" },
  interactive_fiction: { label: "Interactive Fiction",accent: "bg-cyan-500" },
  ttrpg:               { label: "TTRPG",              accent: "bg-red-500" },
  vault:               { label: "Vault",              accent: "bg-slate-400" },
  board:               { label: "Board",              accent: "bg-sky-500" },
}

const DEFAULT_META = { label: "Project", accent: "bg-primary" }

interface ProjectCardProps {
  project: Project & { collaborator_count?: number }
  userId: string
  onStar: (id: string, e: React.MouseEvent) => void
  onManageCollaborators: (id: string, title: string) => void
  onDelete: (id: string, title: string) => void
  onRename: (id: string, title: string, description: string) => void
  /** Archive / restore. The card decides which label to show based
   *  on the project's current status. Optional — the /shared page
   *  doesn't need it because only owners see the archive action. */
  onArchive?: (id: string, archived: boolean) => void
  onClick: (id: string) => void
}

export function ProjectCard({
  project,
  userId,
  onStar,
  onManageCollaborators,
  onDelete,
  onRename,
  onArchive,
  onClick,
}: ProjectCardProps) {
  const isArchived = project.status === "archived"
  const meta = CATEGORY_META[project.category] ?? DEFAULT_META
  const isOwner = project.owner_id === userId

  return (
    <Card
      className="group overflow-hidden cursor-pointer flex flex-col transition-shadow duration-200 hover:shadow-md"
      onClick={() => onClick(project.id)}
    >
      {/* Category accent strip */}
      <div className={cn("h-1 w-full shrink-0", meta.accent)} />

      <CardContent className="p-4 flex-grow">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Category + shared badges */}
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {meta.label}
              </span>
              {/* "Shared" whenever the project spans more than its owner: a
                  collaborator viewing it (!isOwner), or the owner who has
                  invited collaborators (collaborator_count > 0). */}
              {(!isOwner || (project.collaborator_count ?? 0) > 0) && (
                <Badge variant="secondary" className="text-xs h-4 px-1.5 flex items-center gap-1">
                  <Users className="h-2.5 w-2.5" />
                  Shared
                </Badge>
              )}
            </div>

            <h3 className="font-semibold text-base leading-snug truncate group-hover:text-primary transition-colors">
              {project.title}
            </h3>

            {project.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {project.description}
              </p>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onManageCollaborators(project.id, project.title) }}
              >
                <Users className="mr-2 h-4 w-4" />
                {isOwner ? "Manage Collaborators" : "View Collaborators"}
              </DropdownMenuItem>
              {isOwner && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => { e.stopPropagation(); onRename(project.id, project.title, project.description || "") }}
                  >
                    Edit
                  </DropdownMenuItem>
                  {onArchive && (
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); onArchive(project.id, !isArchived) }}
                    >
                      {isArchived ? "Restore from archive" : "Archive"}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={(e) => { e.stopPropagation(); onDelete(project.id, project.title) }}
                    className="text-destructive focus:text-destructive"
                  >
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>

      <CardFooter className="px-4 pb-3 pt-0 flex justify-between items-center">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatRelativeTime(project.updated_at)}
        </div>

        <div className="flex items-center gap-1">
          {project.collaborator_count !== undefined && project.collaborator_count > 1 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
              <Users className="h-3 w-3" />
              {project.collaborator_count}
            </div>
          )}

          {isOwner && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); onManageCollaborators(project.id, project.title) }}
              title="Add Collaborator"
            >
              <UserPlus className="h-3.5 w-3.5 text-muted-foreground hover:text-primary transition-colors" />
            </Button>
          )}

          <CardSyncToggle projectId={project.id} />

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => { e.stopPropagation(); onStar(project.id, e) }}
          >
            <Star
              className={cn(
                "h-3.5 w-3.5 transition-colors",
                project.is_starred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-yellow-400",
              )}
            />
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
