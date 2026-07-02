"use client"

/**
 * useDurableSessions — fetches a project's durable advisory edit locks (the
 * persisted "who has this open, and where") and refreshes them while the tab is
 * focused. Where the live presence roster (useProjectPresence) reflects who is
 * connected *right now*, durable sessions survive a reconnect or a gateway
 * restart: they seed soft-lock markers on open and cover the gap before the first
 * live frame arrives.
 *
 * Results are shaped as {@link Peer}s (with a synthetic `durable:<userId>`
 * connId) so callers can merge them into the same maps the live roster feeds. The
 * current user is excluded — you don't lock yourself out.
 *
 * The desktop build never advertises the `realtime` capability (editing is
 * local-only), so this is a no-op there and returns an empty list.
 */

import { useCallback, useEffect, useState } from "react"

import { useAuth } from "@/lib/AuthContext"
import { getStorage } from "@/lib/storage"
import type { Peer } from "@/lib/realtime/protocol"

/** How often to re-poll durable sessions while the tab is focused (ms). */
const REFRESH_MS = 30_000

/** True when the bound storage exposes realtime (web build only). */
function realtimeSupported(): boolean {
  try {
    return getStorage().capabilities.has("realtime")
  } catch {
    return false
  }
}

/**
 * Returns the durable advisory edit locks for a project as Peer records, minus
 * the current user's own. Empty on the desktop build or when signed out.
 */
export function useDurableSessions(projectId: string | undefined): Peer[] {
  const { user } = useAuth()
  const selfId = user?.id
  const [sessions, setSessions] = useState<Peer[]>([])

  const refresh = useCallback(async () => {
    if (!projectId || !selfId || !realtimeSupported()) return
    try {
      const rows = await getStorage().collaboration.getEditSessions(projectId)
      setSessions(
        rows
          .filter((s) => s.userId !== selfId)
          .map((s) => ({
            connId: `durable:${s.userId}`,
            userId: s.userId,
            name: s.name,
            elementId: s.elementId || undefined,
          })),
      )
    } catch {
      // Best-effort overlay — keep the last snapshot on a transient failure.
    }
  }, [projectId, selfId])

  useEffect(() => {
    if (!projectId || !selfId || !realtimeSupported()) {
      setSessions([])
      return
    }
    let cancelled = false
    const tick = () => {
      if (!cancelled) void refresh()
    }
    tick()
    const interval = window.setInterval(tick, REFRESH_MS)
    window.addEventListener("focus", tick)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener("focus", tick)
    }
  }, [projectId, selfId, refresh])

  return sessions
}
