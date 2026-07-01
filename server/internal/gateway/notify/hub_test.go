package notify

import (
	"testing"
	"time"
)

// recv reads one frame from a connection with a short deadline, or fails.
func recv(t *testing.T, c *conn) []byte {
	t.Helper()
	select {
	case msg := <-c.send:
		return msg
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected a frame, got none")
		return nil
	}
}

// expectNothing asserts a connection receives no frame within the window.
func expectNothing(t *testing.T, c *conn) {
	t.Helper()
	select {
	case msg := <-c.send:
		t.Fatalf("expected no frame, got %q", msg)
	case <-time.After(100 * time.Millisecond):
	}
}

func TestPushDeliversToTargetUserOnly(t *testing.T) {
	h := NewHub(nil) // local-only
	a := &conn{userID: "user-a", send: make(chan []byte, 4)}
	a2 := &conn{userID: "user-a", send: make(chan []byte, 4)} // a's second tab
	b := &conn{userID: "user-b", send: make(chan []byte, 4)}
	h.join(a)
	h.join(a2)
	h.join(b)

	h.Push("user-a", []byte(`{"type":"notification","kind":"invite"}`))

	// Both of user-a's connections get it; user-b's does not.
	if got := string(recv(t, a)); got != `{"type":"notification","kind":"invite"}` {
		t.Fatalf("a frame = %q", got)
	}
	recv(t, a2)
	expectNothing(t, b)
}

func TestNotifyInviteSkipsNonUsers(t *testing.T) {
	h := NewHub(nil)
	// A connection that shouldn't receive anything for empty / nil ids.
	c := &conn{userID: "", send: make(chan []byte, 1)}
	h.join(c)
	h.NotifyInvite("")
	h.NotifyInvite("00000000-0000-0000-0000-000000000000")
	expectNothing(t, c)
}

func TestLeaveStopsDelivery(t *testing.T) {
	h := NewHub(nil)
	a := &conn{userID: "user-a", send: make(chan []byte, 1)}
	h.join(a)
	h.leave(a)
	h.Push("user-a", []byte("x"))
	expectNothing(t, a)
}
