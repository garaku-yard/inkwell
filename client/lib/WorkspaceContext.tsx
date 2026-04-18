"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useAuth } from "@/lib/AuthContext"
import { listUserWorkspaces, type Workspace, type WorkspacesResponse } from "@/services/workspace"

const ACTIVE_WORKSPACE_KEY = "activeWorkspaceId"
const WORKSPACE_ORDER_KEY = "inkwell:workspace-order"

interface WorkspaceOrder {
  personal: string[]
  org: string[]
}

function loadOrder(): WorkspaceOrder {
  try {
    const raw = localStorage.getItem(WORKSPACE_ORDER_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { personal: [], org: [] }
}

function applyOrder<T extends { id: string }>(items: T[], orderedIds: string[]): T[] {
  if (!orderedIds.length) return items
  const map = new Map(items.map(w => [w.id, w]))
  const ordered = orderedIds.flatMap(id => (map.has(id) ? [map.get(id)!] : []))
  const rest = items.filter(w => !orderedIds.includes(w.id))
  return [...ordered, ...rest]
}

interface WorkspaceContextType {
  workspaces: WorkspacesResponse
  activeWorkspace: Workspace | null
  setActiveWorkspace: (workspace: Workspace) => void
  reorderWorkspaces: (personal: Workspace[], org: Workspace[]) => void
  isLoading: boolean
  needsOnboarding: boolean
  refetch: () => void
}

const defaultWorkspaces: WorkspacesResponse = { personal: [], org: [] }

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: defaultWorkspaces,
  activeWorkspace: null,
  setActiveWorkspace: () => {},
  reorderWorkspaces: () => {},
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

  const reorderWorkspaces = useCallback((personal: Workspace[], org: Workspace[]) => {
    const next: WorkspacesResponse = { personal, org }
    setWorkspaces(next)
    const order: WorkspaceOrder = {
      personal: personal.map(w => w.id),
      org: org.map(w => w.id),
    }
    localStorage.setItem(WORKSPACE_ORDER_KEY, JSON.stringify(order))
  }, [])

  const fetchWorkspaces = useCallback(async () => {
    if (!isAuthenticated) return
    setIsLoading(true)
    try {
      const data = await listUserWorkspaces()
      const order = loadOrder()
      const normalized: WorkspacesResponse = {
        personal: applyOrder(data.personal ?? [], order.personal),
        org: applyOrder(data.org ?? [], order.org),
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
        reorderWorkspaces,
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
