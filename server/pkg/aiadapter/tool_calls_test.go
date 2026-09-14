package aiadapter

import (
	"context"
	"io"
	"strings"
	"testing"
)

func toolScanner(payload string) *sseScanner {
	return newSSEScanner(io.NopCloser(strings.NewReader(payload)))
}

func finalChunk(t *testing.T, s Stream) Chunk {
	t.Helper()
	for {
		chunk, err := s.Next(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		if chunk.Done {
			return chunk
		}
	}
}

func TestOpenAIStreamAssemblesFragmentedToolArguments(t *testing.T) {
	s := &openAIStream{kind: KindOpenAI, calls: map[int]*ToolCall{}, scanner: toolScanner("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"c1\",\"function\":{\"name\":\"read_\",\"arguments\":\"{\\\"scene_\"}}]}}]}\n\ndata: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"name\":\"scene\",\"arguments\":\"id\\\":\\\"s1\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\ndata: [DONE]\n\n")}
	c := finalChunk(t, s)
	if len(c.ToolCalls) != 1 || c.ToolCalls[0].Name != "read_scene" || c.ToolCalls[0].Arguments != `{"scene_id":"s1"}` || c.StopReason != "tool_calls" {
		t.Fatalf("unexpected chunk: %+v", c)
	}
}

func TestAnthropicStreamAssemblesFragmentedToolArguments(t *testing.T) {
	p := "event: content_block_start\ndata: {\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"c1\",\"name\":\"read_scene\"}}\n\nevent: content_block_delta\ndata: {\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"scene_\"}}\n\nevent: content_block_delta\ndata: {\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"id\\\":\\\"s1\\\"}\"}}\n\nevent: message_delta\ndata: {\"delta\":{\"stop_reason\":\"tool_use\"},\"usage\":{\"output_tokens\":2}}\n\nevent: message_stop\ndata: {}\n\n"
	s := &anthropicStream{calls: map[int]*ToolCall{}, scanner: toolScanner(p)}
	c := finalChunk(t, s)
	if len(c.ToolCalls) != 1 || c.ToolCalls[0].Arguments != `{"scene_id":"s1"}` || c.StopReason != "tool_use" {
		t.Fatalf("unexpected chunk: %+v", c)
	}
}

func TestGeminiStreamNormalizesFunctionCall(t *testing.T) {
	s := &geminiStream{scanner: toolScanner("data: {\"candidates\":[{\"content\":{\"parts\":[{\"functionCall\":{\"name\":\"list_scenes\",\"args\":{}}}]},\"finishReason\":\"STOP\"}]}\n\n")}
	c := finalChunk(t, s)
	if len(c.ToolCalls) != 1 || c.ToolCalls[0].Name != "list_scenes" || c.StopReason != "tool_use" {
		t.Fatalf("unexpected chunk: %+v", c)
	}
}

func TestProviderMessagesEncodeToolCallsAndResults(t *testing.T) {
	messages := []Message{{Role: "assistant", ToolCalls: []ToolCall{{ID: "c1", Name: "read_scene", Arguments: `{"scene_id":"s1"}`}}}, {Role: "tool", ToolCallID: "c1", Name: "read_scene", Content: `{"scene":{"id":"s1"}}`}}
	openAI := openAIMessages(messages)
	if openAI[0]["tool_calls"] == nil || openAI[1]["tool_call_id"] != "c1" {
		t.Fatalf("OpenAI messages: %#v", openAI)
	}
	anthropic := anthropicMessages(messages)
	if anthropic[0]["content"] == nil || anthropic[1]["content"] == nil {
		t.Fatalf("Anthropic messages: %#v", anthropic)
	}
	_, gemini := buildGeminiContents(messages)
	if gemini[0].Parts[0].FunctionCall == nil || gemini[1].Parts[0].FunctionResponse.Response["scene"] == nil {
		t.Fatalf("Gemini messages: %#v", gemini)
	}
}
