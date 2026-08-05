"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "@/hooks/use-toast"
import {
  deleteProject,
  getMyProjects,
  getSharedProjects,
  updateProject,
  toggleProjectStar,
  setProjectArchived,
  type Project,
} from "@/services/project"
import { useDataChanged } from "@/lib/live-refresh"
import { getPendingInvites } from "@/services/invites"
import { listOrgProjects, type Organization } from "@/services/organization"
import type { Workspace } from "@/services/workspace"

/** Options passed to the `useProjects` hook by the dashboard page. */
interface UseProjectsOptions {
  /** UUID of the authenticated user, or `undefined` while auth is loading. */
  userId: string | undefined;
  /** Whether the user has a valid, unexpired session. */
  isAuthenticated: boolean;
  /** `true` while the auth context is still resolving the initial session. */
  authLoading: boolean;
  /**
   * Active sort/filter mode applied to the project list.
   * Accepted values: `"lastUpdated"` | `"myProjects"` | `"collaborations"` | `"starred"` | `"archived"`.
   */
  activeFilter: string;
  /** Text the user has typed into the search box; filters projects by title. */
  searchQuery: string;
  /** The selected workspace; when set, only projects whose category matches a
   *  workspace category slug are shown. `null` shows all projects. */
  activeWorkspace: Workspace | null;
  /** The active organization. When set, the dashboard lists the org's shared
   *  project pool instead of the user's personal + collaborated projects, and
   *  the workspace category filter does not apply. */
  activeOrg: Organization | null;
}

/**
 * Manages the project list for the dashboard. On mount it fetches the user's
 * projects and pending invitation count in parallel. Exposes filtered/sorted
 * views and handlers for starring, renaming, and deleting projects.
 *
 * Redirects to `/login` when `isAuthenticated` is `false` after auth resolves.
 *
 * @param options - User identity, auth state, active filter, and workspace context.
 * @returns State values and action handlers consumed by the dashboard UI.
 */
export function useProjects({
  userId,
  isAuthenticated,
  authLoading,
  activeFilter,
  searchQuery,
  activeWorkspace,
  activeOrg,
}: UseProjectsOptions) {
  const router = useRouter()
  const [projects, setProjects] = useState<(Project & { collaborator_count?: number })[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteCount, setInviteCount] = useState(0)

  const refetch = useCallback(async () => {
    if (authLoading) return

    if (isAuthenticated && userId) {
      setIsLoading(true)
      const fetchDashboardData = async () => {
        try {
          // Org context: show only the org's shared project pool. Personal
          // context: owned + collaborated projects.
          if (activeOrg) {
            const orgProjects = await listOrgProjects(activeOrg.id)
            setProjects(orgProjects)
            setInviteCount(0)
            return
          }

          // Fetch owned + shared projects in parallel so the "Collaborations"
          // filter has data to work with. Shared projects fail silently — the
          // collab service may be down — rather than empty the dashboard.
          const [ownedResponse, shared, fetchedInvites] = await Promise.all([
            getMyProjects(userId),
            getSharedProjects().catch((err) => {
              console.warn("Shared projects service not available:", err.message)
              return [] as Project[]
            }),
            getPendingInvites().catch((err) => {
              console.warn("Invites service not available:", err.message)
              return []
            }),
          ])

          // Merge owned + shared, dedup by id in case a project is in both lists.
          const merged = new Map<string, Project & { collaborator_count?: number }>()
          for (const p of ownedResponse.projects) merged.set(p.id, p)
          for (const p of shared) if (!merged.has(p.id)) merged.set(p.id, p)
          setProjects(Array.from(merged.values()))

          setInviteCount(fetchedInvites.length)
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          console.error("Dashboard fetch error:", err)
          setError(`Failed to fetch dashboard data: ${message}`)
        } finally {
          setIsLoading(false)
        }
      }
      await fetchDashboardData()
    } else {
      setIsLoading(false)
    }
  }, [isAuthenticated, userId, authLoading, activeOrg])

  useEffect(() => {
    void refetch()
  }, [refetch])

  // A project created outside React (the MCP bridge writes straight to SQLite)
  // would otherwise not appear until something else happened to refetch.
  useDataChanged(() => {
    void refetch()
  })

  const filteredProjects = useMemo(() => {
    // In org context the project list is already the org's pool — the personal
    // workspace category filter does not apply.
    const workspaceSlugs = activeOrg ? [] : (activeWorkspace?.categories?.map((c) => c.slug) ?? [])
    let result = workspaceSlugs.length > 0
      ? projects.filter((p) => workspaceSlugs.includes(p.category))
      : projects

    // Archive gate: every default view hides archived projects so a
    // shipped screenplay or finished novel doesn't pollute Recent /
    // Starred / Collaborations forever. The dedicated "archived"
    // filter inverts the gate and shows only archived items.
    if (activeFilter === "archived") {
      result = result.filter((p) => p.status === "archived")
    } else {
      result = result.filter((p) => p.status !== "archived")
    }

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
      case "archived":
        // Sort archived list by most-recently-updated so what the
        // writer just archived sits at the top.
        result = [...result].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        break
    }

    if (!searchQuery) return result

    return result.filter((p) => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [projects, activeFilter, searchQuery, userId, activeWorkspace, activeOrg])

  /** Prepends a newly created project to the local list without a refetch. */
  const handleProjectCreated = (newProject: Project) => {
    setProjects((prev) => [newProject, ...prev])
  }

  /**
   * Toggles the star on a project and updates the local list optimistically.
   * Stops the click event from bubbling to the project card's navigation handler.
   *
   * @param projectId - UUID of the project to star/unstar.
   * @param e - Mouse event; `stopPropagation` is called to prevent card navigation.
   */
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

  /**
   * Permanently deletes a project and removes it from the local list.
   * Sets `isDeleting` to `true` for the duration of the request.
   *
   * @param projectId - UUID of the project to delete.
   * @param projectName - Display name used in the success/error toast message.
   */
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

  /**
   * Updates a project's title and description, then reflects the change in the
   * local list. Sets `isRenaming` to `true` for the duration of the request.
   *
   * @param projectId - UUID of the project to rename.
   * @param newName - New display title.
   * @param newDescription - New description text.
   */
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

  /**
   * Opens a project on its home surface. Board projects have no format editor —
   * their home is the beat-board canvas — so they route there; everything else
   * opens the editor.
   *
   * @param projectId - UUID of the project to open.
   */
  const handleProjectClick = (projectId: string) => {
    const surface =
      projects.find((p) => p.id === projectId)?.category === "board" ? "beat-board" : "editor"
    router.push(`/projects/${surface}?id=${projectId}`)
  }

  /**
   * Toggles the archived flag (status === "archived") on a project.
   * Optimistic update; rolls back the local state if the server
   * call fails.
   */
  const handleArchiveProject = async (projectId: string, archived: boolean) => {
    if (!userId) return
    const previous = projects
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, status: archived ? "archived" : "active" } : p)),
    )
    try {
      await setProjectArchived(projectId, userId, archived)
      toast({
        title: archived ? "Project archived" : "Project restored",
        description: archived
          ? "Hidden from your default views — find it under Archived."
          : "Back in your default views.",
      })
    } catch {
      setProjects(previous)
      toast({ title: "Error", description: "Could not update project. Please try again.", variant: "destructive" })
    }
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
    handleArchiveProject,
    handleProjectClick,
    refetch,
  }
}
