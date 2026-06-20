package aiadapter

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
)

// drainUsage reads a stream to EOF and returns the Usage from the final chunk.
func drainUsage(t *testing.T, s Stream) *Usage {
	t.Helper()
	var usage *Usage
	for {
		c, err := s.Next(context.Background())
		if errors.Is(err, io.EOF) {
			return usage
		}
		if err != nil {
			t.Fatalf("Next: %v", err)
		}
		if c.Usage != nil {
			usage = c.Usage
		}
	}
}

func scannerFor(payload string) *sseScanner {
	return newSSEScanner(io.NopCloser(strings.NewReader(payload)))
}

func TestOpenAIUsageExtraction(t *testing.T) {
	payload := `data: {"choices":[{"delta":{"content":"Hi"}}]}

data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}

data: [DONE]

`
	u := drainUsage(t, &openAIStream{kind: KindOpenAI, scanner: scannerFor(payload)})
	if u == nil {
		t.Fatal("expected usage, got nil")
	}
	if u.InputTokens != 12 || u.OutputTokens != 8 || u.TotalTokens != 20 {
		t.Errorf("usage = %+v, want {12 8 20}", *u)
	}
}

func TestAnthropicUsageExtraction(t *testing.T) {
	payload := `event: message_start
data: {"type":"message_start","message":{"usage":{"input_tokens":15,"output_tokens":1}}}

event: content_block_delta
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}

event: message_delta
data: {"type":"message_delta","usage":{"output_tokens":9}}

event: message_stop
data: {"type":"message_stop"}

`
	u := drainUsage(t, &anthropicStream{scanner: scannerFor(payload)})
	if u == nil {
		t.Fatal("expected usage, got nil")
	}
	if u.InputTokens != 15 || u.OutputTokens != 9 || u.TotalTokens != 24 {
		t.Errorf("usage = %+v, want {15 9 24}", *u)
	}
}

func TestGeminiUsageExtraction(t *testing.T) {
	payload := `data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}

data: {"candidates":[{"content":{"parts":[{"text":""}],"role":"model"},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":11,"candidatesTokenCount":6,"totalTokenCount":17}}

`
	u := drainUsage(t, &geminiStream{scanner: scannerFor(payload)})
	if u == nil {
		t.Fatal("expected usage, got nil")
	}
	if u.InputTokens != 11 || u.OutputTokens != 6 || u.TotalTokens != 17 {
		t.Errorf("usage = %+v, want {11 6 17}", *u)
	}
}

// TestOpenAINoUsageWhenOmitted confirms a stream without a usage chunk (e.g. a
// minimal openai_compatible endpoint) yields a nil Usage rather than zeros.
func TestOpenAINoUsageWhenOmitted(t *testing.T) {
	payload := `data: {"choices":[{"delta":{"content":"Hi"}}]}

data: [DONE]

`
	if u := drainUsage(t, &openAIStream{kind: KindOpenAICompatible, scanner: scannerFor(payload)}); u != nil {
		t.Errorf("expected nil usage, got %+v", *u)
	}
}
