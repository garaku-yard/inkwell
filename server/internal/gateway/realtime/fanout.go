package realtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// Fanout propagates room frames between gateway instances over Redis pub/sub, so
// two users editing the same project through different gateways still see each
// other. Each project has its own channel (rt:project:{id}); every instance
// pattern-subscribes once and ignores its own publications (tagged with the
// instance id) to avoid an echo loop. Local fan-out stays in-process and
// Redis-independent — Redis only carries the cross-instance hop, so a single
// instance (or a Redis outage) loses nothing but cross-instance delivery.
type Fanout struct {
	rdb        *redis.Client
	instanceID string
	out        chan outboundMsg
}

// outboundMsg is one frame queued for publication.
type outboundMsg struct {
	projectID string
	data      []byte
}

// envelope wraps a frame for the wire with its originating instance so the
// receiver can drop its own echoes. Data is the raw frame, embedded as-is.
type envelope struct {
	Instance string          `json:"i"`
	Data     json.RawMessage `json:"d"`
}

const (
	channelPrefix = "rt:project:"
	// outBuffer bounds queued publications; a backed-up publisher drops rather
	// than stalling the read pump (the DB + reconnect re-sync cover the gap).
	outBuffer = 256
	// publishTimeout caps a single PUBLISH so a slow Redis can't wedge the
	// publisher goroutine.
	publishTimeout = 2 * time.Second
)

// NewFanout builds a Fanout over the given Redis client and starts its
// publisher goroutine. It returns nil if rdb is nil, so callers can wire it
// unconditionally and get local-only behaviour when Redis is absent.
func NewFanout(rdb *redis.Client) *Fanout {
	if rdb == nil {
		return nil
	}
	f := &Fanout{
		rdb:        rdb,
		instanceID: newInstanceID(),
		out:        make(chan outboundMsg, outBuffer),
	}
	go f.publishLoop()
	return f
}

// newInstanceID returns a random per-process id used to recognise and drop this
// instance's own publications.
func newInstanceID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		// rand failing is near-impossible; a constant id only risks an instance
		// briefly echoing to itself, which is harmless (clients ignore dupes).
		return "instance"
	}
	return hex.EncodeToString(b[:])
}

// Publish queues a frame for cross-instance delivery on the project's channel.
// It never blocks: if the publish buffer is full the frame is dropped.
func (f *Fanout) Publish(projectID string, data []byte) {
	select {
	case f.out <- outboundMsg{projectID: projectID, data: data}:
	default:
		slog.Warn("realtime fanout buffer full — dropping frame", "project", projectID)
	}
}

// publishLoop drains queued frames to Redis, wrapping each in an instance-tagged
// envelope on its project channel.
func (f *Fanout) publishLoop() {
	for msg := range f.out {
		payload, err := json.Marshal(envelope{Instance: f.instanceID, Data: msg.data})
		if err != nil {
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), publishTimeout)
		if err := f.rdb.Publish(ctx, channelFor(msg.projectID), payload).Err(); err != nil {
			slog.Warn("realtime fanout publish failed", "project", msg.projectID, "error", err)
		}
		cancel()
	}
}

// Run subscribes to every project channel and delivers frames from other
// instances via deliver(projectID, data). It blocks until ctx is cancelled.
func (f *Fanout) Run(ctx context.Context, deliver func(projectID string, data []byte)) {
	sub := f.rdb.PSubscribe(ctx, channelPrefix+"*")
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
			f.dispatch(msg.Channel, []byte(msg.Payload), deliver)
		}
	}
}

// dispatch decodes one wire message, drops this instance's own echoes, and hands
// the frame to deliver keyed by the project parsed from the channel name.
func (f *Fanout) dispatch(channel string, payload []byte, deliver func(projectID string, data []byte)) {
	var env envelope
	if err := json.Unmarshal(payload, &env); err != nil {
		return
	}
	if env.Instance == f.instanceID {
		return // our own publication, already delivered locally
	}
	projectID, ok := projectIDFromChannel(channel)
	if !ok {
		return
	}
	deliver(projectID, env.Data)
}

// channelFor returns the pub/sub channel for a project.
func channelFor(projectID string) string {
	return channelPrefix + projectID
}

// projectIDFromChannel extracts the project id from a channel name, reporting
// false for anything that isn't a project channel.
func projectIDFromChannel(channel string) (string, bool) {
	if !strings.HasPrefix(channel, channelPrefix) {
		return "", false
	}
	id := strings.TrimPrefix(channel, channelPrefix)
	if id == "" {
		return "", false
	}
	return id, true
}
