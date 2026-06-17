package scripts

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"google.golang.org/grpc"

	"inkwell/server/internal/gateway/contextx"
	scriptspb "inkwell/server/pkg/grpc/scripts"
)

// captureScriptsClient records the sub-resource ID it receives on each delete
// call so a test can assert the gateway extracted it from the URL correctly.
// It embeds the generated client interface so the methods it doesn't override
// are present (and panic if ever reached, surfacing an unexpected call).
type captureScriptsClient struct {
	scriptspb.ScriptsServiceClient
	beatID       string
	connectionID string
	laneID       string
	itemID       string
}

func (c *captureScriptsClient) DeleteBeat(_ context.Context, in *scriptspb.DeleteBeatRequest, _ ...grpc.CallOption) (*scriptspb.DeleteBeatResponse, error) {
	c.beatID = in.BeatId
	return &scriptspb.DeleteBeatResponse{}, nil
}

func (c *captureScriptsClient) DeleteConnection(_ context.Context, in *scriptspb.DeleteConnectionRequest, _ ...grpc.CallOption) (*scriptspb.DeleteConnectionResponse, error) {
	c.connectionID = in.ConnectionId
	return &scriptspb.DeleteConnectionResponse{}, nil
}

func (c *captureScriptsClient) DeleteLane(_ context.Context, in *scriptspb.DeleteLaneRequest, _ ...grpc.CallOption) (*scriptspb.DeleteLaneResponse, error) {
	c.laneID = in.LaneId
	return &scriptspb.DeleteLaneResponse{}, nil
}

func (c *captureScriptsClient) DeleteOutlineItem(_ context.Context, in *scriptspb.DeleteOutlineItemRequest, _ ...grpc.CallOption) (*scriptspb.DeleteOutlineItemResponse, error) {
	c.itemID = in.OutlineItemId
	return &scriptspb.DeleteOutlineItemResponse{}, nil
}

// TestBeatSubResourceIDsFromURLParam pins the regression where sub-resource
// handlers parsed the ID with strings.TrimPrefix(r.URL.Path, "/beats/"). Under
// the /api/v1 mount the path is "/api/v1/beats/{id}", which doesn't start with
// the prefix, so the whole path leaked through as the ID. The handlers now read
// the chi route param, which is mount-agnostic; this test mounts the routes
// under /api/v1 (the failing case) and asserts only the bare ID arrives.
func TestBeatSubResourceIDsFromURLParam(t *testing.T) {
	client := &captureScriptsClient{}
	h := &ScriptsHandler{scriptsClient: client}

	r := chi.NewRouter()
	// Inject an authenticated user, since these endpoints require auth.
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(contextx.WithUserID(req.Context(), "user-1")))
		})
	})
	// Mirror the real /api/v1 route tree (router.go) — the prefix is what broke
	// the old TrimPrefix parsing.
	r.Route("/api/v1", func(r chi.Router) {
		r.Route("/beats", func(r chi.Router) { r.Delete("/{beatId}", h.DeleteBeat) })
		r.Delete("/connections/{connectionId}", h.DeleteConnection)
		r.Route("/lanes", func(r chi.Router) { r.Delete("/{laneId}", h.DeleteLane) })
		r.Route("/outline-items", func(r chi.Router) { r.Delete("/{itemId}", h.DeleteOutlineItem) })
	})

	cases := []struct {
		name   string
		path   string
		got    func() string
		wantID string
	}{
		{"beat", "/api/v1/beats/beat-123", func() string { return client.beatID }, "beat-123"},
		{"connection", "/api/v1/connections/conn-456", func() string { return client.connectionID }, "conn-456"},
		{"lane", "/api/v1/lanes/lane-789", func() string { return client.laneID }, "lane-789"},
		{"outlineItem", "/api/v1/outline-items/item-abc", func() string { return client.itemID }, "item-abc"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodDelete, tc.path, nil)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if rec.Code != http.StatusNoContent {
				t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
			}
			if got := tc.got(); got != tc.wantID {
				t.Errorf("extracted ID = %q, want %q (full path leaked?)", got, tc.wantID)
			}
		})
	}
}
