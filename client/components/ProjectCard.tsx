"use client"

import { Clock, MoreHorizontal, Star, UserPlus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
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
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
  return date.toLocaleDateString()
}

interface ProjectCardProps {
  project: Project & { collaborator_count?: number }
  userId: string
  onStar: (id: string, e: React.MouseEvent) => void
  onManageCollaborators: (id: string, title: string) => void
  onDelete: (id: string, title: string) => void
  onRename: (id: string, title: string, description: string) => void
  onClick: (id: string) => void
}

export function ProjectCard({
  project,
  userId,
  onStar,
  onManageCollaborators,
  onDelete,
  onRename,
  onClick,
}: ProjectCardProps) {
  return (
    <Card
      className="overflow-hidden hover:shadow-xl hover:scale-105 transition-all duration-300 ease-in-out transform cursor-pointer flex flex-col"
      onClick={() => onClick(project.id)}
    >
      <CardContent className="p-4 flex-grow">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <h3 className="font-semibold text-lg hover:text-primary">{project.title}</h3>
              {project.owner_id !== userId && (
                <Badge variant="secondary" className="text-xs shrink-0 flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Shared
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{project.description}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onManageCollaborators(project.id, project.title)
                }}
              >
                <Users className="mr-2 h-4 w-4" />
                Manage Collaborators
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onRename(project.id, project.title, project.description || "")
                }}
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(project.id, project.title)
                }}
                className="text-destructive focus:text-destructive"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex justify-between items-center text-sm text-muted-foreground">
        <div className="flex items-center">
          <Clock className="h-3.5 w-3.5 mr-1" />
          {formatRelativeTime(project.updated_at)}
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation()
              onManageCollaborators(project.id, project.title)
            }}
            title="Add Collaborator"
          >
            <UserPlus className="h-4 w-4 text-muted-foreground hover:text-primary" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation()
              onStar(project.id, e)
            }}
          >
            <Star
              className={cn(
                "h-4 w-4 hover:text-yellow-400 transition-colors",
                project.is_starred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground",
              )}
            />
          </Button>

          {project.collaborator_count !== undefined && project.collaborator_count > 1 && (
            <div className="flex items-center text-muted-foreground">
              <Users className="h-3.5 w-3.5 mr-1" />
              {project.collaborator_count}
            </div>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}
