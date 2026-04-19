package handlers

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
