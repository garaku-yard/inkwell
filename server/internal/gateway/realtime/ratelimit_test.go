package realtime

import (
	"testing"
	"time"
)

func TestTokenBucketBurstThenThrottle(t *testing.T) {
	t0 := time.Unix(0, 0)
	b := newTokenBucket(5, 10, t0) // capacity 5, 10/s

	// The full bucket allows a burst up to capacity at the same instant.
	for i := 0; i < 5; i++ {
		if !b.allow(t0) {
			t.Fatalf("burst frame %d should be allowed", i)
		}
	}
	// The sixth, with no time elapsed, is over budget.
	if b.allow(t0) {
		t.Fatal("frame past capacity should be dropped")
	}
}

func TestTokenBucketRefillsOverTime(t *testing.T) {
	t0 := time.Unix(0, 0)
	b := newTokenBucket(5, 10, t0)
	for i := 0; i < 5; i++ {
		b.allow(t0) // drain
	}
	if b.allow(t0) {
		t.Fatal("bucket should be empty")
	}
	// 200ms at 10/s ⇒ 2 tokens refilled.
	t1 := t0.Add(200 * time.Millisecond)
	if !b.allow(t1) || !b.allow(t1) {
		t.Fatal("two refilled tokens should be allowed")
	}
	if b.allow(t1) {
		t.Fatal("only two tokens should have refilled")
	}
}

func TestTokenBucketRefillCappedAtCapacity(t *testing.T) {
	t0 := time.Unix(0, 0)
	b := newTokenBucket(3, 10, t0)
	b.allow(t0) // 2 left
	// A long idle refills, but never beyond capacity.
	tLater := t0.Add(10 * time.Second)
	for i := 0; i < 3; i++ {
		if !b.allow(tLater) {
			t.Fatalf("capacity frame %d should be allowed after idle", i)
		}
	}
	if b.allow(tLater) {
		t.Fatal("bucket must not exceed capacity even after a long idle")
	}
}
