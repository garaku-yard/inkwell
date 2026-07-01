"use client"

/**
 * Holds the single user-level notification socket for the signed-in session and
 * turns the gateway's pushed hints into UI — a toast plus a refresh signal that
 * the invite badge and inbox listen for. Renders nothing; mounted once in the
 * private layout. No-op on the desktop build (no `realtime` capability) and when
 * signed out.
 */

import { useEffect, useRef } from "react"

import { useAuth } from "@/lib/AuthContext"
import { useToast } from "@/hooks/use-toast"
import { getStorage } from "@/lib/storage"
import {
  UserNotificationConnection,
  emitInvitesChanged,
  type UserNotification,
} from "@/lib/realtime/user-notifications"

function realtimeSupported(): boolean {
  try {
    return getStorage().capabilities.has("realtime")
  } catch {
    return false
  }
}

export function UserNotificationsListener() {
  const { user } = useAuth()
  const { toast } = useToast()

  // Latest handler in a ref so the socket effect depends only on `user` and
  // never reconnects just because `toast` changed identity.
  const handleRef = useRef<(n: UserNotification) => void>(() => {})
  handleRef.current = (n) => {
    if (n.kind === "invite") {
      emitInvitesChanged()
      toast({
        title: "New invitation",
        description: "You've been invited to a project — open your inbox to respond.",
      })
    }
  }

  useEffect(() => {
    if (!user || !realtimeSupported()) return
    const conn = new UserNotificationConnection((n) => handleRef.current(n))
    conn.connect()
    return () => conn.close()
  }, [user])

  return null
}
