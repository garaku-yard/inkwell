package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

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
// non-public request. It checks the Redis blocklist before hitting the
// identity service so revoked tokens are rejected immediately.
func (am *AuthMiddleware) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isPublicEndpoint(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Authorization header required", http.StatusUnauthorized)
			return
		}

		tokenParts := strings.Split(authHeader, " ")
		if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
			http.Error(w, "Invalid authorization header format", http.StatusUnauthorized)
			return
		}

		token := tokenParts[1]

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

		ctx = context.WithValue(r.Context(), "userID", resp.User.Id)
		r = r.WithContext(ctx)
		r.Header.Set("X-User-ID", resp.User.Id)

		next.ServeHTTP(w, r)
	})
}

// isPublicEndpoint reports whether the path requires no authentication.
func isPublicEndpoint(path string) bool {
	publicPaths := []string{"/health", "/login", "/register", "/api/v1/login", "/api/v1/register"}
	for _, p := range publicPaths {
		if path == p {
			return true
		}
	}
	return strings.HasPrefix(path, "/uploads/")
}

// GetUserIDFromRequest extracts the authenticated user ID from the request context.
func GetUserIDFromRequest(r *http.Request) string {
	if userID, ok := r.Context().Value("userID").(string); ok {
		return userID
	}
	return ""
}
