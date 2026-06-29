package realtime

import "time"

// Per-connection inbound-frame budget. Live editing is bursty but bounded:
// the client debounces edit frames (~150ms ⇒ ~7/s) plus the occasional focus
// change, so a sustained 20/s with a 40-frame burst is comfortably above
// honest use while capping what a single misbehaving or malicious socket can
// make the room (and Redis) do. Over-budget frames are dropped, not fatal —
// the sender's autosave and reconnect resync recover anything lost.
const (
	editBucketCapacity = 40
	editBucketRefill   = 20 // tokens per second
)

// tokenBucket is a minimal token-bucket rate limiter. It is not safe for
// concurrent use: each connection owns one, touched only by its read pump.
type tokenBucket struct {
	tokens   float64
	capacity float64
	refill   float64 // tokens added per second
	last     time.Time
}

// newTokenBucket returns a full bucket with the given capacity and refill rate.
func newTokenBucket(capacity, refillPerSec float64, now time.Time) *tokenBucket {
	return &tokenBucket{tokens: capacity, capacity: capacity, refill: refillPerSec, last: now}
}

// allow refills the bucket for the time elapsed since the last call and, if at
// least one token is available, consumes it and returns true. now is passed in
// so callers (and tests) control the clock.
func (b *tokenBucket) allow(now time.Time) bool {
	elapsed := now.Sub(b.last).Seconds()
	if elapsed > 0 {
		b.tokens += elapsed * b.refill
		if b.tokens > b.capacity {
			b.tokens = b.capacity
		}
		b.last = now
	}
	if b.tokens >= 1 {
		b.tokens--
		return true
	}
	return false
}
