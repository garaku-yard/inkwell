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
  sendEdit: () => {},
  sendCaret: () => {},
  subscribeEdits: () => () => {},
  subscribeCarets: () => () => {},
  subscribeResync: () => () => {},
}

const PresenceContext = createContext<RealtimePresence>(EMPTY)

export function PresenceProvider({
  projectId,
  children,
}: {
  projectId: string | undefined
  children: ReactNode
}) {
  // A project surface can mount more than one PresenceProvider: the editor page
  // wraps the whole editor (so the editor component itself can consume presence),
  // and ProjectShell wraps its chrome (so the header avatars can). Only the
  // outermost provider opens a socket — a nested one reuses the ancestor's live
  // value rather than starting a second connection to the same room. Without
  // this, an editor that *renders* ProjectShell would sit above ProjectShell's
  // provider and silently resolve to the no-op EMPTY value.
  const parent = useContext(PresenceContext)
  const nested = parent !== EMPTY
  const presence = useRealtimePresence(nested ? undefined : projectId)
  if (nested) return <>{children}</>
  return <PresenceContext.Provider value={presence}>{children}</PresenceContext.Provider>
}

/** Reads the project's live presence; safe to call without a provider. */
export function useProjectPresence(): RealtimePresence {
  return useContext(PresenceContext)
}
