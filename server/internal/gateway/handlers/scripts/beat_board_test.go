package scripts

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/pkg/grpc/collab"
	scriptspb "inkwell/server/pkg/grpc/scripts"
)

// fakeScriptsClient is a hand-rolled ScriptsServiceClient for the gateway beat
// board handlers. It embeds the generated interface so unused methods are
// present (and panic if reached). The Get* discovery calls return a sub-resource
// owned by projectID; GetProject succeeds only for ownerUserID (the owner
// fast-path in ResolveProjectAccess); the Delete* calls record what they were
// dispatched with.
type fakeScriptsClient struct {
	scriptspb.ScriptsServiceClient

	projectID   string // project the discovered sub-resources belong to
	ownerUserID string // GetProject succeeds only when called with this user id

	discoveredID string // id passed to the Get* discovery call
	deletedID    string // id passed to the Delete* call
	deletedUser  string // user id passed to the Delete* call
	deleteCalled bool
}

func (f *fakeScriptsClient) GetProject(_ context.Context, in *scriptspb.GetProjectRequest, _ ...grpc.CallOption) (*scriptspb.GetProjectResponse, error) {
	if in.UserId != "" && in.UserId == f.ownerUserID {
		return &scriptspb.GetProjectResponse{}, nil
	}
	return nil, status.Error(codes.PermissionDenied, "not owner")
}

func (f *fakeScriptsClient) GetBeat(_ context.Context, in *scriptspb.GetBeatRequest, _ ...grpc.CallOption) (*scriptspb.GetBeatResponse, error) {
	f.discoveredID = in.BeatId
	return &scriptspb.GetBeatResponse{Beat: &scriptspb.Beat{ProjectId: f.projectID}}, nil
}

func (f *fakeScriptsClient) GetConnection(_ context.Context, in *scriptspb.GetConnectionRequest, _ ...grpc.CallOption) (*scriptspb.GetConnectionResponse, error) {
	f.discoveredID = in.ConnectionId
	return &scriptspb.GetConnectionResponse{Connection: &scriptspb.Connection{ProjectId: f.projectID}}, nil
}

func (f *fakeScriptsClient) GetLane(_ context.Context, in *scriptspb.GetLaneRequest, _ ...grpc.CallOption) (*scriptspb.GetLaneResponse, error) {
	f.discoveredID = in.LaneId
	return &scriptspb.GetLaneResponse{Lane: &scriptspb.Lane{ProjectId: f.projectID}}, nil
}

func (f *fakeScriptsClient) GetOutlineItem(_ context.Context, in *scriptspb.GetOutlineItemRequest, _ ...grpc.CallOption) (*scriptspb.GetOutlineItemResponse, error) {
	f.discoveredID = in.OutlineItemId
	return &scriptspb.GetOutlineItemResponse{OutlineItem: &scriptspb.OutlineItem{ProjectId: f.projectID}}, nil
}

func (f *fakeScriptsClient) DeleteBeat(_ context.Context, in *scriptspb.DeleteBeatRequest, _ ...grpc.CallOption) (*scriptspb.DeleteBeatResponse, error) {
	f.deletedID, f.deletedUser, f.deleteCalled = in.BeatId, in.UserId, true
	return &scriptspb.DeleteBeatResponse{}, nil
}

func (f *fakeScriptsClient) DeleteConnection(_ context.Context, in *scriptspb.DeleteConnectionRequest, _ ...grpc.CallOption) (*scriptspb.DeleteConnectionResponse, error) {
	f.deletedID, f.deletedUser, f.deleteCalled = in.ConnectionId, in.UserId, true
	return &scriptspb.DeleteConnectionResponse{}, nil
}

func (f *fakeScriptsClient) DeleteLane(_ context.Context, in *scriptspb.DeleteLaneRequest, _ ...grpc.CallOption) (*scriptspb.DeleteLaneResponse, error) {
	f.deletedID, f.deletedUser, f.deleteCalled = in.LaneId, in.UserId, true
	return &scriptspb.DeleteLaneResponse{}, nil
}

func (f *fakeScriptsClient) DeleteOutlineItem(_ context.Context, in *scriptspb.DeleteOutlineItemRequest, _ ...grpc.CallOption) (*scriptspb.DeleteOutlineItemResponse, error) {
	f.deletedID, f.deletedUser, f.deleteCalled = in.OutlineItemId, in.UserId, true
	return &scriptspb.DeleteOutlineItemResponse{}, nil
}

// fakeCollabClient reports a single active collaborator (activeUserID). An empty
// activeUserID means the project has no collaborators.
type fakeCollabClient struct {
	collab.CollaborationServiceClient
	activeUserID string
}

func (f *fakeCollabClient) GetProjectCollaborators(_ context.Context, _ *collab.GetProjectCollaboratorsRequest, _ ...grpc.CallOption) (*collab.GetProjectCollaboratorsResponse, error) {
	if f.activeUserID == "" {
		return &collab.GetProjectCollaboratorsResponse{}, nil
	}
	return &collab.GetProjectCollaboratorsResponse{
		Collaborators: []*collab.Collaborator{{UserId: f.activeUserID, Status: "active"}},
	}, nil
}

// deleteRouter mounts the four beat-board DELETE routes under /api/v1 (the prefix
// that broke the old TrimPrefix id parsing) with the supplied user injected as
// the authenticated caller.
func deleteRouter(h *ScriptsHandler, callerUserID string) *chi.Mux {
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(contextx.WithUserID(req.Context(), callerUserID)))
		})
	})
	r.Route("/api/v1", func(r chi.Router) {
		r.Route("/beats", func(r chi.Router) { r.Delete("/{beatId}", h.DeleteBeat) })
		r.Delete("/connections/{connectionId}", h.DeleteConnection)
		r.Route("/lanes", func(r chi.Router) { r.Delete("/{laneId}", h.DeleteLane) })
		r.Route("/outline-items", func(r chi.Router) { r.Delete("/{itemId}", h.DeleteOutlineItem) })
	})
	return r
}

// TestBeatSubResourceDeleteAsOwner pins two things at once for every beat-board
// sub-resource: (1) the bare id is extracted from the /api/v1-mounted URL (the
// regression where TrimPrefix leaked the whole path), and (2) the project owner
// is authorized, so the downstream delete fires with the owner's id.
func TestBeatSubResourceDeleteAsOwner(t *testing.T) {
	cases := []struct {
		name   string
		path   string
		wantID string
	}{
		{"beat", "/api/v1/beats/beat-123", "beat-123"},
		{"connection", "/api/v1/connections/conn-456", "conn-456"},
		{"lane", "/api/v1/lanes/lane-789", "lane-789"},
		{"outlineItem", "/api/v1/outline-items/item-abc", "item-abc"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sc := &fakeScriptsClient{projectID: "proj-1", ownerUserID: "user-1"}
			h := &ScriptsHandler{scriptsClient: sc, collabClient: &fakeCollabClient{}}

			req := httptest.NewRequest(http.MethodDelete, tc.path, nil)
			rec := httptest.NewRecorder()
			deleteRouter(h, "user-1").ServeHTTP(rec, req)

			if rec.Code != http.StatusNoContent {
				t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
			}
			if sc.discoveredID != tc.wantID {
				t.Errorf("discovery id = %q, want %q (full path leaked?)", sc.discoveredID, tc.wantID)
			}
			if sc.deletedID != tc.wantID {
				t.Errorf("deleted id = %q, want %q", sc.deletedID, tc.wantID)
			}
			if sc.deletedUser != "user-1" {
				t.Errorf("deleted as user %q, want owner %q", sc.deletedUser, "user-1")
			}
		})
	}
}

// TestBeatSubResourceDeleteUnauthorized is the security regression: a signed-in
// user who is neither owner nor collaborator of the beat's project must be
// rejected with 403, and the delete must never reach the scripts service. This
// is exactly the hole the old blanket "retry with empty user_id" opened.
func TestBeatSubResourceDeleteUnauthorized(t *testing.T) {
	sc := &fakeScriptsClient{projectID: "proj-1", ownerUserID: "owner-9"}
	h := &ScriptsHandler{scriptsClient: sc, collabClient: &fakeCollabClient{}} // no collaborators

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/beats/beat-123", nil)
	rec := httptest.NewRecorder()
	deleteRouter(h, "intruder-7").ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
	if sc.deleteCalled {
		t.Errorf("DeleteBeat was dispatched for an unauthorized caller (id=%q user=%q)", sc.deletedID, sc.deletedUser)
	}
}

// TestBeatSubResourceDeleteAsCollaborator confirms an active collaborator (not
// the owner) is authorized, and the delete is dispatched with the empty-user
// bypass sentinel the scripts service expects for a gateway-authorized caller.
func TestBeatSubResourceDeleteAsCollaborator(t *testing.T) {
	sc := &fakeScriptsClient{projectID: "proj-1", ownerUserID: "owner-9"}
	cc := &fakeCollabClient{activeUserID: "collab-3"}
	h := &ScriptsHandler{scriptsClient: sc, collabClient: cc}

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/beats/beat-123", nil)
	rec := httptest.NewRecorder()
	deleteRouter(h, "collab-3").ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
	if !sc.deleteCalled {
		t.Fatal("DeleteBeat was not dispatched for an authorized collaborator")
	}
	if sc.deletedUser != "" {
		t.Errorf("collaborator delete dispatched with user %q, want empty bypass sentinel", sc.deletedUser)
	}
}
