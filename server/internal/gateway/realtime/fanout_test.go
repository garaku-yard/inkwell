package realtime

import (
	"encoding/json"
	"testing"
)

// fakePublisher records what the hub mirrors cross-instance.
type fakePublisher struct {
	calls []struct {
		projectID string
		data      string
	}
}

func (f *fakePublisher) Publish(projectID string, data []byte) {
	f.calls = append(f.calls, struct {
		projectID string
		data      string
	}{projectID, string(data)})
}

func TestBroadcastMirrorsToPublisherOnce(t *testing.T) {
	h := NewHub()
	pub := &fakePublisher{}
	h.pub = pub
	sender := h.newConn("user-a", "Ada")
	listener := h.newConn("user-b", "Babbage")
	h.join("p1", sender)
	h.join("p1", listener)

	h.broadcast("p1", sender, []byte("frame"))

	// Local delivery still excludes the sender.
	if len(sender.send) != 0 {
		t.Fatal("sender received its own local broadcast")
	}
	if got := <-listener.send; string(got) != "frame" {
		t.Fatalf("listener got %q", got)
	}
	// And the frame is mirrored to the publisher exactly once.
	if len(pub.calls) != 1 || pub.calls[0].projectID != "p1" || pub.calls[0].data != "frame" {
		t.Fatalf("publisher calls = %+v, want one p1/frame", pub.calls)
	}
}

func TestDeliverRemoteFansOutLocallyWithoutRepublishing(t *testing.T) {
	h := NewHub()
	pub := &fakePublisher{}
	h.pub = pub
	a := h.newConn("user-a", "Ada")
	b := h.newConn("user-b", "Babbage")
	h.join("p1", a)
	h.join("p1", b)

	// A frame arriving from another instance reaches every local conn...
	h.deliverRemote("p1", []byte("remote"))
	if got := <-a.send; string(got) != "remote" {
		t.Fatalf("a got %q", got)
	}
	if got := <-b.send; string(got) != "remote" {
		t.Fatalf("b got %q", got)
	}
	// ...and is never re-published (that would loop between instances).
	if len(pub.calls) != 0 {
		t.Fatalf("deliverRemote re-published: %+v", pub.calls)
	}
}

func TestDispatchDropsOwnInstanceEcho(t *testing.T) {
	f := &Fanout{instanceID: "self"}
	mine, _ := json.Marshal(envelope{Instance: "self", Data: json.RawMessage(`{"type":"focus"}`)})
	theirs, _ := json.Marshal(envelope{Instance: "other", Data: json.RawMessage(`{"type":"focus"}`)})

	var delivered []struct {
		projectID string
		data      string
	}
	deliver := func(projectID string, data []byte) {
		delivered = append(delivered, struct {
			projectID string
			data      string
		}{projectID, string(data)})
	}

	f.dispatch(channelFor("p1"), mine, deliver) // our own echo — dropped
	f.dispatch(channelFor("p1"), theirs, deliver)
	f.dispatch("rt:project:", theirs, deliver)         // empty project id — dropped
	f.dispatch("garbage", theirs, deliver)             // not a project channel — dropped
	f.dispatch(channelFor("p1"), []byte("{"), deliver) // bad json — dropped

	if len(delivered) != 1 {
		t.Fatalf("delivered %d frames, want 1: %+v", len(delivered), delivered)
	}
	if delivered[0].projectID != "p1" || delivered[0].data != `{"type":"focus"}` {
		t.Fatalf("delivered = %+v", delivered[0])
	}
}

func TestProjectIDFromChannel(t *testing.T) {
	if id, ok := projectIDFromChannel("rt:project:abc-123"); !ok || id != "abc-123" {
		t.Fatalf("got %q ok=%v", id, ok)
	}
	if _, ok := projectIDFromChannel("rt:other:x"); ok {
		t.Fatal("non-project channel should not parse")
	}
	if _, ok := projectIDFromChannel("rt:project:"); ok {
		t.Fatal("empty project id should not parse")
	}
}

func TestNewFanoutNilClient(t *testing.T) {
	if NewFanout(nil) != nil {
		t.Fatal("NewFanout(nil) should be nil so callers degrade to local-only")
	}
}
