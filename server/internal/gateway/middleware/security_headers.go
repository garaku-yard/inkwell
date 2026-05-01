package middleware

import "net/http"

// SecurityHeaders is a conservative set of response headers that harden
// the gateway against common web threats. The Content-Security-Policy
// value is deliberately strict:
//
//   - `default-src 'none'` — nothing loads unless explicitly allowed.
//   - `script-src 'self'` — only scripts served from our origin run; no
//     inline scripts, no eval. If the Next.js build ever emits inline
//     bootstrap scripts this will break at page load and the fix is to
//     hash/nonce them rather than loosen the policy.
//   - `connect-src 'self' https://api.anthropic.com https://api.openai.com
//      https://generativelanguage.googleapis.com` — BYO direct-browser
//     calls go here. Add hosts as new hosted providers land; local-model
//     endpoints need their own entries if you want a host allowlist.
//   - `img-src 'self' data: blob:` — inline SVG data URLs + blob: for
//     in-memory exports.
//   - `style-src 'self' 'unsafe-inline'` — Tailwind atomic classes are
//     served via a stylesheet, but shadcn components ship a handful of
//     inline `style` attributes we don't control.
//
// Other headers:
//   - Referrer-Policy: no referrer leakage to third parties.
//   - X-Content-Type-Options: nosniff for good measure.
//   - Permissions-Policy: block camera/mic/geolocation on the app origin.
func SecurityHeaders() func(http.Handler) http.Handler {
	const csp = "default-src 'none'; " +
		"script-src 'self'; " +
		"style-src 'self' 'unsafe-inline'; " +
		"img-src 'self' data: blob:; " +
		"font-src 'self' data:; " +
		"connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com; " +
		"frame-ancestors 'none'; " +
		"base-uri 'self'; " +
		"form-action 'self'"

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("Content-Security-Policy", csp)
			h.Set("Referrer-Policy", "no-referrer")
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
			next.ServeHTTP(w, r)
		})
	}
}
