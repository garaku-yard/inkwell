package aiadapter

import (
	"strings"
	"testing"
)

func TestRedact(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "openai key",
			in:   "Invalid API key: sk-abcDEF1234567890xyz",
			want: "Invalid API key: <redacted>",
		},
		{
			name: "openai project key",
			in:   "sk-proj-abcdefghijklmnopqrstuvwxyz is invalid",
			want: "<redacted> is invalid",
		},
		{
			name: "anthropic key",
			in:   "bad key sk-ant-api03-abcdefghijklmnopqrstuvwxyz",
			want: "bad key <redacted>",
		},
		{
			name: "google key",
			in:   "your key AIzaSyABCDEFGH12345678IJKLmnopQRSTUV was revoked",
			want: "your key <redacted> was revoked",
		},
		{
			name: "leaves normal text alone",
			in:   "rate limit exceeded: please slow down",
			want: "rate limit exceeded: please slow down",
		},
		{
			name: "redacts multiple in one string",
			in:   "primary sk-aaaaaaaa secondary AIzaBBBBBBBBBBBBBBBBBBBB",
			want: "primary <redacted> secondary <redacted>",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := redact(c.in)
			if got != c.want {
				t.Fatalf("got %q, want %q", got, c.want)
			}
			if strings.Contains(got, "sk-a") || strings.Contains(got, "AIzaS") {
				t.Fatalf("redact left a key fragment in output: %q", got)
			}
		})
	}
}
