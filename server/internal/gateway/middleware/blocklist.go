package middleware

import (
	"context"
	"fmt"
	"time"

	redisPkg "inkwell/server/pkg/redis"
)

const blocklistKeyPrefix = "blocklist:token:"

// TokenBlocklist uses Redis to record revoked JWT tokens until they expire naturally.
// Tokens are stored under "blocklist:token:<token>" with a TTL matching the token's
// remaining lifetime, so the blocklist self-cleans without a cron job.
type TokenBlocklist struct {
	redis *redisPkg.Client
}

// NewTokenBlocklist creates a TokenBlocklist backed by the given Redis client.
func NewTokenBlocklist(redis *redisPkg.Client) *TokenBlocklist {
	return &TokenBlocklist{redis: redis}
}

// Block adds token to the blocklist with the given remaining TTL.
func (b *TokenBlocklist) Block(ctx context.Context, token string, ttl time.Duration) error {
	if ttl <= 0 {
		return nil
	}
	key := blocklistKeyPrefix + token
	return b.redis.Set(ctx, key, "1", ttl)
}

// IsBlocked reports whether token has been explicitly revoked.
func (b *TokenBlocklist) IsBlocked(ctx context.Context, token string) (bool, error) {
	key := fmt.Sprintf("%s%s", blocklistKeyPrefix, token)
	return b.redis.Exists(ctx, key)
}
