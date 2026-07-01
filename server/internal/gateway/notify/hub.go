// Package notify delivers user-level realtime notifications — a new project
// invitation today, more later — to a user's browser over a WebSocket so they
// appear without a refresh.
//
// Unlike the per-project editing socket (internal/gateway/realtime), a
// connection here joins a room keyed by the authenticated USER id and stays
// open for the whole session regardless of which project (if any) is open. The
// gateway pushes a small "something changed" frame; the client refetches the
// detail. Pushes fan out across gateway instances over Redis pub/sub so a
// notification reaches the user wherever their socket happens to live; with no
// Redis the hub is single-instance and still complete.
package notify

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	// sendBuffer bounds a connection's outbound queue; notifications are sparse,
	// so a small buffer is plenty and a stalled client is simply dropped.
	sendBuffer     = 16
	channelPrefix  = "inkwell:notify:"
	publishTimeout = 2 * time.Second
)

// conn is one live user notification socket.
type conn struct {
	userID string
	send   chan []byte
}

// envelope wraps a pushed frame for the wire with its originating instance (to
// drop our own echo) and the target user (parsed from the channel otherwise).
type envelope struct {
	Instance string          `json:"i"`
	User     string          `json:"u"`
	Data     json.RawMessage `json:"d"`
}

// Hub holds the live notification connections, one room per user id. A nil rdb
// means single-instance / no-Redis: local delivery only, which is complete for
// one gateway.
type Hub struct {
	mu         sync.RWMutex
	rooms      map[string]map[*conn]struct{}
	rdb        *redis.Client
	instanceID string
}

// NewHub builds a Hub. Pass the shared Redis client for cross-instance fan-out,
// or nil for local-only.
func NewHub(rdb *redis.Client) *Hub {
	return &Hub{
		rooms:      make(map[string]map[*conn]struct{}),
		rdb:        rdb,
		instanceID: randomID(),
	}
}

func randomID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "instance"
	}
	return hex.EncodeToString(b[:])
}

func (h *Hub) join(c *conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	room := h.rooms[c.userID]
	if room == nil {
		room = make(map[*conn]struct{})
		h.rooms[c.userID] = room
	}
	room[c] = struct{}{}
}

func (h *Hub) leave(c *conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	room := h.rooms[c.userID]
	if room == nil {
		return
	}
	delete(room, c)
	if len(room) == 0 {
		delete(h.rooms, c.userID)
	}
}

// deliverLocal queues msg to every connection the user holds on this instance.
// Non-blocking: a connection whose buffer is full is skipped.
func (h *Hub) deliverLocal(userID string, msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[userID] {
		select {
		case c.send <- msg:
		default:
		}
	}
}

// Push delivers a frame to the user's live connections on this instance and,
// when Redis is configured, mirrors it to the other gateway instances.
func (h *Hub) Push(userID string, msg []byte) {
	if userID == "" {
		return
	}
	h.deliverLocal(userID, msg)
	if h.rdb == nil {
		return
	}
	payload, err := json.Marshal(envelope{Instance: h.instanceID, User: userID, Data: msg})
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), publishTimeout)
	if err := h.rdb.Publish(ctx, channelPrefix+userID, payload).Err(); err != nil {
		slog.Warn("notify publish failed", "user", userID, "error", err)
	}
	cancel()
}

// Run subscribes to other instances' pushes and delivers them locally. It
// blocks until ctx is cancelled; a no-op when Redis is absent.
func (h *Hub) Run(ctx context.Context) {
	if h.rdb == nil {
		return
	}
	sub := h.rdb.PSubscribe(ctx, channelPrefix+"*")
	defer sub.Close()
	ch := sub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var env envelope
			if err := json.Unmarshal([]byte(msg.Payload), &env); err != nil {
				continue
			}
			if env.Instance == h.instanceID {
				continue // our own publication — already delivered locally
			}
			h.deliverLocal(env.User, env.Data)
		}
	}
}

// inviteFrame is the (constant) push for a new project invitation: a hint to
// refetch, not the invitation itself. Built once at init.
var inviteFrame = mustJSON(map[string]string{"type": "notification", "kind": "invite"})

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

// NotifyInvite pushes a "new invitation" hint to the invited user. No-op for an
// empty or all-zero (non-registered invitee) id.
func (h *Hub) NotifyInvite(userID string) {
	if userID == "" || userID == "00000000-0000-0000-0000-000000000000" {
		return
	}
	h.Push(userID, inviteFrame)
}
