package middleware

import (
	"net/http"

	"inkwell/server/internal/gateway/apierror"
	"inkwell/server/internal/gateway/contextx"
)

// RequireAdmin rejects requests whose authenticated user does not carry the
// "admin" role. It must be applied inside a route group that already runs
// AuthMiddleware — the role is read from the request context populated by
// that middleware. Returns the same structured error envelope as the rest of
// the gateway so the frontend can branch on code "PERMISSION_DENIED".
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := contextx.UserIDFrom(r.Context()); !ok {
			apierror.WriteStatus(w, http.StatusUnauthorized, apierror.CodeUnauthenticated, "unauthorized")
			return
		}
		role, _ := contextx.UserRoleFrom(r.Context())
		if role != "admin" {
			apierror.WriteStatus(w, http.StatusForbidden, apierror.CodePermissionDenied, "admin role required")
			return
		}
		next.ServeHTTP(w, r)
	})
}
