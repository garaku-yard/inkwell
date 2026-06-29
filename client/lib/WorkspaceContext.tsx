"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react"
import { useAuth } from "@/lib/AuthContext"
import { listUserWorkspaces, type Workspace, type WorkspacesResponse } from "@/services/workspace"
import { listOrganizations, type Organization } from "@/services/organization"

const ACTIVE_WORKSPACE_KEY = "activeWorkspaceId"
const ACTIVE_ORG_KEY = "activeOrgId"
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
  /** Organizations the user belongs to (the GitHub-style team entity).
   *  Empty on the desktop build (hosted-only). */
  organizations: Organization[]
  /** The active organization, or null when the user is in personal context.
   *  `activeOrg !== null` is the single discriminator the app uses to decide
   *  between personal and org views. */
  activeOrg: Organization | null
  /** Enter an org (non-null) or return to personal context (null). */
  setActiveOrg: (org: Organization | null) => void
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
  organizations: [],
  activeOrg: null,
  setActiveOrg: () => {},
  isLoading: true,
  needsOnboarding: false,
  refetch: () => {},
})

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [workspaces, setWorkspaces] = useState<WorkspacesResponse>(defaultWorkspaces)
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [activeOrg, setActiveOrgState] = useState<Organization | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  // Selecting a personal workspace returns the app to personal context, so the
  // org view never lingers behind a workspace selection.
  const setActiveWorkspace = useCallback((workspace: Workspace) => {
    setActiveWorkspaceState(workspace)
    setActiveOrgState(null)
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspace.id)
    localStorage.removeItem(ACTIVE_ORG_KEY)
  }, [])

  const setActiveOrg = useCallback((org: Organization | null) => {
    setActiveOrgState(org)
    if (org) localStorage.setItem(ACTIVE_ORG_KEY, org.id)
    else localStorage.removeItem(ACTIVE_ORG_KEY)
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
      // Workspaces and orgs load in parallel. Orgs are best-effort: the desktop
      // build returns [] and a hosted hiccup shouldn't blank the rail.
      const [data, orgs] = await Promise.all([
        listUserWorkspaces(),
        listOrganizations().catch(() => [] as Organization[]),
      ])
      const order = loadOrder()
      const normalized: WorkspacesResponse = {
        personal: applyOrder(data.personal ?? [], order.personal),
        org: applyOrder(data.org ?? [], order.org),
      }
      setWorkspaces(normalized)
      setOrganizations(orgs)

      const all = [...(normalized.personal ?? []), ...(normalized.org ?? [])]

      if (all.length === 0 && orgs.length === 0) {
        setNeedsOnboarding(true)
        setActiveWorkspaceState(null)
        return
      }

      setNeedsOnboarding(false)

      // Restore last active personal workspace from localStorage.
      const savedId = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_WORKSPACE_KEY) : null
      const saved = savedId ? all.find((w) => w.id === savedId) : null
      setActiveWorkspaceState(saved ?? all[0] ?? null)

      // Restore org context if one was active and still exists.
      const savedOrgId = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_ORG_KEY) : null
      const savedOrg = savedOrgId ? orgs.find((o) => o.id === savedOrgId) : null
      setActiveOrgState(savedOrg ?? null)
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

  // Memoised so consumers don't re-render whenever the provider re-renders for
  // an unrelated reason; the callbacks are already stable via useCallback.
  const value = useMemo<WorkspaceContextType>(
    () => ({
      workspaces,
      activeWorkspace,
      setActiveWorkspace,
      reorderWorkspaces,
      organizations,
      activeOrg,
      setActiveOrg,
      isLoading,
      needsOnboarding,
      refetch: fetchWorkspaces,
    }),
    [workspaces, activeWorkspace, setActiveWorkspace, reorderWorkspaces, organizations, activeOrg, setActiveOrg, isLoading, needsOnboarding, fetchWorkspaces],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
