// Package contextx provides type-safe accessors for values stored in
// request contexts by gateway middleware. Using unexported struct keys ensures
// that only code within this package can inject or overwrite these values,
// eliminating the silent-collision risk of string-keyed context lookups.
package contextx

import (
	"context"
	"inkwell/server/pkg/grpcmeta"
)

// userIDKey is the context key under which the authenticated user's UUID is stored.
type userIDKey struct{}

// userRoleKey is the context key under which the authenticated user's
// authorisation role ("admin", "user", …) is stored.
type userRoleKey struct{}

// WithUserID returns a copy of ctx carrying the authenticated user's UUID.
// It is intended for use by the auth middleware after a successful token
// validation; handler code should read the value via UserIDFrom.
func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(grpcmeta.WithActorID(ctx, userID), userIDKey{}, userID)
}

// UserIDFrom extracts the authenticated user's UUID from ctx. The second
// return value reports whether a value was present; an empty userID with ok=true
// should be treated as an unauthenticated request.
func UserIDFrom(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(userIDKey{}).(string)
	return id, ok && id != ""
}

// WithUserRole returns a copy of ctx carrying the authenticated user's
// authorisation role. Set by the auth middleware alongside the user ID.
func WithUserRole(ctx context.Context, role string) context.Context {
	return context.WithValue(ctx, userRoleKey{}, role)
}

// UserRoleFrom extracts the authenticated user's role from ctx. The second
// return value reports whether a role was present; an empty string (with
// ok=true) reads as the default "user" role.
func UserRoleFrom(ctx context.Context) (string, bool) {
	role, ok := ctx.Value(userRoleKey{}).(string)
	return role, ok
}
