package middleware

import (
	"net/http"
	"time"

	redisPkg "inkwell/server/pkg/redis"
)

// RateLimiter enforces a fixed-window request limit per IP address using Redis counters.
// The window resets every minute. If Redis is unavailable the request is allowed through
// (fail-open) to avoid taking the service down over an infra blip.
type RateLimiter struct {
	redis *redisPkg.Client
	// rpm is the maximum requests allowed per IP per minute.
	rpm int64
}

// NewRateLimiter creates a RateLimiter with the given requests-per-minute limit.
func NewRateLimiter(redis *redisPkg.Client, rpm int) *RateLimiter {
	return &RateLimiter{redis: redis, rpm: int64(rpm)}
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
		key := "ratelimit:" + ip

		count, err := rl.redis.Incr(r.Context(), key, time.Minute)
		if err != nil {
			// Fail open — don't block users because Redis is down.
			next.ServeHTTP(w, r)
			return
		}

		w.Header().Set("X-RateLimit-Limit", "120")
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
