package realtime

import "github.com/redis/go-redis/v9"

// Cluster bundles the two Redis-backed pieces that make realtime work across
// gateway instances: the pub/sub Fanout (live delta delivery) and the
// PresenceStore (cluster-wide join-time roster). It is built once from the
// shared Redis client and handed to the realtime Handler; a nil Cluster means
// single-instance / no-Redis, where the in-process hub is already complete.
type Cluster struct {
	Fanout   *Fanout
	Presence *PresenceStore
}

// NewCluster builds the cross-instance plumbing over rdb, or returns nil when
// Redis is absent so the caller runs local-only.
func NewCluster(rdb *redis.Client) *Cluster {
	if rdb == nil {
		return nil
	}
	return &Cluster{
		Fanout:   NewFanout(rdb),
		Presence: NewPresenceStore(rdb),
	}
}
