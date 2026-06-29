// Package realtime provides the WebSocket layer for live collaborative editing.
// It terminates project editing sessions at the gateway and fans changes out to
// everyone else in the same project. Stage 1 was the transport + room hub; this
// stage adds the message protocol and presence (who is in the room and what
// they are editing). Redis cross-instance fan-out lands in a later stage.
package realtime

import (
	"strconv"
	"sync"
	"sync/atomic"
)

// conn is one live editing session — a single user's WebSocket. Identity is set
// once at join from the authenticated session; focus (the element the user is
// editing) changes over the connection's life and is guarded by the hub mutex.
// Outbound frames are queued on send and flushed by the connection's writer.
type conn struct {
	id        string // unique within the process; identifies the peer in a room
	userID    string
	name      string
	avatarURL string

	// focus state — mutated on inbound focus frames, read when building a
	// roster for a joiner. Guarded by Hub.mu.
	elementID string
	label     string

	send chan []byte
}

// peer snapshots the connection's current presence under the hub lock.
func (c *conn) peer() Peer {
	return Peer{
		ConnID:    c.id,
		UserID:    c.userID,
		Name:      c.name,
		AvatarURL: c.avatarURL,
		ElementID: c.elementID,
		Label:     c.label,
	}
}

// Hub holds the live rooms, one per project. A room is the set of connections
// currently editing that project. It is the in-process fan-out; cross-instance
// fan-out (Redis pub/sub) is added in a later stage.
type Hub struct {
	mu     sync.RWMutex
	rooms  map[string]map[*conn]struct{}
	connID atomic.Uint64 // monotonic source of per-connection ids
}

// NewHub returns an empty Hub.
func NewHub() *Hub {
	return &Hub{rooms: make(map[string]map[*conn]struct{})}
}

// nextConnID hands out a process-unique connection id.
func (h *Hub) nextConnID() string {
	return strconv.FormatUint(h.connID.Add(1), 10)
}

// join adds a connection to a project room (creating it on first use) and
// returns a snapshot of the peers already present — the joiner's initial
// roster. Adding the joiner and snapshotting the others happen under one lock so
// no concurrent join is half-seen.
func (h *Hub) join(projectID string, c *conn) []Peer {
	h.mu.Lock()
	defer h.mu.Unlock()
	room := h.rooms[projectID]
	if room == nil {
		room = make(map[*conn]struct{})
		h.rooms[projectID] = room
	}
	roster := make([]Peer, 0, len(room))
	for other := range room {
		roster = append(roster, other.peer())
	}
	room[c] = struct{}{}
	return roster
}

// leave removes a connection from a project room, dropping the room when empty.
func (h *Hub) leave(projectID string, c *conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	room := h.rooms[projectID]
	if room == nil {
		return
	}
	delete(room, c)
	if len(room) == 0 {
		delete(h.rooms, projectID)
	}
}

// setFocus records what a connection is now editing and returns the updated
// presence to relay. Empty elementID means the peer cleared its focus.
func (h *Hub) setFocus(c *conn, elementID, label string) Peer {
	h.mu.Lock()
	defer h.mu.Unlock()
	c.elementID = elementID
	c.label = label
	return c.peer()
}

// broadcast queues msg to every connection in the project room except the
// sender. It never blocks: a connection whose send buffer is full is skipped
// (it will re-sync on reconnect) rather than stalling the whole room.
func (h *Hub) broadcast(projectID string, sender *conn, msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[projectID] {
		if c == sender {
			continue
		}
		select {
		case c.send <- msg:
		default:
			// buffer full — drop; the client re-syncs from the DB on reconnect.
		}
	}
}

// RoomSize reports how many connections are in a project room. Exposed for
// tests and future metrics.
func (h *Hub) RoomSize(projectID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms[projectID])
}
