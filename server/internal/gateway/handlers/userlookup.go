package handlers

import (
	"context"
	"fmt"
	"strings"
	"time"

	"inkwell/server/pkg/grpc/identity"
)

// ResolveEmailOrTag normalises an invitation-target string into an email address
// suitable for forwarding to any invite-accepting service (collaboration,
// workspace, etc.). It accepts three input formats:
//
//   - A plain email (contains `@` but doesn't start with it): returned as-is.
//   - `@username`: looked up via identity service with the username used as
//     both `username` and `user_tag` — the identity service returns a match on
//     either the username alone or the username#tag pair.
//   - `username#tag`: split on `#` and looked up via identity service.
//
// The function is a method-free helper so any gateway handler holding an
// identity client can reuse it; the collaboration and workspace handlers both
// do. Network calls use a 3-second timeout to keep invitation latency bounded
// even when identity is under load.
func ResolveEmailOrTag(ctx context.Context, identityClient identity.IdentityServiceClient, input string) (string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return "", fmt.Errorf("invitation target is required")
	}

	// Plain email: contains @ but isn't an @username handle.
	if strings.Contains(input, "@") && !strings.HasPrefix(input, "@") {
		return input, nil
	}

	// @username handle — strip the @ and look up by username.
	if strings.HasPrefix(input, "@") {
		return lookupUserEmail(ctx, identityClient, strings.TrimPrefix(input, "@"), "")
	}

	// username#tag — split on the first # only, so stray # in the tag don't break parsing.
	if strings.Contains(input, "#") {
		parts := strings.SplitN(input, "#", 2)
		return lookupUserEmail(ctx, identityClient, parts[0], parts[1])
	}

	// Fallback: treat as a bare username.
	return lookupUserEmail(ctx, identityClient, input, "")
}

// lookupUserEmail calls identity.GetUserByUsernameTag with the given pair and
// returns the user's email. When tag is empty the identity service treats
// username as both fields; this matches the legacy behaviour of the collab
// handler's getUserEmailByUsername helper.
func lookupUserEmail(ctx context.Context, client identity.IdentityServiceClient, username, tag string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	effectiveTag := tag
	if effectiveTag == "" {
		effectiveTag = username
	}

	resp, err := client.GetUserByUsernameTag(ctx, &identity.GetUserByUsernameTagRequest{
		Username: username,
		UserTag:  effectiveTag,
	})
	if err != nil {
		if tag == "" {
			return "", fmt.Errorf("user %q not found: %w", username, err)
		}
		return "", fmt.Errorf("user %q#%q not found: %w", username, tag, err)
	}
	if resp.User == nil {
		if tag == "" {
			return "", fmt.Errorf("user %q not found", username)
		}
		return "", fmt.Errorf("user %q#%q not found", username, tag)
	}
	return resp.User.Email, nil
}
