"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useAuth } from "@/lib/AuthContext"
import { listUserWorkspaces, type Workspace, type WorkspacesResponse } from "@/services/workspace"

const ACTIVE_WORKSPACE_KEY = "activeWorkspaceId"

interface WorkspaceContextType {
  workspaces: WorkspacesResponse
  activeWorkspace: Workspace | null
  setActiveWorkspace: (workspace: Workspace) => void
  isLoading: boolean
  needsOnboarding: boolean
  refetch: () => void
}

const defaultWorkspaces: WorkspacesResponse = { personal: [], org: [] }

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: defaultWorkspaces,
  activeWorkspace: null,
  setActiveWorkspace: () => {},
  isLoading: true,
  needsOnboarding: false,
  refetch: () => {},
})

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [workspaces, setWorkspaces] = useState<WorkspacesResponse>(defaultWorkspaces)
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  const allWorkspaces = [...(workspaces.personal ?? []), ...(workspaces.org ?? [])]

  const setActiveWorkspace = useCallback((workspace: Workspace) => {
    setActiveWorkspaceState(workspace)
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspace.id)
  }, [])

  const fetchWorkspaces = useCallback(async () => {
    if (!isAuthenticated) return
    setIsLoading(true)
    try {
      const data = await listUserWorkspaces()
      const normalized: WorkspacesResponse = {
        personal: data.personal ?? [],
        org: data.org ?? [],
      }
      setWorkspaces(normalized)

      const all = [...(normalized.personal ?? []), ...(normalized.org ?? [])]

      if (all.length === 0) {
        setNeedsOnboarding(true)
        setActiveWorkspaceState(null)
        return
      }

      setNeedsOnboarding(false)

      // Restore last active workspace from localStorage
      const savedId = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_WORKSPACE_KEY) : null
      const saved = savedId ? all.find((w) => w.id === savedId) : null
      setActiveWorkspaceState(saved ?? all[0])
    } catch (err) {
      console.error("Failed to load workspaces:", err)
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchWorkspaces()
    } else if (!authLoading && !isAuthenticated) {
      setIsLoading(false)
    }
  }, [isAuthenticated, authLoading, fetchWorkspaces])

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        setActiveWorkspace,
        isLoading,
        needsOnboarding,
        refetch: fetchWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
