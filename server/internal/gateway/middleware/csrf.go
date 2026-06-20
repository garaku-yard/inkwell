package middleware

import (
	"net/http"
	"net/url"
)

// OriginCheck returns a middleware that rejects state-changing requests whose
// Origin (or Referer, as a fallback) does not match one of allowedOrigins.
// Safe methods (GET, HEAD, OPTIONS) and requests with no Origin/Referer are
// passed through untouched — typical for direct API-client usage. Combined
// with SameSite=Lax auth cookies this closes the classic CSRF attack surface
// where a malicious site triggers a form POST from a logged-in browser.
//
// localhost and 127.0.0.1 are additionally permitted when env == "development"
// so local front-end dev servers on any port can exercise the API.
func OriginCheck(allowedOrigins []string, env string) func(http.Handler) http.Handler {
	allowDevLocalhost := env == "development"
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if isSafeMethod(r.Method) {
				next.ServeHTTP(w, r)
				return
			}

			// Bearer/desktop clients authenticate with a token, not the SameSite
			// session cookie, so they carry no ambient credential a malicious site
			// could ride — CSRF doesn't apply. Exempt them so the desktop webview's
			// off-allowlist origin isn't rejected.
			if isTokenClient(r) {
				next.ServeHTTP(w, r)
				return
			}

			origin := r.Header.Get("Origin")
			if origin == "" {
				// Fall back to Referer. Some browsers strip Origin on same-origin
				// POSTs; Referer is still sent. We only look at the scheme+host.
				if ref := r.Header.Get("Referer"); ref != "" {
					if u, err := url.Parse(ref); err == nil && u.Host != "" {
						origin = u.Scheme + "://" + u.Host
					}
				}
			}

			// Requests with neither Origin nor Referer are typically non-browser
			// clients — the Authorization header requirement + SameSite cookie
			// are already enough there. Block browser-like POSTs that explicitly
			// present an unknown origin.
			if origin == "" {
				next.ServeHTTP(w, r)
				return
			}

			if !isAllowedOrigin(origin, allowedOrigins, allowDevLocalhost) {
				http.Error(w, "origin not allowed", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// isSafeMethod reports whether m is one of the HTTP methods defined by RFC 7231
// as "safe" (i.e. read-only and idempotent). These are exempt from CSRF
// checking because they must not mutate state.
func isSafeMethod(m string) bool {
	switch m {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	default:
		return false
	}
}
