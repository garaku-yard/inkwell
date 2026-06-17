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

// fakeScriptsClient is a hand-rolled ScriptsServiceClient for the gateway
// sub-resource handlers. It embeds the generated interface so unused methods are
// present (and panic if reached). GetResourceProject is the single discovery
// path the handlers use to learn a resource's project; GetProject succeeds only
// for ownerUserID (the owner fast-path in ResolveProjectAccess); the delete
// methods record what they were dispatched with.
type fakeScriptsClient struct {
	scriptspb.ScriptsServiceClient

	projectID   string // project every resolved resource belongs to
	ownerUserID string // GetProject succeeds only when called with this user id

	discType scriptspb.ResourceType // resource_type passed to GetResourceProject
	discID   string                 // resource_id passed to GetResourceProject

	deletedID    string // id passed to the dispatched delete
	deletedUser  string // user id passed to the dispatched delete
	deleteCalled bool
}

func (f *fakeScriptsClient) GetResourceProject(_ context.Context, in *scriptspb.GetResourceProjectRequest, _ ...grpc.CallOption) (*scriptspb.GetResourceProjectResponse, error) {
	f.discType, f.discID = in.ResourceType, in.ResourceId
	return &scriptspb.GetResourceProjectResponse{ProjectId: f.projectID}, nil
}

func (f *fakeScriptsClient) GetProject(_ context.Context, in *scriptspb.GetProjectRequest, _ ...grpc.CallOption) (*scriptspb.GetProjectResponse, error) {
	if in.UserId != "" && in.UserId == f.ownerUserID {
		return &scriptspb.GetProjectResponse{}, nil
	}
	return nil, status.Error(codes.PermissionDenied, "not owner")
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

func (f *fakeScriptsClient) DeleteScriptElement(_ context.Context, in *scriptspb.DeleteScriptElementRequest, _ ...grpc.CallOption) (*scriptspb.DeleteScriptElementResponse, error) {
	f.deletedID, f.deletedUser, f.deleteCalled = in.ScriptElementId, in.UserId, true
	return &scriptspb.DeleteScriptElementResponse{Success: true}, nil
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

// deleteRouter mounts every sub-resource DELETE route under /api/v1 (the prefix
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
		r.Route("/elements", func(r chi.Router) { r.Delete("/{elementId}", h.DeleteElement) })
	})
	return r
}

// subResourceCase describes one sub-resource DELETE route. wantType pins that the
// gateway routes the resource to GetResourceProject under the right enum, and
// wantID pins that the bare id is extracted from the /api/v1-mounted path (the
// regression where TrimPrefix leaked the whole path).
type subResourceCase struct {
	name       string
	path       string
	wantType   scriptspb.ResourceType
	wantID     string
	wantStatus int // 204 for the beat-board deletes; 200 for the element delete (returns a body)
}

var subResourceCases = []subResourceCase{
	{"beat", "/api/v1/beats/beat-123", scriptspb.ResourceType_RESOURCE_TYPE_BEAT, "beat-123", http.StatusNoContent},
	{"connection", "/api/v1/connections/conn-456", scriptspb.ResourceType_RESOURCE_TYPE_CONNECTION, "conn-456", http.StatusNoContent},
	{"lane", "/api/v1/lanes/lane-789", scriptspb.ResourceType_RESOURCE_TYPE_LANE, "lane-789", http.StatusNoContent},
	{"outlineItem", "/api/v1/outline-items/item-abc", scriptspb.ResourceType_RESOURCE_TYPE_OUTLINE_ITEM, "item-abc", http.StatusNoContent},
	{"element", "/api/v1/elements/el-xyz", scriptspb.ResourceType_RESOURCE_TYPE_ELEMENT, "el-xyz", http.StatusOK},
}

// TestSubResourceDeleteAsOwner pins three things for every sub-resource: (1) the
// bare id is extracted from the /api/v1-mounted URL, (2) it is resolved under the
// correct ResourceType, and (3) the project owner is authorized, so the delete
// fires with the owner's id.
func TestSubResourceDeleteAsOwner(t *testing.T) {
	for _, tc := range subResourceCases {
		t.Run(tc.name, func(t *testing.T) {
			sc := &fakeScriptsClient{projectID: "proj-1", ownerUserID: "user-1"}
			h := &ScriptsHandler{scriptsClient: sc, collabClient: &fakeCollabClient{}}

			req := httptest.NewRequest(http.MethodDelete, tc.path, nil)
			rec := httptest.NewRecorder()
			deleteRouter(h, "user-1").ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
			if sc.discType != tc.wantType {
				t.Errorf("resolved as type %v, want %v", sc.discType, tc.wantType)
			}
			if sc.discID != tc.wantID {
				t.Errorf("resolved id = %q, want %q (full path leaked?)", sc.discID, tc.wantID)
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

// TestSubResourceDeleteUnauthorized is the security regression: a signed-in user
// who is neither owner nor collaborator of the resource's project must be
// rejected with 403, and the delete must never reach the scripts service — the
// exact hole the old blanket "retry with empty user_id" opened.
func TestSubResourceDeleteUnauthorized(t *testing.T) {
	for _, tc := range subResourceCases {
		t.Run(tc.name, func(t *testing.T) {
			sc := &fakeScriptsClient{projectID: "proj-1", ownerUserID: "owner-9"}
			h := &ScriptsHandler{scriptsClient: sc, collabClient: &fakeCollabClient{}} // no collaborators

			req := httptest.NewRequest(http.MethodDelete, tc.path, nil)
			rec := httptest.NewRecorder()
			deleteRouter(h, "intruder-7").ServeHTTP(rec, req)

			if rec.Code != http.StatusForbidden {
				t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
			}
			if sc.deleteCalled {
				t.Errorf("delete was dispatched for an unauthorized caller (id=%q user=%q)", sc.deletedID, sc.deletedUser)
			}
		})
	}
}

// TestSubResourceDeleteAsCollaborator confirms an active collaborator (not the
// owner) is authorized, and the delete is dispatched with the empty-user bypass
// sentinel the scripts service expects for a gateway-authorized caller. The
// element case also exercises the DeleteScriptElement empty-user_id path that
// previously rejected collaborators.
func TestSubResourceDeleteAsCollaborator(t *testing.T) {
	for _, tc := range subResourceCases {
		t.Run(tc.name, func(t *testing.T) {
			sc := &fakeScriptsClient{projectID: "proj-1", ownerUserID: "owner-9"}
			cc := &fakeCollabClient{activeUserID: "collab-3"}
			h := &ScriptsHandler{scriptsClient: sc, collabClient: cc}

			req := httptest.NewRequest(http.MethodDelete, tc.path, nil)
			rec := httptest.NewRecorder()
			deleteRouter(h, "collab-3").ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
			if !sc.deleteCalled {
				t.Fatal("delete was not dispatched for an authorized collaborator")
			}
			if sc.deletedUser != "" {
				t.Errorf("collaborator delete dispatched with user %q, want empty bypass sentinel", sc.deletedUser)
			}
		})
	}
}
