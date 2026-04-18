"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { toast } from "@/hooks/use-toast"
import {
  deleteProject,
  getMyProjects,
  updateProject,
  toggleProjectStar,
  type Project,
} from "@/services/project"
import { getPendingInvites } from "@/services/invites"
import type { Workspace } from "@/services/workspace"

interface UseProjectsOptions {
  userId: string | undefined
  isAuthenticated: boolean
  authLoading: boolean
  activeFilter: string
  searchQuery: string
  activeWorkspace: Workspace | null
}

/**
 * Manages the project list for the dashboard: fetching, filtering, starring,
 * renaming, and deleting. Redirects to login when unauthenticated.
 */
export function useProjects({
  userId,
  isAuthenticated,
  authLoading,
  activeFilter,
  searchQuery,
  activeWorkspace,
}: UseProjectsOptions) {
  const router = useRouter()
  const [projects, setProjects] = useState<(Project & { collaborator_count?: number })[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteCount, setInviteCount] = useState(0)

  useEffect(() => {
    if (authLoading) return

    if (isAuthenticated && userId) {
      setIsLoading(true)
      const fetchDashboardData = async () => {
        try {
          const [projectsResponse, fetchedInvites] = await Promise.all([
            getMyProjects(userId),
            getPendingInvites().catch((err) => {
              console.warn("Invites service not available:", err.message)
              return []
            }),
          ])
          setProjects(projectsResponse.projects)
          setInviteCount(fetchedInvites.length)
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          console.error("Dashboard fetch error:", err)
          setError(`Failed to fetch dashboard data: ${message}`)
        } finally {
          setIsLoading(false)
        }
      }
      fetchDashboardData()
    } else {
      setIsLoading(false)
    }
  }, [isAuthenticated, userId, authLoading])

  const filteredProjects = useMemo(() => {
    const workspaceSlugs = activeWorkspace?.categories?.map((c) => c.slug) ?? []
    let result = workspaceSlugs.length > 0
      ? projects.filter((p) => workspaceSlugs.includes(p.category))
      : projects

    switch (activeFilter) {
      case "lastUpdated":
        result = [...result].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        break
      case "myProjects":
        result = result.filter((p) => p.owner_id === userId)
        break
      case "collaborations":
        result = result.filter((p) => p.owner_id !== userId)
        break
      case "starred":
        result = result.filter((p) => p.is_starred)
        break
    }

    if (!searchQuery) return result

    return result.filter((p) => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [projects, activeFilter, searchQuery, userId, activeWorkspace])

  const handleProjectCreated = (newProject: Project) => {
    setProjects((prev) => [newProject, ...prev])
  }

  const handleStarProject = async (projectId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!userId) return

    try {
      const updated = await toggleProjectStar(projectId, userId)
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, is_starred: updated.is_starred } : p)))
      toast({
        title: updated.is_starred ? "Project starred" : "Star removed",
        description: updated.is_starred ? "Added to starred projects" : "Removed from starred projects",
      })
    } catch {
      toast({ title: "Error", description: "Could not update project. Please try again.", variant: "destructive" })
    }
  }

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!userId) return
    setIsDeleting(true)
    try {
      await deleteProject(projectId, userId)
      setProjects((prev) => prev.filter((p) => p.id !== projectId))
      toast({ title: "Project deleted", description: `"${projectName}" has been permanently deleted.` })
    } catch {
      toast({ title: "Error", description: "Could not delete project. Please try again.", variant: "destructive" })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleRenameProject = async (projectId: string, newName: string, newDescription: string) => {
    if (!userId) return
    setIsRenaming(true)
    try {
      const updatedData = await updateProject(projectId, userId, { title: newName, description: newDescription })
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updatedData : p)))
      toast({ title: "Project updated", description: `"${newName}" has been successfully updated.` })
    } catch {
      toast({ title: "Error", description: "Could not update project. Please try again.", variant: "destructive" })
    } finally {
      setIsRenaming(false)
    }
  }

  const handleProjectClick = (projectId: string) => {
    router.push(`/projects/${projectId}/editor`)
  }

  return {
    projects,
    filteredProjects,
    isLoading,
    isDeleting,
    isRenaming,
    error,
    inviteCount,
    handleProjectCreated,
    handleStarProject,
    handleDeleteProject,
    handleRenameProject,
    handleProjectClick,
  }
}
