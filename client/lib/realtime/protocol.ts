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

/**
 * A live element-content change relayed from another peer. The gateway passes
 * it through verbatim; receivers apply it to the named element unless they are
 * actively editing that element (the cursor-jump guard). The DB stays source of
 * truth via the sender's autosave, so this carries the whole content, not a diff.
 */
export interface EditFrame {
  type: "edit"
  /** The scene (passage) or element id whose content changed. */
  elementId: string
  /** The element's full new content. */
  content: string
  /** True when elementId names a scene heading rather than an element body. */
  isScene: boolean
}

/**
 * A peer's live cursor position, relayed from another client. Identity is
 * stamped by the gateway. It is ephemeral overlay state (not part of the peer
 * roster): receivers map `elementId` + `offset` to a screen position and draw a
 * floating caret + name flag. An empty `elementId` clears that peer's caret.
 */
export interface CaretFrame {
  type: "caret"
  /** Unique per connection within the room — keys the rendered caret. */
  connId: string
  /** The authenticated account behind the connection (drives the caret colour). */
  userId: string
  /** Display name, shown on the caret's name flag. */
  name: string
  /** The element the caret sits in (empty clears the caret). Opaque to the
   *  protocol — the editor decides how it maps to a DOM node. */
  elementId: string
  /** Character offset of the caret within elementId. */
  offset: number
}

/** Any frame the gateway can push to a client. */
export type ServerFrame =
  | RosterFrame
  | PeerJoinFrame
  | PeerLeaveFrame
  | FocusFrame
  | EditFrame
  | CaretFrame

/** The focus frame a client sends upstream; the gateway stamps identity. */
export interface OutboundFocus {
  type: "focus"
  elementId: string
  label: string
}

/** The edit frame a client sends upstream; relayed verbatim to the room. */
export type OutboundEdit = EditFrame

/** The caret frame a client sends upstream; the gateway stamps identity before
 *  relaying. An empty elementId clears this client's caret for everyone. */
export interface OutboundCaret {
  type: "caret"
  elementId: string
  offset: number
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
    case "edit":
    case "caret":
      return raw as ServerFrame
    default:
      return null
  }
}
