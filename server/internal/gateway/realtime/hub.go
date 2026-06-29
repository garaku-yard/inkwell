// Package realtime provides the WebSocket layer for live collaborative editing.
// It terminates project editing sessions at the gateway and fans changes out to
// everyone else in the same project. Stage 1 is the transport + room hub; the
// message protocol, presence, and Redis cross-instance fan-out land in later
// stages.
package realtime

import "sync"

// conn is one live editing session — a single user's WebSocket. Outbound frames
// are queued on send and flushed by the connection's writer goroutine.
type conn struct {
	userID string
	send   chan []byte
}

// Hub holds the live rooms, one per project. A room is the set of connections
// currently editing that project. It is the in-process fan-out; cross-instance
// fan-out (Redis pub/sub) is added in a later stage.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]map[*conn]struct{}
}

// NewHub returns an empty Hub.
func NewHub() *Hub {
	return &Hub{rooms: make(map[string]map[*conn]struct{})}
}

// join adds a connection to a project room, creating the room on first use.
func (h *Hub) join(projectID string, c *conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	room := h.rooms[projectID]
	if room == nil {
		room = make(map[*conn]struct{})
		h.rooms[projectID] = room
	}
	room[c] = struct{}{}
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
