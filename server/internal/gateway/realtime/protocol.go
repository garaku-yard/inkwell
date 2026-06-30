package realtime

import "encoding/json"

// The realtime wire protocol. Every frame is a JSON object with a "type"
// discriminator. Presence frames (roster / peer_join / peer_leave / focus) are
// server-authoritative: the gateway stamps the connection identity so a client
// can't impersonate a peer. Anything the gateway doesn't recognise (e.g. the
// Stage 3 element-edit frames) is relayed to the room verbatim.
const (
	// TypeRoster is sent once to a joining connection: the peers already in the
	// room. The joiner is never in its own roster.
	TypeRoster = "roster"
	// TypePeerJoin is broadcast to the room when a new connection joins.
	TypePeerJoin = "peer_join"
	// TypePeerLeave is broadcast to the room when a connection leaves.
	TypePeerLeave = "peer_leave"
	// TypeFocus is sent by a client when its editing focus moves to a different
	// element (or clears), and relayed by the gateway to the rest of the room.
	TypeFocus = "focus"
	// TypeEdit carries a live element-content change. The gateway relays it to
	// the rest of the room verbatim; the DB stays source of truth via the
	// client's existing debounced autosave. Receivers apply it to every element
	// except the one they are actively editing (the cursor-jump guard).
	TypeEdit = "edit"
	// TypeCaret carries a peer's live cursor position (which element + character
	// offset). It is ephemeral overlay state — relayed to the room with
	// server-stamped identity, but never written to the presence store (it would
	// thrash Redis at typing frequency) and never changes focus. An empty
	// ElementID clears the peer's caret (they left the editing surface).
	TypeCaret = "caret"
)

// Peer is a single live editing session as seen by everyone else in the room.
// Identity (ConnID / UserID / Name / AvatarURL) is set by the gateway from the
// authenticated session; focus (ElementID / Label) reflects what the peer last
// reported editing and is empty when they have nothing focused.
type Peer struct {
	// ConnID identifies this connection within the room. One user may hold
	// several connections (multiple tabs / devices); each is a distinct peer.
	ConnID string `json:"connId"`
	// UserID is the authenticated account behind the connection. Clients dedupe
	// avatars by this so a user with two tabs shows once.
	UserID string `json:"userId"`
	// Name is the peer's display name (full name, falling back to username).
	Name string `json:"name"`
	// AvatarURL is the peer's avatar path, possibly relative to the gateway.
	AvatarURL string `json:"avatarUrl,omitempty"`
	// ElementID is the element the peer is currently editing, empty when idle.
	ElementID string `json:"elementId,omitempty"`
	// Label is a human-readable name for the focused element (e.g. a passage
	// title), supplied by the peer's client for display in the presence bar.
	Label string `json:"label,omitempty"`
}

// inbound is the subset of fields the gateway reads from a client frame. Only
// focus and caret are client-driven; identity is never trusted from the wire.
type inbound struct {
	Type      string `json:"type"`
	ElementID string `json:"elementId"`
	Label     string `json:"label"`
	// Offset is the caret's character position within ElementID (caret frames
	// only); zero for other frame types.
	Offset int `json:"offset"`
}

// caretFrame carries a peer's live cursor for a TypeCaret message. Identity is
// stamped by the gateway from the authenticated connection; ElementID + Offset
// come from the client's last reported selection. It is deliberately separate
// from Peer so a cursor move never touches the durable presence roster.
type caretFrame struct {
	Type      string `json:"type"`
	ConnID    string `json:"connId"`
	UserID    string `json:"userId"`
	Name      string `json:"name"`
	ElementID string `json:"elementId"`
	Offset    int    `json:"offset"`
}

// rosterFrame is the payload of a TypeRoster message.
type rosterFrame struct {
	Type  string `json:"type"`
	Peers []Peer `json:"peers"`
}

// peerFrame carries a single peer for TypePeerJoin / TypeFocus.
type peerFrame struct {
	Type string `json:"type"`
	Peer Peer   `json:"peer"`
}

// leaveFrame carries the departing connection's id for TypePeerLeave.
type leaveFrame struct {
	Type   string `json:"type"`
	ConnID string `json:"connId"`
}

// encodeRoster marshals the peers-already-here frame sent to a joiner.
func encodeRoster(peers []Peer) []byte {
	if peers == nil {
		peers = []Peer{}
	}
	b, _ := json.Marshal(rosterFrame{Type: TypeRoster, Peers: peers})
	return b
}

// encodePeer marshals a peer_join or focus frame for the given message type.
func encodePeer(msgType string, p Peer) []byte {
	b, _ := json.Marshal(peerFrame{Type: msgType, Peer: p})
	return b
}

// encodeLeave marshals a peer_leave frame for a departing connection.
func encodeLeave(connID string) []byte {
	b, _ := json.Marshal(leaveFrame{Type: TypePeerLeave, ConnID: connID})
	return b
}

// encodeCaret marshals a caret frame for a connection's reported cursor,
// stamping the connection's identity (never trusted from the wire).
func encodeCaret(c *conn, elementID string, offset int) []byte {
	b, _ := json.Marshal(caretFrame{
		Type:      TypeCaret,
		ConnID:    c.id,
		UserID:    c.userID,
		Name:      c.name,
		ElementID: elementID,
		Offset:    offset,
	})
	return b
}

// parseInbound decodes a client frame far enough to route it. It returns the
// message type and the focus fields; identity is intentionally ignored.
func parseInbound(data []byte) (inbound, bool) {
	var in inbound
	if err := json.Unmarshal(data, &in); err != nil || in.Type == "" {
		return inbound{}, false
	}
	return in, true
}
