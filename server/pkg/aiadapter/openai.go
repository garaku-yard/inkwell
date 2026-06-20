package aiadapter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const openAIDefaultBaseURL = "https://api.openai.com/v1"

// OpenAIAdapter speaks the OpenAI `/chat/completions` contract against
// api.openai.com (or any explicit BaseURL the caller provides — used for
// proxy fronts and the openai_compatible adapter, which delegates here).
type OpenAIAdapter struct{}

// Kind implements Adapter.
func (OpenAIAdapter) Kind() ProviderKind { return KindOpenAI }

// StreamChat implements Adapter.
func (a OpenAIAdapter) StreamChat(ctx context.Context, in Input) (Stream, error) {
	return streamOpenAIShape(ctx, in, KindOpenAI, openAIDefaultBaseURL)
}

// streamOpenAIShape opens an SSE chat stream against any endpoint that
// speaks OpenAI's `/chat/completions` contract. `kind` is reflected back
// in error envelopes so callers can tell OpenAI from openai_compatible
// failures; `defaultBaseURL` is used when the input doesn't override it
// (empty string means no fallback — caller must supply BaseURL).
func streamOpenAIShape(ctx context.Context, in Input, kind ProviderKind, defaultBaseURL string) (Stream, error) {
	if in.APIKey == "" {
		return nil, &ErrProvider{Kind: kind, Message: "missing API key"}
	}
	baseURL := strings.TrimRight(in.BaseURL, "/")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	if baseURL == "" {
		return nil, &ErrProvider{Kind: kind, Message: "baseUrl required"}
	}

	body, err := json.Marshal(map[string]any{
		"model":    in.Model,
		"messages": in.Messages,
		"stream":   true,
		// Ask for a final usage chunk so the gateway can meter tokens. Ignored
		// by endpoints that don't support it (openai_compatible / Ollama).
		"stream_options": map[string]any{"include_usage": true},
	})
	if err != nil {
		return nil, &ErrProvider{Kind: kind, Message: err.Error()}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, &ErrProvider{Kind: kind, Message: err.Error()}
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+in.APIKey)
	req.Header.Set("Accept", "text/event-stream")

	client := in.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, &ErrProvider{Kind: kind, Message: err.Error()}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		resp.Body.Close()
		return nil, &ErrProvider{Kind: kind, Status: resp.StatusCode, Message: redact(string(msg))}
	}

	return &openAIStream{kind: kind, scanner: newSSEScanner(resp.Body)}, nil
}

// OpenAICompatibleAdapter speaks the same wire contract as the OpenAI
// adapter but requires an explicit BaseURL — there's no public default,
// since the operator has to allowlist the host first (see package doc
// and gateway config field OpenAICompatibleHosts).
type OpenAICompatibleAdapter struct{}

// Kind implements Adapter.
func (OpenAICompatibleAdapter) Kind() ProviderKind { return KindOpenAICompatible }

// StreamChat implements Adapter.
func (OpenAICompatibleAdapter) StreamChat(ctx context.Context, in Input) (Stream, error) {
	return streamOpenAIShape(ctx, in, KindOpenAICompatible, "")
}

type openAIStream struct {
	kind    ProviderKind
	scanner *sseScanner
	done    bool
	usage   *Usage // captured from the trailing usage chunk, emitted on [DONE]
}

type openAIChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (s *openAIStream) Next(ctx context.Context) (Chunk, error) {
	for {
		if s.done {
			return Chunk{}, io.EOF
		}
		ev, err := s.scanner.Next(ctx)
		if err != nil {
			return Chunk{}, err
		}
		data := strings.TrimSpace(ev.data)
		if data == "" {
			continue
		}
		if data == "[DONE]" {
			s.done = true
			return Chunk{Done: true, Usage: s.usage}, nil
		}
		var c openAIChunk
		if err := json.Unmarshal([]byte(data), &c); err != nil {
			return Chunk{}, &ErrProvider{Kind: s.kind, Message: fmt.Sprintf("malformed chunk: %v", err)}
		}
		if c.Error != nil {
			return Chunk{}, &ErrProvider{Kind: s.kind, Message: redact(c.Error.Message)}
		}
		// The usage chunk arrives with an empty choices array just before [DONE].
		if c.Usage != nil {
			s.usage = &Usage{
				InputTokens:  c.Usage.PromptTokens,
				OutputTokens: c.Usage.CompletionTokens,
				TotalTokens:  c.Usage.TotalTokens,
			}
		}
		if len(c.Choices) == 0 {
			continue
		}
		delta := c.Choices[0].Delta.Content
		if delta == "" && c.Choices[0].FinishReason == nil {
			continue
		}
		return Chunk{Delta: delta}, nil
	}
}

func (s *openAIStream) Close() error { return s.scanner.Close() }
