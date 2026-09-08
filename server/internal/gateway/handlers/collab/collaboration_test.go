package collab

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
	"inkwell/server/pkg/grpc/collab"
	"inkwell/server/pkg/grpc/scripts"
)

// fakeScriptsClient resolves a project to a fixed owner, or fails when projErr is
// set. Only GetProjectAccessMetadata is exercised by the collaborator-quota gate.
type fakeScriptsClient struct {
	scripts.ScriptsServiceClient
	ownerID string
	project bool // when false, return a nil project (fail-open path)
	err     error
}

func (f *fakeScriptsClient) GetProjectAccessMetadata(_ context.Context, _ *scripts.GetProjectAccessMetadataRequest, _ ...grpc.CallOption) (*scripts.GetProjectAccessMetadataResponse, error) {
	if f.err != nil {
		return nil, f.err
	}
	if !f.project {
		return &scripts.GetProjectAccessMetadataResponse{}, nil
	}
	return &scripts.GetProjectAccessMetadataResponse{OwnerId: f.ownerID}, nil
}

// fakeBillingClient returns a plan with a fixed per-project collaborator cap, a
// nil plan, or an error. Only GetEffectiveTier is exercised.
type fakeBillingClient struct {
	billingpb.BillingServiceClient
	limit   int32
	noPlan  bool
	err     error
	gotUser string
}

func (f *fakeBillingClient) GetEffectiveTier(_ context.Context, in *billingpb.GetEffectiveTierRequest, _ ...grpc.CallOption) (*billingpb.GetEffectiveTierResponse, error) {
	f.gotUser = in.GetUserId()
	if f.err != nil {
		return nil, f.err
	}
	if f.noPlan {
		return &billingpb.GetEffectiveTierResponse{}, nil
	}
	return &billingpb.GetEffectiveTierResponse{
		Plan: &billingpb.Plan{MaxCollaboratorsPerProject: f.limit},
	}, nil
}

// fakeCollabClient reports a project's seat usage (active non-owner collaborators
// + pending invitations), or an error.
type fakeCollabClient struct {
	collab.CollaborationServiceClient
	active  int32
	pending int32
	err     error
}

func (f *fakeCollabClient) GetProjectSeatUsage(_ context.Context, _ *collab.GetProjectSeatUsageRequest, _ ...grpc.CallOption) (*collab.GetProjectSeatUsageResponse, error) {
	if f.err != nil {
		return nil, f.err
	}
	return &collab.GetProjectSeatUsageResponse{
		ActiveCollaborators: f.active,
		PendingInvitations:  f.pending,
	}, nil
}

// wantBlocked asserts err is the 429 RESOURCE_EXHAUSTED quota error.
func wantBlocked(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("expected the collaborator quota to block, got nil (allowed)")
	}
	var ae *apierror.Error
	if !errors.As(err, &ae) {
		t.Fatalf("error is %T, want *apierror.Error", err)
	}
	if ae.HTTPStatus != http.StatusTooManyRequests {
		t.Errorf("status = %d, want %d", ae.HTTPStatus, http.StatusTooManyRequests)
	}
	if ae.Code != apierror.CodeResourceExhausted {
		t.Errorf("code = %q, want %q", ae.Code, apierror.CodeResourceExhausted)
	}
}

func wantAllowed(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("expected the collaborator quota to allow, got %v", err)
	}
}

// TestCheckCollaboratorQuota pins the gate's core decisions: it blocks at/over the
// owner's tier cap, allows under it, treats a non-positive cap as unlimited,
// excludes the owner row from the count, and fails OPEN on any dependency error.
func TestCheckCollaboratorQuota(t *testing.T) {
	const (
		projectID = "proj-1"
		ownerID   = "owner-9"
	)

	tests := []struct {
		name    string
		scripts *fakeScriptsClient
		billing *fakeBillingClient
		collab  *fakeCollabClient
		blocked bool
	}{
		{
			name:    "under limit allows",
			scripts: &fakeScriptsClient{ownerID: ownerID, project: true},
			billing: &fakeBillingClient{limit: 3},
			collab:  &fakeCollabClient{active: 1, pending: 1}, // 2 < 3
		},
		{
			name:    "at limit blocks",
			scripts: &fakeScriptsClient{ownerID: ownerID, project: true},
			billing: &fakeBillingClient{limit: 2},
			collab:  &fakeCollabClient{active: 2}, // 2 >= 2
			blocked: true,
		},
		{
			name:    "pending invitations alone reach the cap",
			scripts: &fakeScriptsClient{ownerID: ownerID, project: true},
			billing: &fakeBillingClient{limit: 2},
			collab:  &fakeCollabClient{pending: 2}, // outstanding invites occupy seats even before accept
			blocked: true,
		},
		{
			name:    "active plus pending crosses the cap",
			scripts: &fakeScriptsClient{ownerID: ownerID, project: true},
			billing: &fakeBillingClient{limit: 2},
			collab:  &fakeCollabClient{active: 1, pending: 1}, // 1 + 1 >= 2
			blocked: true,
		},
		{
			name:    "zero limit means unlimited",
			scripts: &fakeScriptsClient{ownerID: ownerID, project: true},
			billing: &fakeBillingClient{limit: 0},
			collab:  &fakeCollabClient{active: 4, pending: 3},
		},
		{
			name:    "missing project fails open",
			scripts: &fakeScriptsClient{project: false}, // nil project
			billing: &fakeBillingClient{limit: 1},
			collab:  &fakeCollabClient{active: 2},
		},
		{
			name:    "scripts error fails open",
			scripts: &fakeScriptsClient{err: status.Error(codes.Unavailable, "down")},
			billing: &fakeBillingClient{limit: 1},
			collab:  &fakeCollabClient{active: 2},
		},
		{
			name:    "billing error fails open",
			scripts: &fakeScriptsClient{ownerID: ownerID, project: true},
			billing: &fakeBillingClient{err: status.Error(codes.Unavailable, "down")},
			collab:  &fakeCollabClient{active: 2},
		},
		{
			name:    "nil plan fails open",
			scripts: &fakeScriptsClient{ownerID: ownerID, project: true},
			billing: &fakeBillingClient{noPlan: true},
			collab:  &fakeCollabClient{active: 2},
		},
		{
			name:    "seat usage error fails open",
			scripts: &fakeScriptsClient{ownerID: ownerID, project: true},
			billing: &fakeBillingClient{limit: 1},
			collab:  &fakeCollabClient{err: status.Error(codes.Unavailable, "down")},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := &CollaborationHandler{
				client:        tc.collab,
				scriptsClient: tc.scripts,
				billingClient: tc.billing,
			}
			err := h.checkCollaboratorQuota(context.Background(), projectID)
			if tc.blocked {
				wantBlocked(t, err)
			} else {
				wantAllowed(t, err)
			}
		})
	}
}

// TestCheckCollaboratorQuotaUsesOwnerTier confirms the cap is read from the
// project OWNER's plan, not the inviting caller's.
func TestCheckCollaboratorQuotaUsesOwnerTier(t *testing.T) {
	billing := &fakeBillingClient{limit: 5}
	h := &CollaborationHandler{
		client:        &fakeCollabClient{},
		scriptsClient: &fakeScriptsClient{ownerID: "owner-9", project: true},
		billingClient: billing,
	}
	if err := h.checkCollaboratorQuota(context.Background(), "proj-1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if billing.gotUser != "owner-9" {
		t.Errorf("GetEffectiveTier called for %q, want the project owner %q", billing.gotUser, "owner-9")
	}
}
