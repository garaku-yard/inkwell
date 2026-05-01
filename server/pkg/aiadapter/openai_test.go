package aiadapter

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// openAIFake responds with a canned OpenAI-style SSE stream.
func openAIFake(payload string, status int) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			http.Error(w, "unexpected path "+r.URL.Path, http.StatusBadRequest)
			return
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			http.Error(w, "missing/bad auth header", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, payload)
	}))
}

func drainOpenAI(t *testing.T, s Stream) ([]string, bool) {
	t.Helper()
	var deltas []string
	var done bool
	for {
		c, err := s.Next(context.Background())
		if errors.Is(err, io.EOF) {
			return deltas, done
		}
		if err != nil {
			t.Fatalf("Next: %v", err)
		}
		if c.Delta != "" {
			deltas = append(deltas, c.Delta)
		}
		if c.Done {
			done = true
		}
	}
}

func TestOpenAIAdapter_StreamChatHappyPath(t *testing.T) {
	stream := `data: {"choices":[{"delta":{"content":"Hel"}}]}

data: {"choices":[{"delta":{"content":"lo"}}]}

data: {"choices":[{"delta":{"content":""}},{"finish_reason":"stop"}]}

data: [DONE]

`
	srv := openAIFake(stream, http.StatusOK)
	defer srv.Close()

	adapter := OpenAIAdapter{}
	s, err := adapter.StreamChat(context.Background(), Input{
		Messages: []Message{{Role: "user", Content: "hi"}},
		Model:    "gpt-4o-mini",
		APIKey:   "test-key",
		BaseURL:  srv.URL,
	})
	if err != nil {
		t.Fatalf("StreamChat: %v", err)
	}
	defer s.Close()

	deltas, done := drainOpenAI(t, s)
	got := strings.Join(deltas, "")
	if got != "Hello" {
		t.Fatalf("got %q want %q", got, "Hello")
	}
	if !done {
		t.Fatalf("expected done=true on [DONE] marker")
	}
}

func TestOpenAIAdapter_PropagatesHTTPError(t *testing.T) {
	// Error body contains an API key we need to make sure ends up
	// redacted (not echoed verbatim) in the returned error.
	srv := openAIFake(`{"error":{"message":"Invalid key: sk-abcdefghijklmnop"}}`, http.StatusUnauthorized)
	defer srv.Close()

	_, err := OpenAIAdapter{}.StreamChat(context.Background(), Input{
		Messages: []Message{{Role: "user", Content: "hi"}},
		Model:    "gpt-4o-mini",
		APIKey:   "test-key",
		BaseURL:  srv.URL,
	})
	if err == nil {
		t.Fatal("expected error")
	}
	var perr *ErrProvider
	if !errors.As(err, &perr) {
		t.Fatalf("want *ErrProvider, got %T: %v", err, err)
	}
	if perr.Status != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", perr.Status)
	}
	if strings.Contains(perr.Message, "sk-abcdefghijklmnop") {
		t.Fatalf("error message leaked raw API key: %q", perr.Message)
	}
	if !strings.Contains(perr.Message, "<redacted>") {
		t.Fatalf("error message missing redaction marker: %q", perr.Message)
	}
}

func TestOpenAIAdapter_MissingAPIKeyRejected(t *testing.T) {
	_, err := OpenAIAdapter{}.StreamChat(context.Background(), Input{
		Messages: []Message{{Role: "user", Content: "hi"}},
		Model:    "gpt-4o-mini",
	})
	if err == nil {
		t.Fatal("expected missing-key error")
	}
}
