// Package aiadapter is the server-side mirror of the TypeScript adapter
// library in `client/lib/ai/providers/`. It exposes a common interface
// over the three hosted provider contracts (OpenAI, Anthropic, Gemini) so
// the gateway can fan out to whichever one the user configured without
// the surrounding code caring which SDK is being spoken underneath.
//
// This package deliberately does NOT cover `openai_compatible` (Ollama,
// LM Studio, llama.cpp-server): the gateway cannot reach the user's
// localhost from inside the container, so local-model traffic stays on
// the browser-side adapter path.
package aiadapter

import (
	"context"
	"errors"
	"net/http"
)

// ProviderKind names one of the supported hosted-provider contracts.
type ProviderKind string

// Hosted provider kinds.
const (
	KindOpenAI    ProviderKind = "openai"
	KindAnthropic ProviderKind = "anthropic"
	KindGemini    ProviderKind = "gemini"
)

// Message is one turn in a chat. Anthropic and Gemini accept "system"
// messages only out-of-band; their adapters hoist any system-role entries
// into the provider's dedicated system field.
type Message struct {
	Role    string // "system" | "user" | "assistant"
	Content string
}

// Input carries everything an adapter needs to open a streaming chat.
type Input struct {
	Messages []Message
	Model    string
	APIKey   string
	// BaseURL overrides the provider's public endpoint. Supported by the
	// OpenAI adapter for proxy / self-hosted deployments; ignored by
	// Anthropic and Gemini.
	BaseURL string
	// HTTPClient overrides the default client — useful for tests. nil
	// means use http.DefaultClient.
	HTTPClient *http.Client
}

// Chunk is one normalized piece of a streaming response. Delta is the
// newly-arrived text since the previous chunk. Done is true on the final
// chunk (which may still carry a trailing Delta from some providers).
type Chunk struct {
	Delta string
	Done  bool
}

// Stream is a forward-only iterator over completion chunks. Callers read
// until Next returns io.EOF, then invoke Close. Closing is idempotent.
type Stream interface {
	Next(ctx context.Context) (Chunk, error)
	Close() error
}

// Adapter is implemented by each provider.
type Adapter interface {
	Kind() ProviderKind
	StreamChat(ctx context.Context, in Input) (Stream, error)
}

// ErrProvider is returned for all adapter failures. Status is the HTTP
// status code when the failure came from the initial provider response;
// 0 when it came from the stream body, input validation, or a network
// layer error.
type ErrProvider struct {
	Kind    ProviderKind
	Status  int
	Message string
}

func (e *ErrProvider) Error() string {
	if e.Status == 0 {
		return string(e.Kind) + ": " + e.Message
	}
	return string(e.Kind) + ": " + http.StatusText(e.Status) + ": " + e.Message
}

// ErrUnsupportedKind is returned by the registry when asked for a kind
// this package doesn't implement.
var ErrUnsupportedKind = errors.New("aiadapter: unsupported provider kind")
