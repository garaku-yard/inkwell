package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/google/uuid"
)

// correlationIDKey is the context key for the request correlation ID.
type correlationIDKey struct{}

// CORS sets cross-origin headers and handles preflight requests. Only origins
// in allowedOrigins are echoed back; any localhost/127.0.0.1 port is additionally
// permitted when env == "development" so local front-end dev servers can talk
// to the gateway without needing to be listed explicitly. The wildcard origin
// ("*") is never emitted because this API advertises Allow-Credentials: true,
// and the two are forbidden in combination by the Fetch spec.
func CORS(allowedOrigins []string, env string) func(http.Handler) http.Handler {
	allowDevLocalhost := env == "development"
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			allowed := isAllowedOrigin(origin, allowedOrigins, allowDevLocalhost)

			// Echo the caller's origin only when it's on the allowlist. Non-CORS
			// requests (no Origin header) pass through without any ACAO response.
			if allowed && origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Add("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-ID")
			}

			if r.Method == http.MethodOptions {
				if allowed {
					w.WriteHeader(http.StatusNoContent)
				} else {
					// Disallowed preflight — reply but withhold CORS headers so the
					// browser blocks the real request.
					w.WriteHeader(http.StatusForbidden)
				}
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// isAllowedOrigin reports whether origin is on the explicit allowlist, or —
// when allowDevLocalhost is true — is any port on localhost/127.0.0.1. The
// localhost check parses the URL properly so that values such as
// "https://localhost.attacker.example" (which merely contain the substring
// "localhost") are rejected.
func isAllowedOrigin(origin string, allowed []string, allowDevLocalhost bool) bool {
	if origin == "" {
		return false
	}
	for _, o := range allowed {
		if origin == o {
			return true
		}
	}
	if !allowDevLocalhost {
		return false
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	host := u.Hostname()
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

// RequestLogger returns a middleware that logs every request with structured fields
// including a correlation ID that can be used to trace a single request through logs.
func RequestLogger() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			correlationID := uuid.New().String()

			// Attach correlation ID to context so handlers can log it.
			ctx := context.WithValue(r.Context(), correlationIDKey{}, correlationID)
			r = r.WithContext(ctx)
			w.Header().Set("X-Correlation-ID", correlationID)

			wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
			next.ServeHTTP(wrapped, r)

			slog.Info("http request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", wrapped.statusCode,
				"duration_ms", time.Since(start).Milliseconds(),
				"correlation_id", correlationID,
				"ip", realIP(r),
			)
		})
	}
}

// CorrelationID retrieves the correlation ID injected by RequestLogger from the context.
// Returns an empty string if the middleware was not applied.
func CorrelationID(ctx context.Context) string {
	if id, ok := ctx.Value(correlationIDKey{}).(string); ok {
		return id
	}
	return ""
}

// responseWriter wraps http.ResponseWriter to capture the status code for logging.
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}
