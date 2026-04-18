// Package redis provides a thin wrapper around the Redis client for use across services.
package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Client wraps a Redis connection and exposes the operations used by Inkwell services.
type Client struct {
	rdb *redis.Client
}

// Config holds Redis connection settings.
type Config struct {
	Host     string
	Port     string
	Password string
	DB       int
}

// New creates a new Client and pings the server to verify connectivity.
func New(cfg Config) (*Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", cfg.Host, cfg.Port),
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis: ping failed: %w", err)
	}

	return &Client{rdb: rdb}, nil
}

// Set stores a key-value pair with an optional expiry (0 = no expiry).
func (c *Client) Set(ctx context.Context, key, value string, ttl time.Duration) error {
	return c.rdb.Set(ctx, key, value, ttl).Err()
}

// Get retrieves the value for a key. Returns ("", false, nil) when the key does not exist.
func (c *Client) Get(ctx context.Context, key string) (string, bool, error) {
	val, err := c.rdb.Get(ctx, key).Result()
	if err == redis.Nil {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return val, true, nil
}

// Exists reports whether one or more keys are present.
func (c *Client) Exists(ctx context.Context, keys ...string) (bool, error) {
	n, err := c.rdb.Exists(ctx, keys...).Result()
	return n > 0, err
}

// Delete removes one or more keys.
func (c *Client) Delete(ctx context.Context, keys ...string) error {
	return c.rdb.Del(ctx, keys...).Err()
}

// Incr atomically increments a counter and sets its TTL if the key is new.
// Useful for sliding-window rate limiting.
func (c *Client) Incr(ctx context.Context, key string, ttl time.Duration) (int64, error) {
	pipe := c.rdb.TxPipeline()
	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, ttl)
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, err
	}
	return incr.Val(), nil
}

// Close gracefully closes the connection.
func (c *Client) Close() error {
	return c.rdb.Close()
}
