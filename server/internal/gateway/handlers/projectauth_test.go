package handlers

import (
	"context"
	"net/http"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/gateway/apierror"
	"inkwell/server/pkg/grpc/collab"
	scriptspb "inkwell/server/pkg/grpc/scripts"
	workspacepb "inkwell/server/pkg/grpc/workspace"
)

// fakeScripts exercises the two calls ResolveProjectRole makes to scripts:
// the owner fast path (a real userID) and the org-metadata read (the empty
// userID bypass, a read-only lookup — not a grant). When err is set every
// call fails with it, for dependency-failure tests.
type fakeScripts struct {
	scriptspb.ScriptsServiceClient
	ownerUserID string
	orgID       string
	err         error
}

func (f *fakeScripts) GetProject(_ context.Context, in *scriptspb.GetProjectRequest, _ ...grpc.CallOption) (*scriptspb.GetProjectResponse, error) {
	if f.err != nil {
		return nil, f.err
	}
	if in.UserId == "" {
		return &scriptspb.GetProjectResponse{Project: &scriptspb.Project{OrgId: f.orgID}}, nil
	}
	if in.UserId == f.ownerUserID {
		return &scriptspb.GetProjectResponse{Project: &scriptspb.Project{OwnerId: f.ownerUserID}}, nil
	}
	return nil, status.Error(codes.PermissionDenied, "not owner")
}

// fakeWorkspace reports a single org member (memberUserID, memberRole) for orgID.
type fakeWorkspace struct {
	workspacepb.WorkspaceServiceClient
	orgID        string
	memberUserID string
	memberRole   string
	err          error
}

func (f *fakeWorkspace) GetOrgMember(_ context.Context, in *workspacepb.GetOrgMemberRequest, _ ...grpc.CallOption) (*workspacepb.GetOrgMemberResponse, error) {
	if f.err != nil {
		return nil, f.err
	}
	if in.OrgId == f.orgID && in.UserId == f.memberUserID {
		return &workspacepb.GetOrgMemberResponse{Member: &workspacepb.OrgMember{Role: f.memberRole}}, nil
	}
	return nil, status.Error(codes.NotFound, "not a member")
}

// fakeCollab reports a single active collaborator (collabUserID, collabRole).
// An empty collabUserID means the project has no collaborators.
type fakeCollab struct {
	collab.CollaborationServiceClient
	collabUserID string
	collabRole   string
	err          error
}

func (f *fakeCollab) GetProjectCollaborators(_ context.Context, _ *collab.GetProjectCollaboratorsRequest, _ ...grpc.CallOption) (*collab.GetProjectCollaboratorsResponse, error) {
	if f.err != nil {
		return nil, f.err
	}
	if f.collabUserID == "" {
		return &collab.GetProjectCollaboratorsResponse{}, nil
	}
	return &collab.GetProjectCollaboratorsResponse{
		Collaborators: []*collab.Collaborator{{UserId: f.collabUserID, Status: "active", Role: f.collabRole}},
	}, nil
}

func TestResolveProjectRole_Owner(t *testing.T) {
	sc := &fakeScripts{ownerUserID: "owner-1"}
	role, err := ResolveProjectRole(context.Background(), "owner-1", "proj-1", sc, &fakeCollab{}, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if role != RoleOwner {
		t.Errorf("role = %s, want owner", role)
	}
}

func TestResolveProjectRole_OrgMember(t *testing.T) {
	cases := []struct {
		orgRole string
		want    ProjectRole
	}{
		{"owner", RoleOrgAdmin},
		{"admin", RoleOrgAdmin},
		{"editor", RoleEditor},
		{"viewer", RoleViewer},
		{"something-new", RoleNone}, // unrecognised org role maps to no access, not a guess
	}
	for _, tc := range cases {
		t.Run(tc.orgRole, func(t *testing.T) {
			sc := &fakeScripts{ownerUserID: "owner-1", orgID: "org-1"}
			wc := &fakeWorkspace{orgID: "org-1", memberUserID: "member-1", memberRole: tc.orgRole}
			role, err := ResolveProjectRole(context.Background(), "member-1", "proj-1", sc, &fakeCollab{}, wc)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if role != tc.want {
				t.Errorf("org role %q → %s, want %s", tc.orgRole, role, tc.want)
			}
		})
	}
}

func TestResolveProjectRole_Collaborator(t *testing.T) {
	cases := []struct {
		collabRole string
		want       ProjectRole
	}{
		// "owner" is deliberately RoleNone, not RoleOwner: only scripts'
		// literal owner_id check (the fast path, which already failed for
		// this caller — fakeScripts.ownerUserID is a different user — before
		// this function is ever reached) is authoritative for ownership. See
		// TestResolveProjectRole_StaleCollabOwnerRowIgnored below.
		{"owner", RoleNone},
		{"editor", RoleEditor},
		{"viewer", RoleViewer},
		{"", RoleNone}, // a row the two services' vocabularies drifted on must not guess allow
	}
	for _, tc := range cases {
		t.Run("role="+tc.collabRole, func(t *testing.T) {
			sc := &fakeScripts{ownerUserID: "owner-1"} // no org
			cc := &fakeCollab{collabUserID: "collab-1", collabRole: tc.collabRole}
			role, err := ResolveProjectRole(context.Background(), "collab-1", "proj-1", sc, cc, nil)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if role != tc.want {
				t.Errorf("collab role %q → %s, want %s", tc.collabRole, role, tc.want)
			}
		})
	}
}

// TestResolveProjectRole_StaleCollabOwnerRowIgnored is the regression a
// reviewer asked for: a non-owner (per scripts, the authoritative source)
// with a stale/mistaken collab.collaborators row of role "owner" must not be
// granted RoleOwner — and combined with a real org role, must be capped at
// that org role, never elevated by the untrusted "owner" row.
func TestResolveProjectRole_StaleCollabOwnerRowIgnored(t *testing.T) {
	t.Run("collab owner row alone grants nothing", func(t *testing.T) {
		sc := &fakeScripts{ownerUserID: "the-real-owner"} // not this caller
		cc := &fakeCollab{collabUserID: "impostor-1", collabRole: "owner"}
		role, err := ResolveProjectRole(context.Background(), "impostor-1", "proj-1", sc, cc, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if role != RoleNone {
			t.Errorf("role = %s, want none — a collab 'owner' row must never grant access on its own", role)
		}
	})

	t.Run("combined with a real org role, capped at the org role", func(t *testing.T) {
		sc := &fakeScripts{ownerUserID: "the-real-owner", orgID: "org-1"}
		wc := &fakeWorkspace{orgID: "org-1", memberUserID: "impostor-1", memberRole: "editor"}
		cc := &fakeCollab{collabUserID: "impostor-1", collabRole: "owner"}
		role, err := ResolveProjectRole(context.Background(), "impostor-1", "proj-1", sc, cc, wc)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if role != RoleEditor {
			t.Errorf("role = %s, want editor (the org role) — the stale collab 'owner' row must not elevate it further", role)
		}
	})
}

// TestResolveProjectRole_CombinesOrgAndDirectRoles is the reviewer's "mixed
// org/direct role, both directions" regression: a direct project role must
// not mask a higher org role, and an org role must not mask a higher direct
// grant — ResolveProjectRole must check both sources and return whichever
// grants more, not whichever it happened to check first.
func TestResolveProjectRole_CombinesOrgAndDirectRoles(t *testing.T) {
	cases := []struct {
		name       string
		orgRole    string
		collabRole string
		want       ProjectRole
	}{
		{"org viewer, direct editor → editor wins", "viewer", "editor", RoleEditor},
		{"org editor, direct viewer → org wins", "editor", "viewer", RoleEditor},
		{"org admin, direct viewer → org wins", "admin", "viewer", RoleOrgAdmin},
		{"org viewer, direct viewer → viewer either way", "viewer", "viewer", RoleViewer},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sc := &fakeScripts{ownerUserID: "owner-1", orgID: "org-1"}
			wc := &fakeWorkspace{orgID: "org-1", memberUserID: "member-1", memberRole: tc.orgRole}
			cc := &fakeCollab{collabUserID: "member-1", collabRole: tc.collabRole}
			role, err := ResolveProjectRole(context.Background(), "member-1", "proj-1", sc, cc, wc)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if role != tc.want {
				t.Errorf("org=%q direct=%q → %s, want %s", tc.orgRole, tc.collabRole, role, tc.want)
			}
		})
	}
}

func TestResolveProjectRole_NoAccess(t *testing.T) {
	sc := &fakeScripts{ownerUserID: "owner-1"}
	role, err := ResolveProjectRole(context.Background(), "stranger-1", "proj-1", sc, &fakeCollab{}, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if role != RoleNone {
		t.Errorf("role = %s, want none", role)
	}
}

// TestResolveProjectRole_DependencyFailureFailsClosed is the acceptance
// criterion "authorization dependency failures return an availability/deadline
// error, never permission denied": a scripts outage during the owner check
// must not be silently read as "not the owner, try the next check" — it must
// propagate so the caller fails closed instead of guessing "no access".
func TestResolveProjectRole_DependencyFailureFailsClosed(t *testing.T) {
	sc := &fakeScripts{err: status.Error(codes.Unavailable, "scripts is down")}
	_, err := ResolveProjectRole(context.Background(), "someone", "proj-1", sc, &fakeCollab{}, nil)
	if err == nil {
		t.Fatal("expected a dependency-failure error, got nil")
	}
	if status.Code(err) != codes.Unavailable {
		t.Errorf("error code = %v, want Unavailable", status.Code(err))
	}
}

func TestRequireProjectAccess(t *testing.T) {
	t.Run("owner may delete, dispatched with the real id", func(t *testing.T) {
		sc := &fakeScripts{ownerUserID: "owner-1"}
		id, err := RequireProjectAccess(context.Background(), "owner-1", "proj-1", ActionDeleteProject, sc, &fakeCollab{}, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if id != "owner-1" {
			t.Errorf("downstream id = %q, want the owner's real id", id)
		}
	})

	t.Run("editor may edit content, dispatched with the bypass sentinel", func(t *testing.T) {
		sc := &fakeScripts{ownerUserID: "owner-1"}
		cc := &fakeCollab{collabUserID: "editor-1", collabRole: "editor"}
		id, err := RequireProjectAccess(context.Background(), "editor-1", "proj-1", ActionEditContent, sc, cc, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if id != "" {
			t.Errorf("downstream id = %q, want the empty bypass sentinel", id)
		}
	})

	t.Run("viewer may not edit content", func(t *testing.T) {
		sc := &fakeScripts{ownerUserID: "owner-1"}
		cc := &fakeCollab{collabUserID: "viewer-1", collabRole: "viewer"}
		_, err := RequireProjectAccess(context.Background(), "viewer-1", "proj-1", ActionEditContent, sc, cc, nil)
		apiErr, ok := err.(*apierror.Error)
		if !ok {
			t.Fatalf("error = %v (%T), want *apierror.Error", err, err)
		}
		if apiErr.Code != apierror.CodePermissionDenied || apiErr.HTTPStatus != http.StatusForbidden {
			t.Errorf("error = %+v, want PermissionDenied/403", apiErr)
		}
	})

	t.Run("a stranger may not even read", func(t *testing.T) {
		sc := &fakeScripts{ownerUserID: "owner-1"}
		_, err := RequireProjectAccess(context.Background(), "stranger-1", "proj-1", ActionRead, sc, &fakeCollab{}, nil)
		apiErr, ok := err.(*apierror.Error)
		if !ok {
			t.Fatalf("error = %v (%T), want *apierror.Error", err, err)
		}
		if apiErr.Code != apierror.CodePermissionDenied || apiErr.HTTPStatus != http.StatusForbidden {
			t.Errorf("error = %+v, want PermissionDenied/403", apiErr)
		}
	})

	// The critical distinction the whole apierror.FromError plumbing exists
	// for: a dependency outage must never surface as 403. A caller that reads
	// "PermissionDenied" as "definitely not authorized" and, say, caches that
	// verdict would be wrong to do so on an Unavailable.
	t.Run("a dependency failure is never a 403, even for a write", func(t *testing.T) {
		sc := &fakeScripts{err: status.Error(codes.DeadlineExceeded, "scripts timed out")}
		_, err := RequireProjectAccess(context.Background(), "someone", "proj-1", ActionEditContent, sc, &fakeCollab{}, nil)
		apiErr, ok := err.(*apierror.Error)
		if !ok {
			t.Fatalf("error = %v (%T), want *apierror.Error", err, err)
		}
		if apiErr.Code == apierror.CodePermissionDenied || apiErr.HTTPStatus == http.StatusForbidden {
			t.Errorf("error = %+v, a dependency timeout must not read as permission denied", apiErr)
		}
		if apiErr.Code != apierror.CodeDeadlineExceeded {
			t.Errorf("error code = %v, want DeadlineExceeded", apiErr.Code)
		}
	})
}
