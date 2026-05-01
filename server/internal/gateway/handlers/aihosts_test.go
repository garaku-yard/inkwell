package handlers

import (
	"errors"
	"testing"
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
			want: errOpenAICompatibleDisabled,
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
			want:      errOpenAICompatibleHostDenied,
		},
		{
			name:      "different host is denied",
			url:       "http://identity-service:50051/v1",
			allowlist: []string{"ollama.internal:11434"},
			want:      errOpenAICompatibleHostDenied,
		},
		{
			name:      "empty url with non-empty allowlist is denied",
			url:       "",
			allowlist: []string{"ollama.internal:11434"},
			want:      errOpenAICompatibleHostDenied,
		},
		{
			name:      "non-http scheme is denied",
			url:       "file:///etc/passwd",
			allowlist: []string{"localhost"},
			want:      errOpenAICompatibleHostDenied,
		},
		{
			name:      "garbage url is denied",
			url:       "://not a url",
			allowlist: []string{"localhost"},
			want:      errOpenAICompatibleHostDenied,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := validateOpenAICompatibleURL(tc.url, tc.allowlist)
			if !errors.Is(got, tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}
