package aiadapter

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
)

// stringReadCloser wraps a strings.Reader as an io.ReadCloser so the SSE
// scanner can treat it like the HTTP response body it normally consumes.
type stringReadCloser struct{ *strings.Reader }

func (s stringReadCloser) Close() error { return nil }

func newReader(s string) io.ReadCloser {
	return stringReadCloser{strings.NewReader(s)}
}

// collectEvents drains the scanner and returns every event it emits.
// Stops cleanly on io.EOF.
func collectEvents(t *testing.T, body io.ReadCloser) []sseEvent {
	t.Helper()
	scanner := newSSEScanner(body)
	defer scanner.Close()
	var out []sseEvent
	for {
		ev, err := scanner.Next(context.Background())
		if errors.Is(err, io.EOF) {
			return out
		}
		if err != nil {
			t.Fatalf("Next: %v", err)
		}
		out = append(out, ev)
	}
}

func TestSSE_SingleDataLine(t *testing.T) {
	evs := collectEvents(t, newReader("data: hello\n\n"))
	if len(evs) != 1 || evs[0].data != "hello" {
		t.Fatalf("got %+v", evs)
	}
}

func TestSSE_MultipleDataLinesConcatenated(t *testing.T) {
	// Per the SSE spec, multiple `data:` fields in one event are joined
	// with newlines.
	evs := collectEvents(t, newReader("data: first\ndata: second\n\n"))
	if len(evs) != 1 || evs[0].data != "first\nsecond" {
		t.Fatalf("got %+v", evs)
	}
}

func TestSSE_NamedEvent(t *testing.T) {
	evs := collectEvents(t, newReader("event: ping\ndata: {}\n\n"))
	if len(evs) != 1 {
		t.Fatalf("got %+v", evs)
	}
	if evs[0].event != "ping" || evs[0].data != "{}" {
		t.Fatalf("got %+v", evs)
	}
}

func TestSSE_CRLFLineEndings(t *testing.T) {
	evs := collectEvents(t, newReader("event: x\r\ndata: y\r\n\r\n"))
	if len(evs) != 1 || evs[0].event != "x" || evs[0].data != "y" {
		t.Fatalf("got %+v", evs)
	}
}

func TestSSE_CommentsIgnored(t *testing.T) {
	evs := collectEvents(t, newReader(": keepalive\ndata: real\n\n"))
	if len(evs) != 1 || evs[0].data != "real" {
		t.Fatalf("got %+v", evs)
	}
}

func TestSSE_SuppressesEmptyEvents(t *testing.T) {
	// A lone blank line with no preceding fields should not produce an
	// event.
	evs := collectEvents(t, newReader("\n\n\ndata: only\n\n"))
	if len(evs) != 1 || evs[0].data != "only" {
		t.Fatalf("got %+v", evs)
	}
}

func TestSSE_FinalEventWithoutTrailingBlankLine(t *testing.T) {
	// Some providers truncate the stream without the final empty line.
	// We should still emit the last event when EOF arrives.
	evs := collectEvents(t, newReader("data: last"))
	if len(evs) != 1 || evs[0].data != "last" {
		t.Fatalf("got %+v", evs)
	}
}

func TestSSE_MultipleEventsInOneStream(t *testing.T) {
	raw := "data: a\n\nevent: x\ndata: b\n\ndata: c\n\n"
	evs := collectEvents(t, newReader(raw))
	if len(evs) != 3 {
		t.Fatalf("got %d events: %+v", len(evs), evs)
	}
	if evs[0].data != "a" || evs[1].event != "x" || evs[1].data != "b" || evs[2].data != "c" {
		t.Fatalf("unexpected shapes: %+v", evs)
	}
}

func TestSSE_LeadingSpaceAfterColonStripped(t *testing.T) {
	// Spec: a single leading space after `:` is part of the field
	// separator, not the value.
	evs := collectEvents(t, newReader("data:no-space\ndata: one-space\n\n"))
	if len(evs) != 1 {
		t.Fatalf("got %+v", evs)
	}
	if evs[0].data != "no-space\none-space" {
		t.Fatalf("space handling wrong: %q", evs[0].data)
	}
}

func TestSSE_UnknownFieldsDropped(t *testing.T) {
	// id + retry are valid SSE fields we don't care about; they must
	// not bleed into data or event.
	evs := collectEvents(t, newReader("id: 42\nretry: 5000\ndata: payload\n\n"))
	if len(evs) != 1 || evs[0].data != "payload" {
		t.Fatalf("got %+v", evs)
	}
}
