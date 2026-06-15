package aisettings

import (
	"errors"
	"testing"

	"inkwell/server/internal/gateway/handlers"
)

func TestValidateOpenAICompatibleURL(t *testing.T) {
	cases := []struct {
		name      string
		url       string
		allowlist []string
		want      error
	}{
		{
			name: "empty allowlist disables the kind",
			url:  "http://ollama.internal:11434/v1",
			want: handlers.ErrOpenAICompatibleDisabled,
		},
		{
			name:      "host:port match passes",
			url:       "http://ollama.internal:11434/v1",
			allowlist: []string{"ollama.internal:11434"},
			want:      nil,
		},
		{
			name:      "implicit https port matches bare host entry",
			url:       "https://llm.example.com/v1",
			allowlist: []string{"llm.example.com"},
			want:      nil,
		},
		{
			name:      "wrong port is denied",
			url:       "http://ollama.internal:8080/v1",
			allowlist: []string{"ollama.internal:11434"},
			want:      handlers.ErrOpenAICompatibleHostDenied,
		},
		{
			name:      "different host is denied",
			url:       "http://identity-service:50051/v1",
			allowlist: []string{"ollama.internal:11434"},
			want:      handlers.ErrOpenAICompatibleHostDenied,
		},
		{
			name:      "empty url with non-empty allowlist is denied",
			url:       "",
			allowlist: []string{"ollama.internal:11434"},
			want:      handlers.ErrOpenAICompatibleHostDenied,
		},
		{
			name:      "non-http scheme is denied",
			url:       "file:///etc/passwd",
			allowlist: []string{"localhost"},
			want:      handlers.ErrOpenAICompatibleHostDenied,
		},
		{
			name:      "garbage url is denied",
			url:       "://not a url",
			allowlist: []string{"localhost"},
			want:      handlers.ErrOpenAICompatibleHostDenied,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := handlers.ValidateOpenAICompatibleURL(tc.url, tc.allowlist)
			if !errors.Is(got, tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}
