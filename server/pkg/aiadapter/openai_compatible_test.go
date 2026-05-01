package aiadapter

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"
)

func TestOpenAICompatibleAdapter_RequiresBaseURL(t *testing.T) {
	_, err := OpenAICompatibleAdapter{}.StreamChat(context.Background(), Input{
		Messages: []Message{{Role: "user", Content: "hi"}},
		Model:    "any",
		APIKey:   "test-key",
	})
	if err == nil {
		t.Fatal("expected baseUrl-required error")
	}
	var perr *ErrProvider
	if !errors.As(err, &perr) {
		t.Fatalf("want *ErrProvider, got %T: %v", err, err)
	}
	if perr.Kind != KindOpenAICompatible {
		t.Fatalf("Kind = %q, want %q", perr.Kind, KindOpenAICompatible)
	}
	if !strings.Contains(perr.Message, "baseUrl") {
		t.Fatalf("error message %q does not mention baseUrl", perr.Message)
	}
}

func TestOpenAICompatibleAdapter_StreamsSameShapeAsOpenAI(t *testing.T) {
	stream := `data: {"choices":[{"delta":{"content":"hi"}}]}

data: [DONE]

`
	srv := openAIFake(stream, http.StatusOK)
	defer srv.Close()

	s, err := OpenAICompatibleAdapter{}.StreamChat(context.Background(), Input{
		Messages: []Message{{Role: "user", Content: "hi"}},
		Model:    "llama3.2:3b",
		APIKey:   "test-key",
		BaseURL:  srv.URL,
	})
	if err != nil {
		t.Fatalf("StreamChat: %v", err)
	}
	defer s.Close()

	deltas, done := drainOpenAI(t, s)
	if strings.Join(deltas, "") != "hi" {
		t.Fatalf("got %q want %q", deltas, "hi")
	}
	if !done {
		t.Fatal("expected done")
	}
}

func TestRegistry_OpenAICompatibleRegistered(t *testing.T) {
	a, err := Get(KindOpenAICompatible)
	if err != nil {
		t.Fatalf("Get(KindOpenAICompatible): %v", err)
	}
	if a.Kind() != KindOpenAICompatible {
		t.Fatalf("adapter Kind = %q, want %q", a.Kind(), KindOpenAICompatible)
	}
}
