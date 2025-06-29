package middleware

import (
	"context"
	"net/http"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v4"
)

type contextKey string

const UserIDKey contextKey = "userID"

func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, `{"error": "Authorization header required"}`, http.StatusUnauthorized)
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			http.Error(w, `{"error": "Invalid token format"}`, http.StatusUnauthorized)
			return
		}

		jwtSecret := os.Getenv("JWT_SECRET")
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, http.ErrAbortHandler
			}
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			http.Error(w, `{"error": "Invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			// The 'sub' claim (subject) now holds the user ID as a string (UUID).
			if sub, ok := claims["sub"].(string); ok {
				// We still need to parse it to a UUID type for type safety internally,
				// but for the context value, a string is fine.
				ctx := context.WithValue(r.Context(), UserIDKey, sub)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}

		http.Error(w, `{"error": "Could not process token"}`, http.StatusUnauthorized)
	})
}
