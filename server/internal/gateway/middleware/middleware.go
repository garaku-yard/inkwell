package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"inkwell/server/pkg/grpcmeta"
)

// correlationIDKey is the context key for the request correlation ID.
type correlationIDKey struct{}

// clientHeader / clientDesktop mirror the constants in handlers/auth (duplicated
// to avoid an import cycle). A request carrying X-Inkwell-Client: desktop is the
// native app, which authenticates with a bearer token instead of the session
// cookie.
const (
	clientHeader  = "X-Inkwell-Client"
	clientDesktop = "desktop"
)

// isTokenClient reports whether a request authenticates with a bearer token
// rather than the browser session cookie — either the native desktop client
// (X-Inkwell-Client: desktop) or any caller presenting an Authorization header.
// Such clients carry no ambient cookie, so they are immune to CSRF and need no
// credentialed CORS: they may skip the Origin allowlist and have their origin
// echoed without Access-Control-Allow-Credentials.
//
// CORS preflights carry neither header (the browser strips them), so intent is
// inferred from the headers the real request advertises via
// Access-Control-Request-Headers.
func isTokenClient(r *http.Request) bool {
	if r.Header.Get("Authorization") != "" || r.Header.Get(clientHeader) == clientDesktop {
		return true
	}
	acrh := strings.ToLower(r.Header.Get("Access-Control-Request-Headers"))
	return strings.Contains(acrh, "authorization") || strings.Contains(acrh, strings.ToLower(clientHeader))
}

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
			tokenClient := isTokenClient(r)

			switch {
			case allowed && origin != "":
				// Browser on the allowlist — credentialed CORS so the httpOnly
				// session cookie flows.
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Add("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-ID, X-Inkwell-Client")
			case tokenClient && origin != "":
				// Bearer-authenticated native client (e.g. the desktop webview's
				// exotic tauri://localhost origin). Echo the origin so the webview
				// can read the response, but WITHOUT Allow-Credentials — token auth
				// carries no cookie, so reflecting an off-allowlist origin here is
				// safe and grants no ambient-credential access.
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Add("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-ID, X-Inkwell-Client")
			}

			if r.Method == http.MethodOptions {
				if (allowed || tokenClient) && origin != "" {
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
			ctx = grpcmeta.WithCorrelationID(ctx, correlationID)
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

// Flush preserves streaming support through the logging wrapper.
func (rw *responseWriter) Flush() {
	if flusher, ok := rw.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

// Unwrap exposes the underlying ResponseWriter so http.ResponseController can
// reach capabilities this wrapper doesn't implement directly — notably the
// Hijacker a WebSocket upgrade needs. Without it, the logging wrapper would
// hide the connection from the upgrade path.
func (rw *responseWriter) Unwrap() http.ResponseWriter {
	return rw.ResponseWriter
}
