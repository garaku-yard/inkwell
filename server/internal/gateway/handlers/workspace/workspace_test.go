package workspace

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/gateway/apierror"
	billingpb "inkwell/server/pkg/grpc/billing"
)

// fakeBillingClient returns a plan with a fixed business-workspace entitlement,
// a nil plan, or an error. Only GetEffectiveTier is exercised by the gate.
type fakeBillingClient struct {
	billingpb.BillingServiceClient
	allowed bool
	noPlan  bool
	err     error
}

func (f *fakeBillingClient) GetEffectiveTier(_ context.Context, _ *billingpb.GetEffectiveTierRequest, _ ...grpc.CallOption) (*billingpb.GetEffectiveTierResponse, error) {
	if f.err != nil {
		return nil, f.err
	}
	if f.noPlan {
		return &billingpb.GetEffectiveTierResponse{}, nil
	}
	return &billingpb.GetEffectiveTierResponse{
		Plan: &billingpb.Plan{BusinessWorkspaces: f.allowed},
	}, nil
}

func TestCheckBusinessWorkspaceEntitlement(t *testing.T) {
	tests := []struct {
		name    string
		billing *fakeBillingClient
		denied  bool
	}{
		{"business tier allows", &fakeBillingClient{allowed: true}, false},
		{"non-business tier denied", &fakeBillingClient{allowed: false}, true},
		{"billing error fails open", &fakeBillingClient{err: status.Error(codes.Unavailable, "down")}, false},
		{"nil plan fails open", &fakeBillingClient{noPlan: true}, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := &WorkspaceHandler{billingClient: tc.billing}
			err := h.checkBusinessWorkspaceEntitlement(context.Background(), "user-1")
			if !tc.denied {
				if err != nil {
					t.Fatalf("expected allow, got %v", err)
				}
				return
			}
			var ae *apierror.Error
			if !errors.As(err, &ae) {
				t.Fatalf("error is %T, want *apierror.Error", err)
			}
			if ae.HTTPStatus != http.StatusForbidden {
				t.Errorf("status = %d, want %d", ae.HTTPStatus, http.StatusForbidden)
			}
		})
	}
}
