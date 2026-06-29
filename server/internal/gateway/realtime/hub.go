// Package realtime provides the WebSocket layer for live collaborative editing.
// It terminates project editing sessions at the gateway and fans changes out to
// everyone else in the same project. Stage 1 was the transport + room hub; this
// stage adds the message protocol and presence (who is in the room and what
// they are editing). Redis cross-instance fan-out lands in a later stage.
package realtime

import (
	"crypto/rand"
	"encoding/hex"
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
	projectID string // the room this connection belongs to
	userID    string
	name      string
	avatarURL string

	// focus state — mutated on inbound focus frames, read when building a
	// roster for a joiner. Guarded by Hub.mu.
	elementID string
	label     string

	// limiter caps inbound frames; touched only by this conn's read pump.
	limiter *tokenBucket

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

// publisher propagates a room frame to other gateway instances. It is satisfied
// by *Fanout; the hub holds it as an interface so it stays Redis-agnostic and
// testable, and treats a nil publisher as "single instance — local fan-out only".
type publisher interface {
	Publish(projectID string, data []byte)
}

// Hub holds the live rooms, one per project. A room is the set of connections
// currently editing that project. It is the in-process fan-out; when a publisher
// is set it also mirrors every broadcast to the other gateway instances.
type Hub struct {
	mu       sync.RWMutex
	rooms    map[string]map[*conn]struct{}
	connID   atomic.Uint64 // monotonic source of per-connection ids
	idPrefix string        // random per-process prefix; keeps conn ids unique cluster-wide
	pub      publisher     // cross-instance fan-out; nil ⇒ local-only
}

// NewHub returns an empty Hub with a random id prefix, so connection ids stay
// unique across gateway instances that share a Redis presence store (a bare
// per-process counter would collide — both instances start at 1).
func NewHub() *Hub {
	return &Hub{rooms: make(map[string]map[*conn]struct{}), idPrefix: randomPrefix()}
}

// randomPrefix returns a short random hex string, or "h" if the system RNG
// fails (collisions only risk a momentary roster glitch, never corruption).
func randomPrefix() string {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "h"
	}
	return hex.EncodeToString(b[:])
}

// nextConnID hands out a connection id unique across the cluster.
func (h *Hub) nextConnID() string {
	return h.idPrefix + "-" + strconv.FormatUint(h.connID.Add(1), 10)
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

// broadcast delivers msg to the local room (sender excluded) and, when a
// publisher is set, mirrors it to the other gateway instances. This is the
// single choke point every room frame passes through, so presence and edits
// fan out cross-instance uniformly.
func (h *Hub) broadcast(projectID string, sender *conn, msg []byte) {
	h.deliverLocal(projectID, sender, msg)
	if h.pub != nil {
		h.pub.Publish(projectID, msg)
	}
}

// deliverLocal queues msg to every connection in the project room except the
// sender. It never blocks: a connection whose send buffer is full is skipped
// (it will re-sync on reconnect) rather than stalling the whole room.
func (h *Hub) deliverLocal(projectID string, sender *conn, msg []byte) {
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

// deliverRemote fans a frame that arrived from another instance out to the local
// room. There is no local sender to exclude (the author is on the origin
// instance), and it is never re-published — that would loop.
func (h *Hub) deliverRemote(projectID string, msg []byte) {
	h.deliverLocal(projectID, nil, msg)
}

// RoomSize reports how many connections are in a project room. Exposed for
// tests and future metrics.
func (h *Hub) RoomSize(projectID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms[projectID])
}
