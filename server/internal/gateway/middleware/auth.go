package middleware

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"scriptlith/server/pkg/grpc/identity"
)

// AuthMiddleware handles JWT authentication
type AuthMiddleware struct {
	identityClient identity.IdentityServiceClient
}

// NewAuthMiddleware creates a new auth middleware
func NewAuthMiddleware(identityServiceURL string) (*AuthMiddleware, error) {
	// Connect to identity service
	conn, err := grpc.NewClient(identityServiceURL, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}

	client := identity.NewIdentityServiceClient(conn)

	return &AuthMiddleware{
		identityClient: client,
	}, nil
}

// Middleware returns the HTTP middleware function
func (am *AuthMiddleware) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip auth for certain endpoints
		if isPublicEndpoint(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		// Get token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Authorization header required", http.StatusUnauthorized)
			return
		}

		// Extract token from "Bearer <token>" format
		tokenParts := strings.Split(authHeader, " ")
		if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
			http.Error(w, "Invalid authorization header format", http.StatusUnauthorized)
			return
		}

		token := tokenParts[1]

		// Validate token with identity service
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		resp, err := am.identityClient.ValidateToken(ctx, &identity.ValidateTokenRequest{
			AccessToken: token,
		})
		if err != nil {
			log.Printf("Token validation failed: %v", err)
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		if !resp.Valid {
			http.Error(w, "Token is invalid or expired", http.StatusUnauthorized)
			return
		}

		// Add user ID to request context
		ctx = context.WithValue(r.Context(), "userID", resp.User.Id)
		r = r.WithContext(ctx)

		// Also set it as a header for backward compatibility with existing handlers
		r.Header.Set("X-User-ID", resp.User.Id)

		next.ServeHTTP(w, r)
	})
}

// isPublicEndpoint checks if an endpoint doesn't require authentication
func isPublicEndpoint(path string) bool {
	publicPaths := []string{
		"/health",
		"/login",
		"/register",
	}

	for _, publicPath := range publicPaths {
		if path == publicPath {
			return true
		}
	}

	// Allow access to uploaded files without authentication
	if strings.HasPrefix(path, "/uploads/") {
		return true
	}

	return false
}

// GetUserIDFromRequest extracts user ID from request context
func GetUserIDFromRequest(r *http.Request) string {
	if userID, ok := r.Context().Value("userID").(string); ok {
		return userID
	}
	return ""
}
