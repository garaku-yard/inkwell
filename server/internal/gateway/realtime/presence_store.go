package realtime

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

// PresenceStore keeps the cluster-wide roster in Redis so a joiner sees everyone
// editing a project, not just the peers on its own gateway instance (the hub's
// local rooms cover delivery; this covers the join-time snapshot). Each
// connection is one key with a TTL, indexed in a per-project set:
//
//	rt:presence:{projectID}:{connID}  → peer JSON, expiring after presenceTTL
//	rt:presence:idx:{projectID}       → set of that project's connIDs
//
// A clean disconnect deletes its key; a crashed instance's keys simply expire,
// and the stale index entries are pruned lazily on the next roster read. Live
// connections refresh their TTL on each heartbeat.
type PresenceStore struct {
	rdb *redis.Client
}

// presenceTTL is how long a connection's presence survives without a refresh —
// generous against the heartbeat interval so a delayed refresh never evicts a
// live peer (heartbeat is 30s; this tolerates two missed refreshes).
const presenceTTL = 90 * time.Second

// NewPresenceStore wraps a Redis client, or returns nil when Redis is absent so
// callers fall back to the hub's local roster.
func NewPresenceStore(rdb *redis.Client) *PresenceStore {
	if rdb == nil {
		return nil
	}
	return &PresenceStore{rdb: rdb}
}

func presenceKey(projectID, connID string) string { return "rt:presence:" + projectID + ":" + connID }
func presenceIndex(projectID string) string       { return "rt:presence:idx:" + projectID }

// Add records a connection's presence and indexes it under the project.
func (s *PresenceStore) Add(ctx context.Context, projectID string, p Peer) error {
	data, err := json.Marshal(p)
	if err != nil {
		return err
	}
	pipe := s.rdb.TxPipeline()
	pipe.SAdd(ctx, presenceIndex(projectID), p.ConnID)
	pipe.Set(ctx, presenceKey(projectID, p.ConnID), data, presenceTTL)
	_, err = pipe.Exec(ctx)
	return err
}

// Update rewrites a connection's presence (e.g. after a focus change), resetting
// the TTL.
func (s *PresenceStore) Update(ctx context.Context, projectID string, p Peer) error {
	data, err := json.Marshal(p)
	if err != nil {
		return err
	}
	return s.rdb.Set(ctx, presenceKey(projectID, p.ConnID), data, presenceTTL).Err()
}

// Refresh extends a live connection's TTL; called on each heartbeat.
func (s *PresenceStore) Refresh(ctx context.Context, projectID, connID string) error {
	return s.rdb.Expire(ctx, presenceKey(projectID, connID), presenceTTL).Err()
}

// Remove deletes a connection's presence and de-indexes it on a clean disconnect.
func (s *PresenceStore) Remove(ctx context.Context, projectID, connID string) error {
	pipe := s.rdb.TxPipeline()
	pipe.SRem(ctx, presenceIndex(projectID), connID)
	pipe.Del(ctx, presenceKey(projectID, connID))
	_, err := pipe.Exec(ctx)
	return err
}

// Roster returns every live peer in the project except exceptConnID, pruning
// index entries whose presence key has expired (a crashed connection).
func (s *PresenceStore) Roster(ctx context.Context, projectID, exceptConnID string) ([]Peer, error) {
	connIDs, err := s.rdb.SMembers(ctx, presenceIndex(projectID)).Result()
	if err != nil {
		return nil, err
	}
	pipe := s.rdb.Pipeline()
	gets := make([]*redis.StringCmd, len(connIDs))
	for i, id := range connIDs {
		gets[i] = pipe.Get(ctx, presenceKey(projectID, id))
	}
	// Exec surfaces the first redis.Nil; per-command results are read below.
	if _, err := pipe.Exec(ctx); err != nil && err != redis.Nil {
		return nil, err
	}

	peers := make([]Peer, 0, len(connIDs))
	var stale []string
	for i, id := range connIDs {
		val, err := gets[i].Result()
		if err == redis.Nil {
			stale = append(stale, id) // key expired — drop from the index
			continue
		}
		if err != nil || id == exceptConnID {
			continue
		}
		var p Peer
		if json.Unmarshal([]byte(val), &p) == nil {
			peers = append(peers, p)
		}
	}
	if len(stale) > 0 {
		_ = s.rdb.SRem(ctx, presenceIndex(projectID), stale).Err()
	}
	return peers, nil
}
