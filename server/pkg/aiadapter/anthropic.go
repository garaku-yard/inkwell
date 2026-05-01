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

const (
	anthropicBaseURL        = "https://api.anthropic.com/v1"
	anthropicAPIVersion     = "2023-06-01"
	anthropicDefaultMaxTok  = 4096
)

// AnthropicAdapter speaks the Messages API. System messages in the input
// are hoisted into the top-level `system` field since Anthropic rejects
// `role: "system"` entries inside the messages array.
type AnthropicAdapter struct{}

// Kind implements Adapter.
func (AnthropicAdapter) Kind() ProviderKind { return KindAnthropic }

// StreamChat implements Adapter.
func (a AnthropicAdapter) StreamChat(ctx context.Context, in Input) (Stream, error) {
	if in.APIKey == "" {
		return nil, &ErrProvider{Kind: KindAnthropic, Message: "missing API key"}
	}

	system, conversation := splitSystemMessages(in.Messages)
	body := map[string]any{
		"model":      in.Model,
		"max_tokens": anthropicDefaultMaxTok,
		"messages":   conversation,
		"stream":     true,
	}
	if system != "" {
		body["system"] = system
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, &ErrProvider{Kind: KindAnthropic, Message: err.Error()}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, anthropicBaseURL+"/messages", bytes.NewReader(payload))
	if err != nil {
		return nil, &ErrProvider{Kind: KindAnthropic, Message: err.Error()}
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", in.APIKey)
	req.Header.Set("anthropic-version", anthropicAPIVersion)
	req.Header.Set("Accept", "text/event-stream")

	client := in.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, &ErrProvider{Kind: KindAnthropic, Message: err.Error()}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		resp.Body.Close()
		return nil, &ErrProvider{Kind: KindAnthropic, Status: resp.StatusCode, Message: redact(string(msg))}
	}
	return &anthropicStream{scanner: newSSEScanner(resp.Body)}, nil
}

// splitSystemMessages separates any system-role entries out of the
// ordered message list, concatenating them (blank-line joined) into a
// single system-prompt string. Returns the joined system text plus the
// remaining conversation messages in original order.
func splitSystemMessages(msgs []Message) (system string, conversation []Message) {
	var systems []string
	conversation = make([]Message, 0, len(msgs))
	for _, m := range msgs {
		if m.Role == "system" {
			systems = append(systems, m.Content)
			continue
		}
		conversation = append(conversation, m)
	}
	return strings.Join(systems, "\n\n"), conversation
}

type anthropicStream struct {
	scanner *sseScanner
	done    bool
}

type anthropicDelta struct {
	Delta struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"delta"`
}

type anthropicError struct {
	Error struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

func (s *anthropicStream) Next(ctx context.Context) (Chunk, error) {
	for {
		if s.done {
			return Chunk{}, io.EOF
		}
		ev, err := s.scanner.Next(ctx)
		if err != nil {
			return Chunk{}, err
		}
		switch ev.event {
		case "content_block_delta":
			var d anthropicDelta
			if err := json.Unmarshal([]byte(ev.data), &d); err != nil {
				return Chunk{}, &ErrProvider{Kind: KindAnthropic, Message: fmt.Sprintf("malformed chunk: %v", err)}
			}
			if d.Delta.Text == "" {
				continue
			}
			return Chunk{Delta: d.Delta.Text}, nil
		case "message_stop":
			s.done = true
			return Chunk{Done: true}, nil
		case "error":
			var e anthropicError
			_ = json.Unmarshal([]byte(ev.data), &e)
			msg := e.Error.Message
			if msg == "" {
				msg = "unknown stream error"
			}
			return Chunk{}, &ErrProvider{Kind: KindAnthropic, Message: redact(msg)}
		default:
			// message_start, ping, content_block_start/stop, message_delta — nothing to emit.
			continue
		}
	}
}

func (s *anthropicStream) Close() error { return s.scanner.Close() }
