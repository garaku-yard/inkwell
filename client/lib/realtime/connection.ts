/**
 * RealtimeConnection — a thin client over the gateway's per-project WebSocket
 * (`GET /api/v1/ws/projects/{projectId}`). It owns the socket lifecycle:
 * connect, parse presence frames, auto-reconnect with backoff, and send focus
 * updates. Auth rides the session cookie on the handshake (same as every other
 * gateway call), so no token is threaded here.
 *
 * It is intentionally state-light: it forwards parsed frames to `onFrame` and
 * connection status to `onStatusChange`; the React hook reduces those into the
 * peer roster. Stage 3 element-edit frames will reuse the same socket.
 */

import { getApiBaseUrl } from "@/lib/api"
import { parseServerFrame, type ServerFrame, type OutboundFocus } from "./protocol"

/** Callbacks the owner wires up; all optional. */
export interface RealtimeHandlers {
  /** A parsed server frame (roster / peer_join / peer_leave / focus). */
  onFrame?: (frame: ServerFrame) => void
  /** Fired when the live status flips, so the UI can show a presence dot. */
  onStatusChange?: (connected: boolean) => void
}

/** Reconnect backoff bounds, in milliseconds. */
const BACKOFF_MIN = 1_000
const BACKOFF_MAX = 15_000

/** Derives the ws(s):// project endpoint from the configured gateway origin. */
function wsUrl(projectId: string): string {
  const base = getApiBaseUrl().replace(/^http/, "ws")
  return `${base}/api/v1/ws/projects/${encodeURIComponent(projectId)}`
}

export class RealtimeConnection {
  private ws: WebSocket | null = null
  private closed = false
  private backoff = BACKOFF_MIN
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  /** The latest focus, re-sent after a reconnect so peers see us again. */
  private lastFocus: OutboundFocus | null = null

  constructor(
    private readonly projectId: string,
    private readonly handlers: RealtimeHandlers,
  ) {}

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
      ws = new WebSocket(wsUrl(this.projectId))
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws

    ws.onopen = () => {
      this.backoff = BACKOFF_MIN
      this.handlers.onStatusChange?.(true)
      // Re-announce our focus so peers who were already here see it again.
      if (this.lastFocus) this.rawSend(this.lastFocus)
    }
    ws.onmessage = (ev) => {
      const frame = parseServerFrame(typeof ev.data === "string" ? ev.data : "")
      if (frame) this.handlers.onFrame?.(frame)
    }
    ws.onclose = () => {
      this.handlers.onStatusChange?.(false)
      this.ws = null
      this.scheduleReconnect()
    }
    // onerror is followed by onclose; let onclose drive reconnection.
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

  /** Reports the element this client is now editing (empty id clears focus). */
  setFocus(elementId: string, label: string): void {
    this.lastFocus = { type: "focus", elementId, label }
    this.rawSend(this.lastFocus)
  }

  private rawSend(payload: OutboundFocus): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
    }
  }

  /** Closes the socket and stops reconnecting. Idempotent. */
  close(): void {
    this.closed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onclose = null // we're closing on purpose; don't reconnect
      this.ws.close()
      this.ws = null
    }
  }
}
