/**
 * UserNotificationConnection — a thin client over the gateway's user-level
 * notification WebSocket (`GET /api/v1/ws/user`). Unlike the per-project editing
 * socket, this stays open for the whole signed-in session and carries small
 * server→client "something changed" hints (a new invitation today). The owner
 * reacts by refetching the detail.
 *
 * Auth rides the session cookie on the handshake. It auto-reconnects with
 * backoff and sends nothing upstream.
 */

import { getApiBaseUrl } from "@/lib/api"

/** A pushed notification hint. `kind` says what changed; the client refetches. */
export interface UserNotification {
  type: "notification"
  kind: string
}

const BACKOFF_MIN = 1_000
const BACKOFF_MAX = 15_000

function wsUrl(): string {
  const base = getApiBaseUrl().replace(/^http/, "ws")
  return `${base}/api/v1/ws/user`
}

function parse(data: string): UserNotification | null {
  try {
    const raw = JSON.parse(data) as { type?: unknown; kind?: unknown }
    if (raw && raw.type === "notification" && typeof raw.kind === "string") {
      return { type: "notification", kind: raw.kind }
    }
  } catch {
    /* ignore malformed frames */
  }
  return null
}

export class UserNotificationConnection {
  private ws: WebSocket | null = null
  private closed = false
  private backoff = BACKOFF_MIN
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly onNotification: (n: UserNotification) => void) {}

  /** Opens the socket. Safe to call once; reconnection is automatic until close(). */
  connect(): void {
    if (typeof WebSocket === "undefined") return
    this.closed = false
    this.open()
  }

  private open(): void {
    if (this.closed) return
    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl())
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws
    ws.onopen = () => {
      this.backoff = BACKOFF_MIN
    }
    ws.onmessage = (ev) => {
      const n = parse(typeof ev.data === "string" ? ev.data : "")
      if (n) this.onNotification(n)
    }
    ws.onclose = () => {
      this.ws = null
      this.scheduleReconnect()
    }
    ws.onerror = () => ws.close()
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return
    const delay = this.backoff
    this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, delay)
  }

  /** Closes the socket and stops reconnecting. Idempotent. */
  close(): void {
    this.closed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }
}

/** Window event fired when the pending-invite set may have changed (a live push
 *  or an accept/decline). The header badge and the invites page listen for it
 *  and refetch — decoupling the single socket from the many places that show
 *  invite state. */
export const INVITES_CHANGED_EVENT = "inkwell:invites-changed"

/** Dispatch {@link INVITES_CHANGED_EVENT} so listeners refetch invites. */
export function emitInvitesChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(INVITES_CHANGED_EVENT))
  }
}
