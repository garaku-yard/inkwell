"use client"

/**
 * PresenceProvider holds the single realtime connection for a project and shares
 * it with everything in the project chrome: the header's PresenceBar reads the
 * roster, and the active editor reports its focus through `setFocus`. One
 * provider ⇒ one WebSocket, no matter how many consumers.
 *
 * Outside a provider (or on the desktop build) `useProjectPresence` returns a
 * benign empty/no-op value, so editors can call `setFocus` unconditionally.
 */

import { createContext, useContext, type ReactNode } from "react"

import { useRealtimePresence, type RealtimePresence } from "@/hooks/useRealtimePresence"

const EMPTY: RealtimePresence = {
  peers: [],
  connected: false,
  setFocus: () => {},
}

const PresenceContext = createContext<RealtimePresence>(EMPTY)

export function PresenceProvider({
  projectId,
  children,
}: {
  projectId: string | undefined
  children: ReactNode
}) {
  const presence = useRealtimePresence(projectId)
  return <PresenceContext.Provider value={presence}>{children}</PresenceContext.Provider>
}

/** Reads the project's live presence; safe to call without a provider. */
export function useProjectPresence(): RealtimePresence {
  return useContext(PresenceContext)
}
