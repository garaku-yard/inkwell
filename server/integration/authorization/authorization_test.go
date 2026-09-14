//go:build boundaryintegration

package authorization_test

import (
	"context"
	"net"
	"sync"
	"testing"

	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"

	"inkwell/server/internal/collab/domain"
	"inkwell/server/internal/collab/handlers"
	"inkwell/server/internal/collab/repository"
	"inkwell/server/internal/collab/service"
	"inkwell/server/internal/gateway/apierror"
	gateway "inkwell/server/internal/gateway/handlers"
	collabpb "inkwell/server/pkg/grpc/collab"
	scriptspb "inkwell/server/pkg/grpc/scripts"
	workspacepb "inkwell/server/pkg/grpc/workspace"
)

const (
	projectID      = "00000000-0000-0000-0000-000000000001"
	orgID          = "00000000-0000-0000-0000-000000000002"
	ownerID        = "00000000-0000-0000-0000-000000000010"
	adminID        = "00000000-0000-0000-0000-000000000011"
	orgEditorID    = "00000000-0000-0000-0000-000000000012"
	orgViewerID    = "00000000-0000-0000-0000-000000000013"
	directEditorID = "00000000-0000-0000-0000-000000000014"
	pendingID      = "00000000-0000-0000-0000-000000000015"
	removedID      = "00000000-0000-0000-0000-000000000016"
	strangerID     = "00000000-0000-0000-0000-000000000017"
	mixedID        = "00000000-0000-0000-0000-000000000018"
	mixedAdminID   = "00000000-0000-0000-0000-000000000019"
)

type scriptsFixture struct {
	scriptspb.UnimplementedScriptsServiceServer
	err error
}

func (s scriptsFixture) GetProjectAccessMetadata(context.Context, *scriptspb.GetProjectAccessMetadataRequest) (*scriptspb.GetProjectAccessMetadataResponse, error) {
	if s.err != nil {
		return nil, s.err
	}
	return &scriptspb.GetProjectAccessMetadataResponse{OwnerId: ownerID, OrgId: orgID}, nil
}

type workspaceFixture struct {
	workspacepb.UnimplementedWorkspaceServiceServer
	roles map[string]string
}

func (s workspaceFixture) GetOrgMember(_ context.Context, req *workspacepb.GetOrgMemberRequest) (*workspacepb.GetOrgMemberResponse, error) {
	role, ok := s.roles[req.UserId]
	if req.OrgId != orgID || !ok {
		return nil, status.Error(codes.NotFound, "not an organization member")
	}
	return &workspacepb.GetOrgMemberResponse{Member: &workspacepb.OrgMember{UserId: req.UserId, OrgId: req.OrgId, Role: role}}, nil
}

type directGrant struct {
	role   string
	status string
}

type collabFixtureRepo struct {
	repository.CollaborationRepository
	mu        sync.Mutex
	grants    map[uuid.UUID]directGrant
	writes    int
	lastActor uuid.UUID
	comments  map[uuid.UUID]*domain.Comment
}

func (r *collabFixtureRepo) GetCommentByID(_ context.Context, commentID uuid.UUID) (*domain.Comment, error) {
	comment, ok := r.comments[commentID]
	if !ok {
		return nil, domain.ErrCommentNotFound
	}
	return comment, nil
}

func (r *collabFixtureRepo) GetUserProjectRole(_ context.Context, userID, gotProjectID uuid.UUID) (string, error) {
	if gotProjectID.String() != projectID {
		return "", domain.ErrUnauthorized
	}
	grant, ok := r.grants[userID]
	if !ok || grant.status != "active" {
		return "", domain.ErrUnauthorized
	}
	return grant.role, nil
}

func (r *collabFixtureRepo) CreateOrUpdateUserPresence(_ context.Context, presence *domain.UserPresence) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.writes++
	r.lastActor = presence.UserID
	return nil
}

func (r *collabFixtureRepo) snapshot() (int, uuid.UUID) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.writes, r.lastActor
}

func dialService(t *testing.T, register func(*grpc.Server)) *grpc.ClientConn {
	t.Helper()
	listener := bufconn.Listen(1024 * 1024)
	server := grpc.NewServer()
	register(server)
	go func() { _ = server.Serve(listener) }()
	t.Cleanup(func() {
		server.Stop()
		_ = listener.Close()
	})
	conn, err := grpc.NewClient("passthrough:///bufnet",
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) { return listener.Dial() }),
	)
	if err != nil {
		t.Fatalf("dial in-memory gRPC service: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return conn
}

type harness struct {
	scriptsConn *grpc.ClientConn
	scripts     scriptspb.ScriptsServiceClient
	workspace   workspacepb.WorkspaceServiceClient
	collab      collabpb.CollaborationServiceClient
	repo        *collabFixtureRepo
}

func newHarness(t *testing.T) *harness {
	return newHarnessWithScriptsError(t, nil)
}

func newHarnessWithScriptsError(t *testing.T, scriptsErr error) *harness {
	t.Helper()
	scriptsConn := dialService(t, func(s *grpc.Server) { scriptspb.RegisterScriptsServiceServer(s, scriptsFixture{err: scriptsErr}) })
	workspaceConn := dialService(t, func(s *grpc.Server) {
		workspacepb.RegisterWorkspaceServiceServer(s, workspaceFixture{roles: map[string]string{
			adminID: "admin", orgEditorID: "editor", orgViewerID: "viewer", mixedID: "viewer", mixedAdminID: "admin",
		}})
	})
	commentID := uuid.MustParse("00000000-0000-0000-0000-000000000020")
	repo := &collabFixtureRepo{grants: map[uuid.UUID]directGrant{
		uuid.MustParse(directEditorID): {role: "editor", status: "active"},
		uuid.MustParse(pendingID):      {role: "editor", status: "pending"},
		uuid.MustParse(removedID):      {role: "editor", status: "removed"},
		uuid.MustParse(mixedID):        {role: "editor", status: "active"},
		uuid.MustParse(mixedAdminID):   {role: "viewer", status: "active"},
	}, comments: map[uuid.UUID]*domain.Comment{
		commentID: {ID: commentID, ProjectID: uuid.MustParse(projectID), UserID: uuid.MustParse(ownerID)},
	}}
	collabConn := dialService(t, func(s *grpc.Server) {
		collabpb.RegisterCollaborationServiceServer(s, handlers.NewCollaborationHandler(service.NewCollaborationService(nil, repo, nil, nil)))
	})
	return &harness{
		scriptsConn: scriptsConn,
		scripts:     scriptspb.NewScriptsServiceClient(scriptsConn),
		workspace:   workspacepb.NewWorkspaceServiceClient(workspaceConn),
		collab:      collabpb.NewCollaborationServiceClient(collabConn),
		repo:        repo,
	}
}

func TestSubResourceAuthorizationUsesItsStoredProject(t *testing.T) {
	h := newHarness(t)
	resource, err := h.collab.GetResourceProject(context.Background(), &collabpb.GetResourceProjectRequest{
		ResourceType: collabpb.ResourceType_RESOURCE_TYPE_COMMENT,
		ResourceId:   "00000000-0000-0000-0000-000000000020",
	})
	if err != nil {
		t.Fatal(err)
	}
	if resource.ProjectId != projectID {
		t.Fatalf("resource project = %s, want %s", resource.ProjectId, projectID)
	}
	if _, err := gateway.RequireProjectRole(context.Background(), orgViewerID, resource.ProjectId, gateway.ActionCommentModerate, h.scripts, h.collab, h.workspace); err == nil {
		t.Fatal("viewer was allowed to moderate a comment resolved from its stored project")
	}
	if _, err := gateway.RequireProjectRole(context.Background(), orgEditorID, resource.ProjectId, gateway.ActionCommentModerate, h.scripts, h.collab, h.workspace); err != nil {
		t.Fatalf("editor denied moderation: %v", err)
	}
}

func TestRealtimeViewerCanObservePresenceButCannotEmitEdits(t *testing.T) {
	h := newHarness(t)
	role, err := gateway.ResolveProjectRole(context.Background(), orgViewerID, projectID, h.scripts, h.collab, h.workspace)
	if err != nil {
		t.Fatal(err)
	}
	if !gateway.Can(role, gateway.ActionRead) {
		t.Fatal("viewer cannot join the realtime read/presence path")
	}
	if gateway.Can(role, gateway.ActionRealtimeEdit) {
		t.Fatal("viewer can emit realtime edit frames")
	}
	if err := h.updatePresence(context.Background(), orgViewerID); err != nil {
		t.Fatalf("viewer presence update: %v", err)
	}
}

func TestRoleMatrixAcrossGRPCBoundaries(t *testing.T) {
	h := newHarness(t)
	tests := []struct {
		name string
		user string
		want gateway.ProjectRole
	}{
		{"project owner", ownerID, gateway.RoleOwner},
		{"organization admin", adminID, gateway.RoleOrgAdmin},
		{"organization editor", orgEditorID, gateway.RoleEditor},
		{"organization viewer", orgViewerID, gateway.RoleViewer},
		{"direct editor", directEditorID, gateway.RoleEditor},
		{"pending collaborator", pendingID, gateway.RoleNone},
		{"removed collaborator", removedID, gateway.RoleNone},
		{"non-member", strangerID, gateway.RoleNone},
		{"org viewer plus direct editor uses higher role", mixedID, gateway.RoleEditor},
		{"org admin plus direct viewer uses higher role", mixedAdminID, gateway.RoleOrgAdmin},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := gateway.ResolveProjectRole(context.Background(), tt.user, projectID, h.scripts, h.collab, h.workspace)
			if err != nil {
				t.Fatalf("resolve role: %v", err)
			}
			if got != tt.want {
				t.Fatalf("role = %s, want %s", got, tt.want)
			}
		})
	}
}

func collabRole(role gateway.ProjectRole) collabpb.CallerRole {
	switch role {
	case gateway.RoleOwner:
		return collabpb.CallerRole_CALLER_ROLE_OWNER
	case gateway.RoleOrgAdmin:
		return collabpb.CallerRole_CALLER_ROLE_ORG_ADMIN
	case gateway.RoleEditor:
		return collabpb.CallerRole_CALLER_ROLE_EDITOR
	case gateway.RoleViewer:
		return collabpb.CallerRole_CALLER_ROLE_VIEWER
	default:
		return collabpb.CallerRole_CALLER_ROLE_NONE
	}
}

func (h *harness) updatePresence(ctx context.Context, userID string) error {
	role, err := gateway.RequireProjectRole(ctx, userID, projectID, gateway.ActionRead, h.scripts, h.collab, h.workspace)
	if err != nil {
		return err
	}
	_, err = h.collab.UpdatePresence(ctx, &collabpb.UpdatePresenceRequest{
		UserId: userID, ProjectId: projectID, CursorPosition: 7, CallerRole: collabRole(role),
	})
	return err
}

func TestAuthorizedMutationPreservesActorAndDenialWritesNothing(t *testing.T) {
	h := newHarness(t)
	for _, userID := range []string{ownerID, adminID, orgEditorID, orgViewerID, directEditorID, mixedID} {
		if err := h.updatePresence(context.Background(), userID); err != nil {
			t.Fatalf("authorized presence update for %s: %v", userID, err)
		}
		_, actor := h.repo.snapshot()
		if actor.String() != userID {
			t.Fatalf("persisted actor = %s, want %s", actor, userID)
		}
	}
	writesBefore, _ := h.repo.snapshot()
	for _, userID := range []string{pendingID, removedID, strangerID} {
		err := h.updatePresence(context.Background(), userID)
		var apiErr *apierror.Error
		if err == nil || !asAPIError(err, &apiErr) || apiErr.Code != apierror.CodePermissionDenied {
			t.Fatalf("denied user %s: got %v, want PERMISSION_DENIED", userID, err)
		}
	}
	writesAfter, _ := h.repo.snapshot()
	if writesAfter != writesBefore {
		t.Fatalf("denied mutations wrote presence: before=%d after=%d", writesBefore, writesAfter)
	}
}

func asAPIError(err error, target **apierror.Error) bool {
	if e, ok := err.(*apierror.Error); ok {
		*target = e
		return true
	}
	return false
}

func TestAuthorizationDependencyUnavailableWritesNothing(t *testing.T) {
	h := newHarnessWithScriptsError(t, status.Error(codes.Unavailable, "scripts unavailable"))
	writesBefore, _ := h.repo.snapshot()
	err := h.updatePresence(context.Background(), orgViewerID)
	apiErr, ok := err.(*apierror.Error)
	if !ok || apiErr.Code != apierror.CodeUnavailable {
		t.Fatalf("error = %v, want UNAVAILABLE", err)
	}
	writesAfter, _ := h.repo.snapshot()
	if writesAfter != writesBefore {
		t.Fatalf("dependency failure wrote presence: before=%d after=%d", writesBefore, writesAfter)
	}
}
