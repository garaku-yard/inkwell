package aiadapter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const geminiBaseURL = "https://generativelanguage.googleapis.com/v1beta"

// GeminiAdapter speaks Google's streamGenerateContent endpoint. The wire
// shape differs from OpenAI in three ways: the assistant role is named
// "model", messages nest as {role, parts: [{text}]}, and system prompts
// live in a separate `systemInstruction` field.
//
// Security note: the API key rides as a `?key=…` query parameter because
// that's the scheme Google documents for the public AI Studio endpoint.
// Anywhere full URLs get captured (reverse-proxy access logs, HTTP
// client debug traces, error reporters) would therefore capture the key
// in plaintext. This package never logs URLs; the gateway's request
// logger uses `r.URL.Path` only. If you ever add outbound HTTP logging
// for aiadapter calls, redact the `key=` parameter first.
type GeminiAdapter struct{}

// Kind implements Adapter.
func (GeminiAdapter) Kind() ProviderKind { return KindGemini }

// StreamChat implements Adapter.
func (a GeminiAdapter) StreamChat(ctx context.Context, in Input) (Stream, error) {
	if in.APIKey == "" {
		return nil, &ErrProvider{Kind: KindGemini, Message: "missing API key"}
	}

	sysInstr, contents := buildGeminiContents(in.Messages)
	body := map[string]any{"contents": contents}
	if sysInstr != nil {
		body["systemInstruction"] = sysInstr
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, &ErrProvider{Kind: KindGemini, Message: err.Error()}
	}

	endpoint := fmt.Sprintf(
		"%s/models/%s:streamGenerateContent?alt=sse&key=%s",
		geminiBaseURL,
		url.PathEscape(in.Model),
		url.QueryEscape(in.APIKey),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, &ErrProvider{Kind: KindGemini, Message: err.Error()}
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")

	client := in.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, &ErrProvider{Kind: KindGemini, Message: err.Error()}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		resp.Body.Close()
		return nil, &ErrProvider{Kind: KindGemini, Status: resp.StatusCode, Message: redact(string(msg))}
	}
	return &geminiStream{scanner: newSSEScanner(resp.Body)}, nil
}

type geminiContentPart struct {
	Text string `json:"text"`
}

type geminiContent struct {
	Role  string              `json:"role"`
	Parts []geminiContentPart `json:"parts"`
}

type geminiSystemInstruction struct {
	Parts []geminiContentPart `json:"parts"`
}

// buildGeminiContents reshapes the adapter's (role, content) messages into
// Gemini's nested contents format and extracts system messages into a
// single systemInstruction. Returns a nil systemInstruction when no
// system messages were present.
func buildGeminiContents(msgs []Message) (*geminiSystemInstruction, []geminiContent) {
	var systems []string
	contents := make([]geminiContent, 0, len(msgs))
	for _, m := range msgs {
		switch m.Role {
		case "system":
			systems = append(systems, m.Content)
		case "assistant":
			contents = append(contents, geminiContent{Role: "model", Parts: []geminiContentPart{{Text: m.Content}}})
		default:
			contents = append(contents, geminiContent{Role: "user", Parts: []geminiContentPart{{Text: m.Content}}})
		}
	}
	if len(systems) == 0 {
		return nil, contents
	}
	return &geminiSystemInstruction{Parts: []geminiContentPart{{Text: strings.Join(systems, "\n\n")}}}, contents
}

type geminiStream struct {
	scanner *sseScanner
	done    bool
}

type geminiChunk struct {
	Candidates []struct {
		Content struct {
			Parts []geminiContentPart `json:"parts"`
		} `json:"content"`
		FinishReason string `json:"finishReason"`
	} `json:"candidates"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (s *geminiStream) Next(ctx context.Context) (Chunk, error) {
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
		var c geminiChunk
		if err := json.Unmarshal([]byte(data), &c); err != nil {
			return Chunk{}, &ErrProvider{Kind: KindGemini, Message: fmt.Sprintf("malformed chunk: %v", err)}
		}
		if c.Error != nil {
			return Chunk{}, &ErrProvider{Kind: KindGemini, Message: redact(c.Error.Message)}
		}
		if len(c.Candidates) == 0 {
			continue
		}
		var delta strings.Builder
		for _, part := range c.Candidates[0].Content.Parts {
			delta.WriteString(part.Text)
		}
		if c.Candidates[0].FinishReason != "" {
			s.done = true
			return Chunk{Delta: delta.String(), Done: true}, nil
		}
		if delta.Len() == 0 {
			continue
		}
		return Chunk{Delta: delta.String()}, nil
	}
}

func (s *geminiStream) Close() error { return s.scanner.Close() }
