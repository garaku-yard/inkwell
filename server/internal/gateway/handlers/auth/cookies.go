package auth

import (
	"net/http"
	"time"
)

// AuthCookieName is the cookie key under which the JWT access token is
// persisted in the browser. Exported so middleware and handlers stay in sync.
const AuthCookieName = "inkwell_token"

// authCookieMaxAge mirrors the identity service's default access-token TTL.
// Keeping them aligned prevents the browser cookie from outliving the token
// (or vice versa) and producing confusing 401s.
const authCookieMaxAge = 24 * time.Hour

// SetAuthCookie writes the access token to the response as an httpOnly,
// SameSite=Lax cookie. The Secure flag is set whenever the gateway is not
// running in development so production deploys can never downgrade to http.
// SameSite=Lax keeps the cookie attached to top-level navigations while
// blocking cross-site sub-requests — enough to neutralise classic CSRF
// against state-changing endpoints when combined with the Origin check
// middleware.
func SetAuthCookie(w http.ResponseWriter, token, environment string) {
	http.SetCookie(w, &http.Cookie{
		Name:     AuthCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   environment != "development",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(authCookieMaxAge.Seconds()),
	})
}

// ClearAuthCookie overwrites the auth cookie with an expired value so the
// browser discards it. Called from Logout and any other flow that should
// drop the session.
func ClearAuthCookie(w http.ResponseWriter, environment string) {
	http.SetCookie(w, &http.Cookie{
		Name:     AuthCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   environment != "development",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

// SidCookieName holds the current session's id (a user_sessions row), set
// alongside the auth token at login so the Active Sessions UI can flag "this
// device". It only identifies which session row is the caller's — it is not a
// credential on its own.
const SidCookieName = "inkwell_sid"

// SetSidCookie persists the current session id with the same posture as the
// auth cookie so the two stay in lockstep.
func SetSidCookie(w http.ResponseWriter, sessionID, environment string) {
	http.SetCookie(w, &http.Cookie{
		Name:     SidCookieName,
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		Secure:   environment != "development",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(authCookieMaxAge.Seconds()),
	})
}

// ClearSidCookie expires the session-id cookie. Called alongside
// ClearAuthCookie whenever the session is dropped.
func ClearSidCookie(w http.ResponseWriter, environment string) {
	http.SetCookie(w, &http.Cookie{
		Name:     SidCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   environment != "development",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

// sidFromRequest returns the current session id cookie value, or "".
func sidFromRequest(r *http.Request) string {
	if c, err := r.Cookie(SidCookieName); err == nil {
		return c.Value
	}
	return ""
}
