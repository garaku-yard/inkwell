"use client"

import { useCallback, useEffect, useState } from "react"

import { getStorage, type SyncProjectState } from "@/lib/storage"
import { getSyncState, isSyncAvailable, setSyncEnabled, syncProject } from "@/services/sync"

/**
 * Per-project sync state + actions for the UI. Gated on the `sync` capability
 * (desktop only) and, at runtime, on a linked cloud account (`available`).
 * Storage isn't reactive, so this re-reads after each action; the background
 * SyncRunner keeps things moving on its own cadence.
 */
export function useProjectSync(projectId: string | undefined) {
  // capabilities is a stable Set bound at boot — safe to read at render.
  const supported = typeof projectId === "string" && getStorage().capabilities.has("sync")
  const [available, setAvailable] = useState(false)
  const [state, setState] = useState<SyncProjectState | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!supported || !projectId) return
    try {
      setAvailable(await isSyncAvailable())
      setState(await getSyncState(projectId))
    } catch {
      /* leave prior state; the runner / next action will retry */
    }
  }, [supported, projectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const toggle = useCallback(
    async (enabled: boolean) => {
      if (!projectId) return
      setBusy(true)
      // Optimistic: reflect the new enabled state immediately.
      setState((s) => (s ? { ...s, enabled } : s))
      try {
        await setSyncEnabled(projectId, enabled)
      } finally {
        setBusy(false)
        await refresh()
      }
    },
    [projectId, refresh],
  )

  const syncNow = useCallback(async () => {
    if (!projectId) return
    setBusy(true)
    setState((s) => (s ? { ...s, status: "syncing" } : s))
    try {
      setState(await syncProject(projectId))
    } finally {
      setBusy(false)
    }
  }, [projectId])

  return { supported, available, state, busy, toggle, syncNow, refresh }
}
