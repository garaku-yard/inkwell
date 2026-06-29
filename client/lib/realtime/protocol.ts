/**
 * Realtime wire protocol — the TypeScript mirror of the gateway's
 * `internal/gateway/realtime/protocol.go`. Every frame is a JSON object tagged
 * with a `type`. Presence frames are server-authoritative (identity is stamped
 * by the gateway); the client only ever *sends* a focus frame.
 */

/** A live editing session as the rest of the room sees it. */
export interface Peer {
  /** Unique per connection within a room — one user may hold several. */
  connId: string
  /** The authenticated account behind the connection. */
  userId: string
  /** Display name (full name, falling back to username). */
  name: string
  /** Avatar path, possibly relative to the gateway origin. */
  avatarUrl?: string
  /** The element the peer is editing, or undefined when idle. */
  elementId?: string
  /** Human-readable label for the focused element (e.g. a passage title). */
  label?: string
}

/** Sent once to a joining connection: the peers already in the room. */
export interface RosterFrame {
  type: "roster"
  peers: Peer[]
}

/** Broadcast when a connection joins the room. */
export interface PeerJoinFrame {
  type: "peer_join"
  peer: Peer
}

/** Broadcast when a connection leaves the room. */
export interface PeerLeaveFrame {
  type: "peer_leave"
  connId: string
}

/** Relayed when a peer's editing focus moves (or clears). */
export interface FocusFrame {
  type: "focus"
  peer: Peer
}

/** Any frame the gateway can push to a client. */
export type ServerFrame = RosterFrame | PeerJoinFrame | PeerLeaveFrame | FocusFrame

/** The focus frame a client sends upstream; the gateway stamps identity. */
export interface OutboundFocus {
  type: "focus"
  elementId: string
  label: string
}

/** Narrowing parse of an inbound frame; returns null on anything unrecognised. */
export function parseServerFrame(data: string): ServerFrame | null {
  let raw: unknown
  try {
    raw = JSON.parse(data)
  } catch {
    return null
  }
  if (!raw || typeof raw !== "object") return null
  const frame = raw as { type?: unknown }
  switch (frame.type) {
    case "roster":
    case "peer_join":
    case "peer_leave":
    case "focus":
      return raw as ServerFrame
    default:
      return null
  }
}
