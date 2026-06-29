package realtime

import (
	"encoding/json"
	"testing"
)

// newConn builds a hub-registered connection stand-in for tests.
func (h *Hub) newConn(userID, name string) *conn {
	return &conn{id: h.nextConnID(), userID: userID, name: name, send: make(chan []byte, sendBuffer)}
}

func TestJoinReturnsExistingRosterExcludingJoiner(t *testing.T) {
	h := NewHub()
	a := h.newConn("user-a", "Ada")
	b := h.newConn("user-b", "Babbage")

	if roster := h.join("p1", a); len(roster) != 0 {
		t.Fatalf("first joiner should see an empty room, got %d peers", len(roster))
	}
	roster := h.join("p1", b)
	if len(roster) != 1 {
		t.Fatalf("second joiner should see 1 peer, got %d", len(roster))
	}
	if roster[0].ConnID != a.id || roster[0].Name != "Ada" {
		t.Fatalf("roster should describe the first peer, got %+v", roster[0])
	}
	if h.RoomSize("p1") != 2 {
		t.Fatalf("room size = %d, want 2", h.RoomSize("p1"))
	}
}

func TestSetFocusReflectedInRoster(t *testing.T) {
	h := NewHub()
	a := h.newConn("user-a", "Ada")
	h.join("p1", a)

	peer := h.setFocus(a, "el-7", "Forest Path")
	if peer.ElementID != "el-7" || peer.Label != "Forest Path" {
		t.Fatalf("setFocus returned %+v", peer)
	}

	b := h.newConn("user-b", "Babbage")
	roster := h.join("p1", b)
	if len(roster) != 1 || roster[0].ElementID != "el-7" || roster[0].Label != "Forest Path" {
		t.Fatalf("new joiner should see A's focus in the roster, got %+v", roster)
	}
}

func TestBroadcastExcludesSenderAndSkipsFullBuffers(t *testing.T) {
	h := NewHub()
	sender := h.newConn("user-a", "Ada")
	listener := h.newConn("user-b", "Babbage")
	h.join("p1", sender)
	h.join("p1", listener)

	h.broadcast("p1", sender, []byte("hello"))

	if len(sender.send) != 0 {
		t.Fatalf("sender should not receive its own broadcast")
	}
	select {
	case got := <-listener.send:
		if string(got) != "hello" {
			t.Fatalf("listener got %q, want hello", got)
		}
	default:
		t.Fatal("listener should have received the broadcast")
	}

	// A full buffer is skipped, never blocks the broadcaster.
	for i := 0; i < sendBuffer; i++ {
		listener.send <- []byte("x")
	}
	h.broadcast("p1", sender, []byte("overflow")) // must return promptly
}

func TestLeaveDropsEmptyRoom(t *testing.T) {
	h := NewHub()
	a := h.newConn("user-a", "Ada")
	h.join("p1", a)
	h.leave("p1", a)
	if h.RoomSize("p1") != 0 {
		t.Fatalf("room should be empty/gone after the last leave")
	}
}

func TestProtocolEncoders(t *testing.T) {
	// roster with no peers must still serialize an array, not null.
	var rf rosterFrame
	if err := json.Unmarshal(encodeRoster(nil), &rf); err != nil {
		t.Fatalf("roster unmarshal: %v", err)
	}
	if rf.Type != TypeRoster || rf.Peers == nil {
		t.Fatalf("empty roster = %+v, want type=roster non-nil peers", rf)
	}

	var pf peerFrame
	if err := json.Unmarshal(encodePeer(TypeFocus, Peer{ConnID: "1", Label: "Intro"}), &pf); err != nil {
		t.Fatalf("peer unmarshal: %v", err)
	}
	if pf.Type != TypeFocus || pf.Peer.Label != "Intro" {
		t.Fatalf("focus frame = %+v", pf)
	}

	var lf leaveFrame
	if err := json.Unmarshal(encodeLeave("9"), &lf); err != nil {
		t.Fatalf("leave unmarshal: %v", err)
	}
	if lf.Type != TypePeerLeave || lf.ConnID != "9" {
		t.Fatalf("leave frame = %+v", lf)
	}
}

func TestParseInbound(t *testing.T) {
	in, ok := parseInbound([]byte(`{"type":"focus","elementId":"el-1","label":"Scene"}`))
	if !ok || in.Type != TypeFocus || in.ElementID != "el-1" || in.Label != "Scene" {
		t.Fatalf("parsed = %+v ok=%v", in, ok)
	}
	if _, ok := parseInbound([]byte(`not json`)); ok {
		t.Fatal("garbage should not parse")
	}
	if _, ok := parseInbound([]byte(`{"elementId":"x"}`)); ok {
		t.Fatal("a typeless frame should be rejected")
	}
}
