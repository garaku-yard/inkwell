"use client"

/**
 * useRealtimePresence — live "who else is in this project" for the editor chrome.
 *
 * Opens the project's realtime WebSocket (when the bound storage advertises the
 * `realtime` capability and the user is signed in), reduces the presence frames
 * into a roster, and hands back the *other* people editing plus a `setFocus`
 * callback so an editor can report which element it's on ("editing X").
 *
 * The desktop build never advertises `realtime`, so this is a no-op there: it
 * returns an empty roster and a `setFocus` that does nothing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useAuth } from "@/lib/AuthContext"
import { getStorage } from "@/lib/storage"
import { RealtimeConnection } from "@/lib/realtime/connection"
import type { EditFrame, Peer } from "@/lib/realtime/protocol"

/** A remote element-content change, ready to apply to local editor state. */
export type RemoteEdit = EditFrame
/** Subscriber for remote edits; returns an unsubscribe function. */
export type EditSubscriber = (edit: RemoteEdit) => void

export interface RealtimePresence {
  /** Other people in the room, one entry per user (self excluded). */
  peers: Peer[]
  /** Whether the socket is currently connected. */
  connected: boolean
  /** Report the element this client is editing; empty id clears focus. */
  setFocus: (elementId: string, label?: string) => void
  /** Broadcast a live content change for an element to the room. */
  sendEdit: (elementId: string, content: string, isScene: boolean) => void
  /** Subscribe to remote edits; returns an unsubscribe function. */
  subscribeEdits: (handler: EditSubscriber) => () => void
}

/** True when the bound storage exposes realtime presence (web build only). */
function realtimeSupported(): boolean {
  try {
    return getStorage().capabilities.has("realtime")
  } catch {
    return false
  }
}

/**
 * Dedupes a per-connection roster to one entry per user, excluding the current
 * user's own sessions, preferring a connection that has a focused element so the
 * "editing X" label survives multi-tab users.
 */
function aggregate(byConn: Map<string, Peer>, selfUserId: string | undefined): Peer[] {
  const byUser = new Map<string, Peer>()
  for (const peer of byConn.values()) {
    if (peer.userId === selfUserId) continue
    const existing = byUser.get(peer.userId)
    if (!existing || (!existing.elementId && peer.elementId)) {
      byUser.set(peer.userId, peer)
    }
  }
  return Array.from(byUser.values())
}

export function useRealtimePresence(projectId: string | undefined): RealtimePresence {
  const { user } = useAuth()
  const [byConn, setByConn] = useState<Map<string, Peer>>(() => new Map())
  const [connected, setConnected] = useState(false)
  const connRef = useRef<RealtimeConnection | null>(null)
  // Edit subscribers live in a ref so the connection callback stays stable and
  // editors can (un)subscribe without re-opening the socket.
  const editSubsRef = useRef<Set<EditSubscriber>>(new Set())

  useEffect(() => {
    if (!projectId || !user || !realtimeSupported()) return

    setByConn(new Map())
    setConnected(false)

    const conn = new RealtimeConnection(projectId, {
      onStatusChange: setConnected,
      onFrame: (frame) => {
        if (frame.type === "edit") {
          editSubsRef.current.forEach((fn) => fn(frame))
          return
        }
        setByConn((prev) => {
          const next = new Map(prev)
          switch (frame.type) {
            case "roster":
              next.clear()
              for (const p of frame.peers) next.set(p.connId, p)
              break
            case "peer_join":
            case "focus":
              next.set(frame.peer.connId, frame.peer)
              break
            case "peer_leave":
              next.delete(frame.connId)
              break
          }
          return next
        })
      },
    })
    connRef.current = conn
    conn.connect()

    return () => {
      conn.close()
      connRef.current = null
    }
  }, [projectId, user])

  const setFocus = useCallback((elementId: string, label = "") => {
    connRef.current?.setFocus(elementId, label)
  }, [])

  const sendEdit = useCallback((elementId: string, content: string, isScene: boolean) => {
    connRef.current?.sendEdit(elementId, content, isScene)
  }, [])

  const subscribeEdits = useCallback((handler: EditSubscriber) => {
    editSubsRef.current.add(handler)
    return () => {
      editSubsRef.current.delete(handler)
    }
  }, [])

  const peers = useMemo(() => aggregate(byConn, user?.id), [byConn, user?.id])

  return { peers, connected, setFocus, sendEdit, subscribeEdits }
}
