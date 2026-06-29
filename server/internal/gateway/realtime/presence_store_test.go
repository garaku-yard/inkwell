package realtime

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// presenceTestStore connects to the Redis named by REDIS_TEST_ADDR, skipping the
// test when it is unset so CI (no Redis) stays green. Run locally with e.g.
// REDIS_TEST_ADDR=127.0.0.1:6379 REDIS_TEST_PASSWORD=redis go test ./...
func presenceTestStore(t *testing.T) (*PresenceStore, string) {
	t.Helper()
	addr := os.Getenv("REDIS_TEST_ADDR")
	if addr == "" {
		t.Skip("REDIS_TEST_ADDR not set — skipping presence-store Redis test")
	}
	rdb := redis.NewClient(&redis.Options{Addr: addr, Password: os.Getenv("REDIS_TEST_PASSWORD")})
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		t.Skipf("Redis at %s unreachable: %v", addr, err)
	}
	// A per-run project id keeps tests isolated from each other and prior runs.
	projectID := fmt.Sprintf("test-%d", time.Now().UnixNano())
	t.Cleanup(func() { rdb.Close() })
	return NewPresenceStore(rdb), projectID
}

func TestPresenceStoreRosterRoundTrip(t *testing.T) {
	s, pid := presenceTestStore(t)
	ctx := context.Background()

	a := Peer{ConnID: "a", UserID: "ua", Name: "Ada"}
	b := Peer{ConnID: "b", UserID: "ub", Name: "Babbage", ElementID: "el-1", Label: "Intro"}
	if err := s.Add(ctx, pid, a); err != nil {
		t.Fatalf("add a: %v", err)
	}
	if err := s.Add(ctx, pid, b); err != nil {
		t.Fatalf("add b: %v", err)
	}
	t.Cleanup(func() {
		_ = s.Remove(ctx, pid, "a")
		_ = s.Remove(ctx, pid, "b")
	})

	// From a's perspective the roster is just b, with b's focus intact.
	roster, err := s.Roster(ctx, pid, "a")
	if err != nil {
		t.Fatalf("roster: %v", err)
	}
	if len(roster) != 1 || roster[0].ConnID != "b" || roster[0].Label != "Intro" {
		t.Fatalf("roster = %+v, want [b editing Intro]", roster)
	}

	// A focus update is reflected on the next read.
	b.ElementID, b.Label = "el-2", "Forest"
	if err := s.Update(ctx, pid, b); err != nil {
		t.Fatalf("update b: %v", err)
	}
	roster, _ = s.Roster(ctx, pid, "a")
	if len(roster) != 1 || roster[0].Label != "Forest" {
		t.Fatalf("after update roster = %+v, want b editing Forest", roster)
	}

	// A clean removal drops the peer from everyone's roster.
	if err := s.Remove(ctx, pid, "b"); err != nil {
		t.Fatalf("remove b: %v", err)
	}
	if roster, _ = s.Roster(ctx, pid, "a"); len(roster) != 0 {
		t.Fatalf("after remove roster = %+v, want empty", roster)
	}
}

func TestPresenceStorePrunesExpiredEntries(t *testing.T) {
	s, pid := presenceTestStore(t)
	ctx := context.Background()

	if err := s.Add(ctx, pid, Peer{ConnID: "ghost", UserID: "ug", Name: "Ghost"}); err != nil {
		t.Fatalf("add: %v", err)
	}
	t.Cleanup(func() { _ = s.Remove(ctx, pid, "ghost") })

	// Simulate a crashed connection: its presence key expires but the index
	// entry lingers until a roster read prunes it.
	if err := s.rdb.Del(ctx, presenceKey(pid, "ghost")).Err(); err != nil {
		t.Fatalf("expire key: %v", err)
	}
	roster, err := s.Roster(ctx, pid, "")
	if err != nil {
		t.Fatalf("roster: %v", err)
	}
	if len(roster) != 0 {
		t.Fatalf("roster = %+v, want empty (ghost pruned)", roster)
	}
	// The stale index entry must have been pruned.
	if members, _ := s.rdb.SMembers(ctx, presenceIndex(pid)).Result(); len(members) != 0 {
		t.Fatalf("index still has %v, want pruned", members)
	}
}
