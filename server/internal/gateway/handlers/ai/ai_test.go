package ai

import (
	"context"
	"strings"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/gateway/application/scriptreads"
	billingpb "inkwell/server/pkg/grpc/billing"
	scriptspb "inkwell/server/pkg/grpc/scripts"
)

func TestSelectedResourceInstructionIncludesVisibleManuscript(t *testing.T) {
	instruction := selectedResourceInstruction("passage", "passage-1", &scriptreads.SceneContent{
		Scene: &scriptspb.Scene{SceneHeading: "Attractor:Zero"},
		Elements: []*scriptspb.ProjectElement{
			{Type: "body", Content: "You awaken aboard an abandoned station."},
			{Type: "body", Content: "The station drifts above a distant blue Earth."},
		},
	})

	for _, want := range []string{
		`"heading":"Attractor:Zero"`,
		`"type":"body"`,
		`You awaken aboard an abandoned station.`,
		`do not call a read tool`,
	} {
		if !strings.Contains(instruction, want) {
			t.Fatalf("instruction missing %q: %s", want, instruction)
		}
	}
}

// fakeBilling stubs the billing client for the managed-AI quota check.
type fakeBilling struct {
	billingpb.BillingServiceClient
	cap     int64
	used    int64
	tierErr error
	useErr  error
	noPlan  bool
}

func (f *fakeBilling) GetEffectiveTier(_ context.Context, _ *billingpb.GetEffectiveTierRequest, _ ...grpc.CallOption) (*billingpb.GetEffectiveTierResponse, error) {
	if f.tierErr != nil {
		return nil, f.tierErr
	}
	if f.noPlan {
		return &billingpb.GetEffectiveTierResponse{}, nil
	}
	return &billingpb.GetEffectiveTierResponse{Plan: &billingpb.Plan{AiTokensPerMonth: f.cap}}, nil
}

func (f *fakeBilling) GetMonthlyUsage(_ context.Context, _ *billingpb.GetMonthlyUsageRequest, _ ...grpc.CallOption) (*billingpb.GetMonthlyUsageResponse, error) {
	if f.useErr != nil {
		return nil, f.useErr
	}
	return &billingpb.GetMonthlyUsageResponse{Used: f.used}, nil
}

func TestOverManagedQuota(t *testing.T) {
	down := status.Error(codes.Unavailable, "down")
	tests := []struct {
		name     string
		billing  *fakeBilling
		wantOver bool
	}{
		{"unlimited cap (0) allows", &fakeBilling{cap: 0, used: 999}, false},
		{"under cap allows", &fakeBilling{cap: 10, used: 9}, false},
		{"at cap blocks", &fakeBilling{cap: 10, used: 10}, true},
		{"over cap blocks", &fakeBilling{cap: 10, used: 25}, true},
		{"tier error fails open", &fakeBilling{tierErr: down}, false},
		{"nil plan fails open", &fakeBilling{noPlan: true}, false},
		{"usage error fails open", &fakeBilling{cap: 10, useErr: down}, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := &AIHandler{billing: tc.billing}
			msg, over := h.overManagedQuota(context.Background(), "user-1")
			if over != tc.wantOver {
				t.Fatalf("over = %v, want %v", over, tc.wantOver)
			}
			if over && msg == "" {
				t.Error("expected a user-facing message when over quota")
			}
		})
	}
}
