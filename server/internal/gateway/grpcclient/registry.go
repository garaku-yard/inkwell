// Package grpcclient manages gRPC connections from the gateway to downstream services.
package grpcclient

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/sony/gobreaker"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"scriptlith/server/internal/gateway/config"
	billingpb "scriptlith/server/pkg/grpc/billing"
	"scriptlith/server/pkg/grpc/collab"
	"scriptlith/server/pkg/grpc/identity"
	scriptspb "scriptlith/server/pkg/grpc/scripts"
	workspacepb "scriptlith/server/pkg/grpc/workspace"
)

// Registry holds one gRPC client per downstream service.
// It is created once at startup and shared across all handlers.
// Each underlying connection is wrapped by a circuit breaker that opens after
// 3 consecutive failures and retries after 30 s, preventing cascade failures.
type Registry struct {
	Identity  identity.IdentityServiceClient
	Scripts   scriptspb.ScriptsServiceClient
	Collab    collab.CollaborationServiceClient
	Billing   billingpb.BillingServiceClient
	Workspace workspacepb.WorkspaceServiceClient
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

	return &Registry{
		Identity:  identity.NewIdentityServiceClient(identityConn),
		Scripts:   scriptspb.NewScriptsServiceClient(scriptsConn),
		Collab:    collab.NewCollaborationServiceClient(collabConn),
		Billing:   billingpb.NewBillingServiceClient(billingConn),
		Workspace: workspacepb.NewWorkspaceServiceClient(workspaceConn),
	}, nil
}

// dial establishes a gRPC connection with a circuit-breaker unary interceptor.
func dial(target, name string) (*grpc.ClientConn, error) {
	cb := newBreaker(name)
	return grpc.NewClient(
		target,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithUnaryInterceptor(breakerInterceptor(cb, name)),
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
func breakerInterceptor(cb *gobreaker.CircuitBreaker, serviceName string) grpc.UnaryClientInterceptor {
	return func(
		ctx context.Context,
		method string,
		req, reply any,
		cc *grpc.ClientConn,
		invoker grpc.UnaryInvoker,
		opts ...grpc.CallOption,
	) error {
		_, err := cb.Execute(func() (any, error) {
			return nil, invoker(ctx, method, req, reply, cc, opts...)
		})
		if err == gobreaker.ErrOpenState {
			return fmt.Errorf("%s service is temporarily unavailable", serviceName)
		}
		return err
	}
}
