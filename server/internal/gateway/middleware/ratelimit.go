package middleware

import (
	"net/http"
	"strconv"
	"time"

	"inkwell/server/internal/gateway/contextx"
	redisPkg "inkwell/server/pkg/redis"
)

// RateLimiter enforces a fixed-window request limit per IP address using Redis counters.
// The window resets every minute. If Redis is unavailable the request is allowed through
// (fail-open) to avoid taking the service down over an infra blip. Each limiter uses
// its own Redis key prefix so counters for different buckets (e.g. global vs. auth)
// don't pollute each other.
type RateLimiter struct {
	redis  *redisPkg.Client
	rpm    int64
	prefix string
}

// NewRateLimiter creates a RateLimiter with the given requests-per-minute limit and
// the default "ratelimit" key prefix.
func NewRateLimiter(redis *redisPkg.Client, rpm int) *RateLimiter {
	return &RateLimiter{redis: redis, rpm: int64(rpm), prefix: "ratelimit"}
}

// NewNamedRateLimiter creates a RateLimiter whose counters are stored under the given
// Redis key prefix. Use this for per-endpoint buckets (login, register, password
// change) so a flood against one doesn't consume the global quota.
func NewNamedRateLimiter(redis *redisPkg.Client, rpm int, prefix string) *RateLimiter {
	if prefix == "" {
		prefix = "ratelimit"
	}
	return &RateLimiter{redis: redis, rpm: int64(rpm), prefix: prefix}
}

// Middleware returns an HTTP middleware that rejects requests exceeding the rate limit
// with 429 Too Many Requests.
func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if rl.rpm <= 0 {
			next.ServeHTTP(w, r)
			return
		}

		ip := realIP(r)
		key := rl.prefix + ":" + ip

		count, err := rl.redis.Incr(r.Context(), key, time.Minute)
		if err != nil {
			// Fail open — don't block users because Redis is down.
			next.ServeHTTP(w, r)
			return
		}

		w.Header().Set("X-RateLimit-Limit", strconv.FormatInt(rl.rpm, 10))
		if count > rl.rpm {
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// UserMiddleware returns an HTTP middleware that enforces the rate limit
// per authenticated user instead of per source IP. This is the right
// bucket for endpoints where a single account can inflict real costs
// (provider bills on /api/ai/chat, enumeration on /api/ai/settings/{id})
// regardless of how many IPs the request arrives from.
//
// It must run AFTER AuthMiddleware so the userID is present in the
// context. When no userID is found — which shouldn't happen on protected
// routes but would be ambiguous otherwise — the limiter falls back to
// the IP key to avoid letting unauthenticated traffic bypass the quota
// entirely.
func (rl *RateLimiter) UserMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if rl.rpm <= 0 {
			next.ServeHTTP(w, r)
			return
		}

		bucket := ""
		if userID, ok := contextx.UserIDFrom(r.Context()); ok && userID != "" {
			bucket = "user:" + userID
		} else {
			bucket = "ip:" + realIP(r)
		}
		key := rl.prefix + ":" + bucket

		count, err := rl.redis.Incr(r.Context(), key, time.Minute)
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}

		w.Header().Set("X-RateLimit-Limit", strconv.FormatInt(rl.rpm, 10))
		if count > rl.rpm {
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// realIP extracts the client IP, respecting common reverse-proxy headers.
func realIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		return ip
	}
	return r.RemoteAddr
}
