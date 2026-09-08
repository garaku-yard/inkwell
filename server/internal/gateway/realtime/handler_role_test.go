package realtime

import (
	"context"
	"net/http"
	nethttptest "net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/pkg/grpc/collab"
	scriptspb "inkwell/server/pkg/grpc/scripts"
)

// roleScriptsStub admits ownerUserID on the fast path and denies everyone
// else, so ResolveProjectRole falls through to the collaborator check below —
// exercising the same resolution real REST handlers use, not a shortcut.
type roleScriptsStub struct {
	scriptspb.ScriptsServiceClient
	ownerUserID string
}

func (s roleScriptsStub) GetProject(_ context.Context, in *scriptspb.GetProjectRequest, _ ...grpc.CallOption) (*scriptspb.GetProjectResponse, error) {
	if in.UserId != "" && in.UserId == s.ownerUserID {
		return &scriptspb.GetProjectResponse{Project: &scriptspb.Project{OwnerId: s.ownerUserID}}, nil
	}
	return nil, status.Error(codes.PermissionDenied, "not owner")
}

func (s roleScriptsStub) GetProjectAccessMetadata(context.Context, *scriptspb.GetProjectAccessMetadataRequest, ...grpc.CallOption) (*scriptspb.GetProjectAccessMetadataResponse, error) {
	return &scriptspb.GetProjectAccessMetadataResponse{OwnerId: s.ownerUserID}, nil
}

// roleCollabStub reports one active collaborator per userID→role, and answers
// GetResourceProject as a no-op (unused by HandleWS).
type roleCollabStub struct {
	collab.CollaborationServiceClient
	roles map[string]string // userID -> collab role
}

func (s roleCollabStub) GetProjectCollaborators(_ context.Context, _ *collab.GetProjectCollaboratorsRequest, _ ...grpc.CallOption) (*collab.GetProjectCollaboratorsResponse, error) {
	out := make([]*collab.Collaborator, 0, len(s.roles))
	for userID, role := range s.roles {
		out = append(out, &collab.Collaborator{UserId: userID, Status: "active", Role: role})
	}
	return &collab.GetProjectCollaboratorsResponse{Collaborators: out}, nil
}

// StartEditSession/EndEditSession are the durable-session calls HandleWS
// makes on every join/focus/disconnect (sessions.go). A real *collab client
// is embedded (not nil), so sessionRecorder treats it as present and would
// otherwise panic on the embedded nil CollaborationServiceClient.
func (s roleCollabStub) StartEditSession(_ context.Context, _ *collab.StartEditSessionRequest, _ ...grpc.CallOption) (*collab.StartEditSessionResponse, error) {
	return &collab.StartEditSessionResponse{Session: &collab.EditSession{Id: "session-stub"}}, nil
}

func (s roleCollabStub) EndEditSession(_ context.Context, _ *collab.EndEditSessionRequest, _ ...grpc.CallOption) (*collab.EndEditSessionResponse, error) {
	return &collab.EndEditSessionResponse{Success: true}, nil
}

// roleTestServer wires the realtime handler with an owner and a set of
// role-bearing collaborators, so a test can dial as any of them.
func roleTestServer(t *testing.T, ownerUserID string, collabRoles map[string]string) *nethttptest.Server {
	t.Helper()
	h := NewHandler(&grpcclient.Registry{
		Scripts:  roleScriptsStub{ownerUserID: ownerUserID},
		Identity: identityStub{},
		Collab:   roleCollabStub{roles: collabRoles},
	}, nil, nil)
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := contextx.WithUserID(req.Context(), req.Header.Get("X-Test-User"))
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})
	r.Get("/ws/projects/{projectId}", h.HandleWS)
	return nethttptest.NewServer(r)
}

// TestHandleWS_UnauthorizedRejected proves a caller with no relationship to
// the project (not the owner, not a collaborator) is rejected before the
// WebSocket upgrade.
func TestHandleWS_UnauthorizedRejected(t *testing.T) {
	srv := roleTestServer(t, "owner-1", nil)
	defer srv.Close()

	url := strings.Replace(srv.URL, "http", "ws", 1) + "/ws/projects/p1"
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, resp, err := websocket.Dial(ctx, url, &websocket.DialOptions{
		HTTPHeader: http.Header{"X-Test-User": []string{"intruder-1"}},
	})
	if err == nil {
		t.Fatal("expected the upgrade to be rejected for a non-member, got a live connection")
	}
	if resp == nil || resp.StatusCode != http.StatusForbidden {
		status := "<nil>"
		if resp != nil {
			status = resp.Status
		}
		t.Fatalf("response status = %s, want 403", status)
	}
}

// TestHandleWS_ViewerEditFrameNotRelayed is the Orbit #359 acceptance
// criterion: a viewer may connect and receive updates, but an edit frame it
// sends must be dropped, not fanned out to the room.
func TestHandleWS_ViewerEditFrameNotRelayed(t *testing.T) {
	srv := roleTestServer(t, "owner-1", map[string]string{"viewer-1": "viewer"})
	defer srv.Close()

	owner := dial(t, srv, "owner-1")
	defer owner.Close(websocket.StatusNormalClosure, "")
	readFrame(t, owner) // owner's roster (empty)

	viewer := dial(t, srv, "viewer-1")
	defer viewer.Close(websocket.StatusNormalClosure, "")
	readFrame(t, viewer) // viewer's roster
	readFrame(t, owner)  // owner sees peer_join(viewer) — connecting itself is allowed

	edit := `{"type":"edit","elementId":"el-1","content":"should not land","isScene":false}`
	if err := viewer.Write(context.Background(), websocket.MessageText, []byte(edit)); err != nil {
		t.Fatalf("viewer write edit: %v", err)
	}

	// The owner must receive nothing — the frame is dropped in readPump
	// before it ever reaches hub.broadcast, not merely un-echoed to the sender.
	expectNoFrame(t, owner, 300*time.Millisecond)
}

// TestHandleWS_EditorEditFrameRelayed is the positive counterpart: a
// collaborator with role "editor" (not the owner) may emit edit frames like
// TestEditFrameRelayedToRoom already proves for the owner.
func TestHandleWS_EditorEditFrameRelayed(t *testing.T) {
	srv := roleTestServer(t, "owner-1", map[string]string{"editor-1": "editor"})
	defer srv.Close()

	owner := dial(t, srv, "owner-1")
	defer owner.Close(websocket.StatusNormalClosure, "")
	readFrame(t, owner) // owner's roster (empty)

	editor := dial(t, srv, "editor-1")
	defer editor.Close(websocket.StatusNormalClosure, "")
	readFrame(t, editor) // editor's roster
	readFrame(t, owner)  // owner sees peer_join(editor)

	edit := `{"type":"edit","elementId":"el-2","content":"hello from editor","isScene":false}`
	if err := editor.Write(context.Background(), websocket.MessageText, []byte(edit)); err != nil {
		t.Fatalf("editor write edit: %v", err)
	}

	got := readFrame(t, owner)
	if got["type"] != "edit" || got["elementId"] != "el-2" || got["content"] != "hello from editor" {
		t.Fatalf("owner edit frame = %+v, want el-2/hello from editor", got)
	}
}
