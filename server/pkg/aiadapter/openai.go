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

// OpenAIAdapter speaks the `/chat/completions` contract. It's used for
// OpenAI itself; the gateway doesn't use it for `openai_compatible`
// endpoints (those stay client-side — see package doc).
type OpenAIAdapter struct{}

// Kind implements Adapter.
func (OpenAIAdapter) Kind() ProviderKind { return KindOpenAI }

// StreamChat implements Adapter.
func (a OpenAIAdapter) StreamChat(ctx context.Context, in Input) (Stream, error) {
	if in.APIKey == "" {
		return nil, &ErrProvider{Kind: KindOpenAI, Message: "missing API key"}
	}
	baseURL := strings.TrimRight(in.BaseURL, "/")
	if baseURL == "" {
		baseURL = openAIDefaultBaseURL
	}

	body, err := json.Marshal(map[string]any{
		"model":    in.Model,
		"messages": in.Messages,
		"stream":   true,
	})
	if err != nil {
		return nil, &ErrProvider{Kind: KindOpenAI, Message: err.Error()}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, &ErrProvider{Kind: KindOpenAI, Message: err.Error()}
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
		return nil, &ErrProvider{Kind: KindOpenAI, Message: err.Error()}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		resp.Body.Close()
		return nil, &ErrProvider{Kind: KindOpenAI, Status: resp.StatusCode, Message: redact(string(msg))}
	}

	return &openAIStream{scanner: newSSEScanner(resp.Body)}, nil
}

type openAIStream struct {
	scanner *sseScanner
	done    bool
}

type openAIChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason"`
	} `json:"choices"`
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
			return Chunk{Done: true}, nil
		}
		var c openAIChunk
		if err := json.Unmarshal([]byte(data), &c); err != nil {
			return Chunk{}, &ErrProvider{Kind: KindOpenAI, Message: fmt.Sprintf("malformed chunk: %v", err)}
		}
		if c.Error != nil {
			return Chunk{}, &ErrProvider{Kind: KindOpenAI, Message: redact(c.Error.Message)}
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
