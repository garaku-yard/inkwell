package realtime

import (
	"context"
	"net/http"
	nethttptest "net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"google.golang.org/grpc"

	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/pkg/grpc/collab"
)

// collabSessionStub records the durable edit-session gRPC calls the realtime
// handler makes, so a test can assert the join/focus/disconnect lifecycle. The
// interface is embedded so the rest of the collab surface is present; only the
// two session RPCs the recorder uses are overridden.
type collabSessionStub struct {
	collab.CollaborationServiceClient
	mu     sync.Mutex
	starts []*collab.StartEditSessionRequest
	ends   []string
	sessID string
}

func (s *collabSessionStub) StartEditSession(_ context.Context, in *collab.StartEditSessionRequest, _ ...grpc.CallOption) (*collab.StartEditSessionResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.starts = append(s.starts, in)
	return &collab.StartEditSessionResponse{Session: &collab.EditSession{
		Id:        s.sessID,
		ProjectId: in.ProjectId,
		UserId:    in.UserId,
		ElementId: in.ElementId,
	}}, nil
}

func (s *collabSessionStub) EndEditSession(_ context.Context, in *collab.EndEditSessionRequest, _ ...grpc.CallOption) (*collab.EndEditSessionResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ends = append(s.ends, in.SessionId)
	return &collab.EndEditSessionResponse{Success: true}, nil
}

func (s *collabSessionStub) firstStart() *collab.StartEditSessionRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.starts) == 0 {
		return nil
	}
	return s.starts[0]
}

func (s *collabSessionStub) hasStartWithElement(el string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, r := range s.starts {
		if r.ElementId == el {
			return true
		}
	}
	return false
}

func (s *collabSessionStub) endedWith(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, e := range s.ends {
		if e == id {
			return true
		}
	}
	return false
}

// sessionTestServer wires the realtime handler with a collab session stub so the
// durable-lock recorder has somewhere to write.
func sessionTestServer(t *testing.T, stub *collabSessionStub) *nethttptest.Server {
	t.Helper()
	h := NewHandler(&grpcclient.Registry{Scripts: scriptsStub{}, Identity: identityStub{}, Collab: stub}, nil, nil)
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

// waitFor polls cond until it holds or the deadline passes.
func waitFor(t *testing.T, cond func() bool, what string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

// TestDurableSessionLifecycle proves the realtime handler opens a durable edit
// session on join, moves its focus on a focus frame, and closes it on
// disconnect — the persistence behind soft locks that survive a reconnect.
func TestDurableSessionLifecycle(t *testing.T) {
	stub := &collabSessionStub{sessID: "sess-1"}
	srv := sessionTestServer(t, stub)
	defer srv.Close()

	ws := dialProject(t, srv, "user-a", "proj-1")
	// The join-time record runs before the roster is sent, so once we've read the
	// roster the StartEditSession has completed.
	readFrame(t, ws)

	first := stub.firstStart()
	if first == nil {
		t.Fatal("expected a StartEditSession on join, got none")
	}
	if first.ProjectId != "proj-1" || first.UserId != "user-a" || first.ElementId != "" {
		t.Fatalf("join start = %+v, want proj-1 / user-a / empty element", first)
	}

	// A focus frame moves the durable lock onto the focused element.
	focus := `{"type":"focus","elementId":"passage-7","label":"Intro"}`
	if err := ws.Write(context.Background(), websocket.MessageText, []byte(focus)); err != nil {
		t.Fatalf("write focus: %v", err)
	}
	waitFor(t, func() bool { return stub.hasStartWithElement("passage-7") }, "focus recorded on durable session")

	// Disconnecting closes the session.
	ws.Close(websocket.StatusNormalClosure, "")
	waitFor(t, func() bool { return stub.endedWith("sess-1") }, "durable session ended on disconnect")
}
