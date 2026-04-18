package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

// correlationIDKey is the context key for the request correlation ID.
type correlationIDKey struct{}

// CORS sets permissive cross-origin headers and handles preflight requests.
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")

			allowed := false
			for _, o := range allowedOrigins {
				if origin == o {
					allowed = true
					break
				}
			}
			// Allow any localhost port in development.
			if !allowed && strings.Contains(origin, "localhost") {
				allowed = true
			}

			if allowed || origin == "" {
				if origin != "" {
					w.Header().Set("Access-Control-Allow-Origin", origin)
				} else {
					w.Header().Set("Access-Control-Allow-Origin", "*")
				}
			}

			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-ID")
			w.Header().Set("Access-Control-Allow-Credentials", "true")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
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
