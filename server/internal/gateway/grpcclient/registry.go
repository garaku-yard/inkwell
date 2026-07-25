// Package grpcclient manages gRPC connections from the gateway to downstream services.
package grpcclient

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/sony/gobreaker"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/gateway/config"
	aisettingspb "inkwell/server/pkg/grpc/aisettings"
	billingpb "inkwell/server/pkg/grpc/billing"
	"inkwell/server/pkg/grpc/collab"
	"inkwell/server/pkg/grpc/identity"
	notificationspb "inkwell/server/pkg/grpc/notifications"
	scriptspb "inkwell/server/pkg/grpc/scripts"
	workspacepb "inkwell/server/pkg/grpc/workspace"
	"inkwell/server/pkg/grpclimits"
)

// Registry holds one gRPC client per downstream service.
// It is created once at startup and shared across all handlers.
// Each underlying connection is wrapped by a circuit breaker that opens after
// 3 consecutive failures and retries after 30 s, preventing cascade failures.
type Registry struct {
	Identity      identity.IdentityServiceClient
	Scripts       scriptspb.ScriptsServiceClient
	Collab        collab.CollaborationServiceClient
	Billing       billingpb.BillingServiceClient
	Workspace     workspacepb.WorkspaceServiceClient
	AISettings    aisettingspb.AISettingsServiceClient
	Notifications notificationspb.NotificationsServiceClient
}

// New dials every downstream service and returns a populated Registry.
// All connections use insecure transport (mTLS is handled at the infra layer).
func New(cfg *config.Config) (*Registry, error) {
	identityConn, err := dial(cfg.IdentityServiceURL(), "identity")
	if err != nil {
		return nil, fmt.Errorf("identity service: %w", err)
	}
	scriptsConn, err := dial(cfg.ScriptsServiceURL(), "scripts")
	if err != nil {
		return nil, fmt.Errorf("scripts service: %w", err)
	}
	collabConn, err := dial(cfg.CollaborationServiceURL(), "collab")
	if err != nil {
		return nil, fmt.Errorf("collab service: %w", err)
	}
	billingConn, err := dial(cfg.BillingServiceURL(), "billing")
	if err != nil {
		return nil, fmt.Errorf("billing service: %w", err)
	}
	workspaceConn, err := dial(cfg.WorkspaceServiceURL(), "workspace")
	if err != nil {
		return nil, fmt.Errorf("workspace service: %w", err)
	}
	aiSettingsConn, err := dial(cfg.AISettingsServiceURL(), "aisettings")
	if err != nil {
		return nil, fmt.Errorf("aisettings service: %w", err)
	}
	notificationsConn, err := dial(cfg.NotificationsServiceURL(), "notifications")
	if err != nil {
		return nil, fmt.Errorf("notifications service: %w", err)
	}

	return &Registry{
		Identity:      identity.NewIdentityServiceClient(identityConn),
		Scripts:       scriptspb.NewScriptsServiceClient(scriptsConn),
		Collab:        collab.NewCollaborationServiceClient(collabConn),
		Billing:       billingpb.NewBillingServiceClient(billingConn),
		Workspace:     workspacepb.NewWorkspaceServiceClient(workspaceConn),
		AISettings:    aisettingspb.NewAISettingsServiceClient(aiSettingsConn),
		Notifications: notificationspb.NewNotificationsServiceClient(notificationsConn),
	}, nil
}

// dial establishes a gRPC connection with a circuit-breaker unary interceptor.
func dial(target, name string) (*grpc.ClientConn, error) {
	cb := newBreaker(name)
	return grpc.NewClient(
		target,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithUnaryInterceptor(breakerInterceptor(cb, name)),
		// Without this a vault pull page (up to 16 MiB) is rejected on receipt
		// by the 4 MiB default. See grpclimits.
		grpclimits.DialOption(),
	)
}

// newBreaker creates a circuit breaker for a named downstream service.
// It opens after 3 consecutive failures and resets after 30 s.
func newBreaker(name string) *gobreaker.CircuitBreaker {
	return gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        name + "-grpc",
		MaxRequests: 5,
		Interval:    60 * time.Second,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			return counts.ConsecutiveFailures >= 3
		},
		OnStateChange: func(name string, from, to gobreaker.State) {
			slog.Warn("circuit breaker state changed",
				"breaker", name,
				"from", from.String(),
				"to", to.String(),
			)
		},
	})
}

// breakerInterceptor wraps every unary gRPC call with the circuit breaker.
// When the breaker is open, calls fail immediately with an error rather than
// blocking downstream and propagating latency to the HTTP client.
// Only transport-level failures (Unavailable, DeadlineExceeded, Internal)
// count as breaker failures — application-level codes like PermissionDenied
// or NotFound are expected responses and must not trip the breaker.
func breakerInterceptor(cb *gobreaker.CircuitBreaker, serviceName string) grpc.UnaryClientInterceptor {
	return func(
		ctx context.Context,
		method string,
		req, reply any,
		cc *grpc.ClientConn,
		invoker grpc.UnaryInvoker,
		opts ...grpc.CallOption,
	) error {
		var callErr error
		_, breakerErr := cb.Execute(func() (any, error) {
			callErr = invoker(ctx, method, req, reply, cc, opts...)
			if callErr != nil && isTransportError(callErr) {
				return nil, callErr // transport failure — trip the breaker
			}
			return nil, nil // success or app-level error — don't trip the breaker
		})
		if breakerErr == gobreaker.ErrOpenState {
			return fmt.Errorf("%s service is temporarily unavailable", serviceName)
		}
		return callErr // return the real error (PermissionDenied, NotFound, etc.) to the caller
	}
}

// isTransportError reports whether err represents a connection-level failure
// that should count toward tripping the circuit breaker.
func isTransportError(err error) bool {
	s, ok := status.FromError(err)
	if !ok {
		return true // not a gRPC status error — treat as transport failure
	}
	switch s.Code() {
	case codes.Unavailable, codes.DeadlineExceeded, codes.Internal, codes.Unknown:
		return true
	default:
		return false
	}
}
