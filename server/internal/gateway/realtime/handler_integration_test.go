package realtime

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"google.golang.org/grpc"
	nethttptest "net/http/httptest"

	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/internal/gateway/grpcclient"
	identity "inkwell/server/pkg/grpc/identity"
	scriptspb "inkwell/server/pkg/grpc/scripts"
)

// scriptsStub admits every caller as the project owner so ResolveProjectAccess
// returns on its fast path (the access check itself is exercised by the REST
// handler tests; here we only need the WS upgrade to proceed).
type scriptsStub struct{ scriptspb.ScriptsServiceClient }

func (scriptsStub) GetProject(context.Context, *scriptspb.GetProjectRequest, ...grpc.CallOption) (*scriptspb.GetProjectResponse, error) {
	return &scriptspb.GetProjectResponse{}, nil
}

// identityStub names each user after their id so peers are distinguishable.
type identityStub struct{ identity.IdentityServiceClient }

func (identityStub) GetUser(_ context.Context, in *identity.GetUserRequest, _ ...grpc.CallOption) (*identity.GetUserResponse, error) {
	return &identity.GetUserResponse{User: &identity.User{Id: in.GetUserId(), FirstName: in.GetUserId()}}, nil
}

// presenceTestServer wires the realtime handler behind a chi router that injects
// the X-Test-User header as the authenticated user id.
func presenceTestServer(t *testing.T) *nethttptest.Server {
	t.Helper()
	h := NewHandler(&grpcclient.Registry{Scripts: scriptsStub{}, Identity: identityStub{}}, nil)
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

// dial connects a presence client as the given user.
func dial(t *testing.T, srv *nethttptest.Server, userID string) *websocket.Conn {
	t.Helper()
	url := strings.Replace(srv.URL, "http", "ws", 1) + "/ws/projects/p1"
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{
		HTTPHeader: http.Header{"X-Test-User": []string{userID}},
	})
	if err != nil {
		t.Fatalf("dial %s: %v", userID, err)
	}
	return ws
}

// readFrame reads one JSON frame into a generic map with a short deadline.
func readFrame(t *testing.T, ws *websocket.Conn) map[string]any {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, data, err := ws.Read(ctx)
	if err != nil {
		t.Fatalf("read frame: %v", err)
	}
	var frame map[string]any
	if err := json.Unmarshal(data, &frame); err != nil {
		t.Fatalf("decode frame %q: %v", data, err)
	}
	return frame
}

// expectNoFrame asserts the connection receives nothing within dur — used to
// prove a sender is excluded from its own broadcast.
func expectNoFrame(t *testing.T, ws *websocket.Conn, dur time.Duration) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), dur)
	defer cancel()
	if _, data, err := ws.Read(ctx); err == nil {
		t.Fatalf("expected no frame, got %q", data)
	}
}

// TestEditFrameRelayedToRoom drives a live element edit: the sender's edit
// reaches the other peer verbatim and is never echoed back to the sender.
func TestEditFrameRelayedToRoom(t *testing.T) {
	srv := presenceTestServer(t)
	defer srv.Close()

	a := dial(t, srv, "user-a")
	defer a.Close(websocket.StatusNormalClosure, "")
	readFrame(t, a) // A's roster (empty)

	b := dial(t, srv, "user-b")
	defer b.Close(websocket.StatusNormalClosure, "")
	readFrame(t, b) // B's roster
	readFrame(t, a) // A sees peer_join(B)

	edit := `{"type":"edit","elementId":"el-9","content":"hello","isScene":false}`
	if err := a.Write(context.Background(), websocket.MessageText, []byte(edit)); err != nil {
		t.Fatalf("A write edit: %v", err)
	}

	got := readFrame(t, b)
	if got["type"] != "edit" || got["elementId"] != "el-9" || got["content"] != "hello" {
		t.Fatalf("B edit frame = %+v, want el-9/hello", got)
	}
	// The sender must not receive its own edit.
	expectNoFrame(t, a, 200*time.Millisecond)
}

// TestPresenceProtocolEndToEnd drives a full presence exchange over real
// WebSocket connections: roster on join, peer_join broadcast, focus relay, and
// peer_leave on disconnect.
func TestPresenceProtocolEndToEnd(t *testing.T) {
	srv := presenceTestServer(t)
	defer srv.Close()

	// A joins an empty room → empty roster.
	a := dial(t, srv, "user-a")
	defer a.Close(websocket.StatusNormalClosure, "")
	if f := readFrame(t, a); f["type"] != "roster" || len(f["peers"].([]any)) != 0 {
		t.Fatalf("A first frame = %+v, want empty roster", f)
	}

	// B joins → B's roster lists A; A receives a peer_join for B.
	b := dial(t, srv, "user-b")
	bRoster := readFrame(t, b)
	if bRoster["type"] != "roster" {
		t.Fatalf("B first frame = %+v, want roster", bRoster)
	}
	peers := bRoster["peers"].([]any)
	if len(peers) != 1 || peers[0].(map[string]any)["userId"] != "user-a" {
		t.Fatalf("B roster = %+v, want [user-a]", peers)
	}

	join := readFrame(t, a)
	if join["type"] != "peer_join" {
		t.Fatalf("A frame = %+v, want peer_join", join)
	}
	bPeer := join["peer"].(map[string]any)
	if bPeer["userId"] != "user-b" || bPeer["name"] != "user-b" {
		t.Fatalf("peer_join peer = %+v, want user-b", bPeer)
	}
	bConnID := bPeer["connId"].(string)

	// B reports focus → A receives a focus frame with server-stamped identity.
	if err := b.Write(context.Background(), websocket.MessageText,
		[]byte(`{"type":"focus","elementId":"el-1","label":"Intro"}`)); err != nil {
		t.Fatalf("B write focus: %v", err)
	}
	focus := readFrame(t, a)
	if focus["type"] != "focus" {
		t.Fatalf("A frame = %+v, want focus", focus)
	}
	fp := focus["peer"].(map[string]any)
	if fp["userId"] != "user-b" || fp["elementId"] != "el-1" || fp["label"] != "Intro" {
		t.Fatalf("focus peer = %+v, want user-b editing el-1/Intro", fp)
	}

	// B leaves → A receives peer_leave for B's connection.
	b.Close(websocket.StatusNormalClosure, "bye")
	leave := readFrame(t, a)
	if leave["type"] != "peer_leave" || leave["connId"] != bConnID {
		t.Fatalf("A frame = %+v, want peer_leave for %s", leave, bConnID)
	}
}
