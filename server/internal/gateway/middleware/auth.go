package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/pkg/grpc/identity"
)

// AuthMiddleware validates JWT tokens on every protected request and rejects
// tokens that have been explicitly revoked via the TokenBlocklist.
type AuthMiddleware struct {
	identityClient identity.IdentityServiceClient
	blocklist      *TokenBlocklist
}

// NewAuthMiddleware creates a new AuthMiddleware. blocklist may be nil, in which
// case revocation checks are skipped (useful in tests without Redis).
func NewAuthMiddleware(identityServiceURL string, blocklist *TokenBlocklist) (*AuthMiddleware, error) {
	conn, err := grpc.NewClient(identityServiceURL, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}

	return &AuthMiddleware{
		identityClient: identity.NewIdentityServiceClient(conn),
		blocklist:      blocklist,
	}, nil
}

// Middleware returns the HTTP middleware function that authenticates every
// non-public request. The JWT is read from the "inkwell_token" httpOnly cookie
// first (browser flow) and falls back to an Authorization: Bearer header for
// API clients and tests. The Redis blocklist is checked before hitting the
// identity service so revoked tokens are rejected immediately.
func (am *AuthMiddleware) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isPublicEndpoint(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		token := tokenFromRequest(r)
		if token == "" {
			http.Error(w, "Authorization header or session cookie required", http.StatusUnauthorized)
			return
		}

		// Fast path: reject explicitly revoked tokens without hitting identity service.
		if am.blocklist != nil {
			blocked, err := am.blocklist.IsBlocked(r.Context(), token)
			if err != nil {
				slog.Warn("blocklist check failed, proceeding", "error", err)
			} else if blocked {
				http.Error(w, "Token has been revoked", http.StatusUnauthorized)
				return
			}
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		resp, err := am.identityClient.ValidateToken(ctx, &identity.ValidateTokenRequest{
			AccessToken: token,
		})
		if err != nil {
			slog.Warn("token validation failed", "error", err)
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		if !resp.Valid {
			http.Error(w, "Token is invalid or expired", http.StatusUnauthorized)
			return
		}

		ctx2 := contextx.WithUserID(r.Context(), resp.User.Id)
		ctx2 = contextx.WithUserRole(ctx2, resp.User.Role)
		next.ServeHTTP(w, r.WithContext(ctx2))
	})
}

// isPublicEndpoint reports whether the path requires no authentication.
func isPublicEndpoint(path string) bool {
	publicPaths := []string{"/health", "/api/v1/login", "/api/v1/register"}
	for _, p := range publicPaths {
		if path == p {
			return true
		}
	}
	return strings.HasPrefix(path, "/uploads/")
}

// AuthCookieName mirrors handlers.AuthCookieName. It is duplicated here so the
// middleware package does not depend on the handlers package (which depends on
// middleware for the blocklist — that direction only). Keep the two in sync.
const AuthCookieName = "inkwell_token"

// tokenFromRequest returns the JWT access token carried by r, preferring the
// session cookie over the Authorization header.
func tokenFromRequest(r *http.Request) string {
	if c, err := r.Cookie(AuthCookieName); err == nil && c.Value != "" {
		return c.Value
	}
	header := r.Header.Get("Authorization")
	if header == "" {
		return ""
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || parts[0] != "Bearer" {
		return ""
	}
	return parts[1]
}

// GetUserIDFromRequest extracts the authenticated user ID from the request context.
// Returns an empty string if no authenticated user is attached.
func GetUserIDFromRequest(r *http.Request) string {
	id, _ := contextx.UserIDFrom(r.Context())
	return id
}
