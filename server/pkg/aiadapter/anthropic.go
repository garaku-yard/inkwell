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
	anthropicBaseURL       = "https://api.anthropic.com/v1"
	anthropicAPIVersion    = "2023-06-01"
	anthropicDefaultMaxTok = 4096
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
	inTok   int // input_tokens from message_start
	outTok  int // output_tokens, updated by each message_delta (cumulative)
}

// anthropicUsage builds a Usage from the accumulated token counts, or nil when
// the stream reported none.
func (s *anthropicStream) anthropicUsage() *Usage {
	if s.inTok == 0 && s.outTok == 0 {
		return nil
	}
	return &Usage{InputTokens: s.inTok, OutputTokens: s.outTok, TotalTokens: s.inTok + s.outTok}
}

type anthropicDelta struct {
	Delta struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"delta"`
}

// anthropicMessageStart carries input token usage at the start of a message.
type anthropicMessageStart struct {
	Message struct {
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	} `json:"message"`
}

// anthropicMessageDelta carries the running output_tokens count.
type anthropicMessageDelta struct {
	Usage struct {
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
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
		case "message_start":
			var ms anthropicMessageStart
			if err := json.Unmarshal([]byte(ev.data), &ms); err == nil {
				s.inTok = ms.Message.Usage.InputTokens
				s.outTok = ms.Message.Usage.OutputTokens
			}
			continue
		case "message_delta":
			var md anthropicMessageDelta
			if err := json.Unmarshal([]byte(ev.data), &md); err == nil && md.Usage.OutputTokens > 0 {
				s.outTok = md.Usage.OutputTokens // cumulative — last one wins
			}
			continue
		case "message_stop":
			s.done = true
			return Chunk{Done: true, Usage: s.anthropicUsage()}, nil
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
