// Package userlookup resolves user ids to contact details via the identity
// service. Most domain events (e.g. collaboration.added) carry only UUIDs, so
// the notifications service calls this to find an email address before sending.
package userlookup

import (
	"context"
	"fmt"

	identitypb "inkwell/server/pkg/grpc/identity"
)

// Client wraps the identity gRPC client. It structurally satisfies the
// service-layer lookup interface (Lookup), so the service package needn't
// import this one.
type Client struct {
	identity identitypb.IdentityServiceClient
}

// New builds a Client over the given identity gRPC client.
func New(identity identitypb.IdentityServiceClient) *Client {
	return &Client{identity: identity}
}

// Lookup returns the email and display name (first name, else username) for a
// user id.
func (c *Client) Lookup(ctx context.Context, userID string) (email, displayName string, err error) {
	resp, err := c.identity.GetUser(ctx, &identitypb.GetUserRequest{UserId: userID})
	if err != nil {
		return "", "", fmt.Errorf("identity GetUser: %w", err)
	}
	u := resp.GetUser()
	if u == nil {
		return "", "", fmt.Errorf("identity GetUser: empty user for %s", userID)
	}
	name := u.FirstName
	if name == "" {
		name = u.Username
	}
	return u.Email, name, nil
}
