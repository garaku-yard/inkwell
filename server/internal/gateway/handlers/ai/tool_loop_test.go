package ai

import (
	"context"
	"errors"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"inkwell/server/internal/gateway/handlers/ai/approval"
	"inkwell/server/pkg/aiadapter"
)

type loopStream struct {
	chunks []aiadapter.Chunk
	err    error
	i      int
}

func (s *loopStream) Next(context.Context) (aiadapter.Chunk, error) {
	if s.i < len(s.chunks) {
		c := s.chunks[s.i]
		s.i++
		return c, nil
	}
	if s.err != nil {
		return aiadapter.Chunk{}, s.err
	}
	return aiadapter.Chunk{}, io.EOF
}
func (*loopStream) Close() error { return nil }

type loopAdapter struct {
	streams []aiadapter.Stream
	inputs  []aiadapter.Input
}

func (*loopAdapter) Kind() aiadapter.ProviderKind { return aiadapter.KindOpenAI }
func (a *loopAdapter) StreamChat(_ context.Context, in aiadapter.Input) (aiadapter.Stream, error) {
	a.inputs = append(a.inputs, in)
	if len(a.streams) == 0 {
		return nil, errors.New("provider failed")
	}
	s := a.streams[0]
	a.streams = a.streams[1:]
	return s, nil
}

func TestToolLoopReturnsUnknownToolResultToProvider(t *testing.T) {
	first := &loopStream{chunks: []aiadapter.Chunk{{Done: true, ToolCalls: []aiadapter.ToolCall{{ID: "c1", Name: "delete_project", Arguments: "{}"}}}}}
	a := &loopAdapter{streams: []aiadapter.Stream{&loopStream{chunks: []aiadapter.Chunk{{Delta: "safe", Done: true}}}}}
	w := httptest.NewRecorder()
	(&AIHandler{}).runToolLoop(context.Background(), w, w, a, aiadapter.Input{}, first, "u1", "p1", "provider", false)
	if len(a.inputs) != 1 || len(a.inputs[0].Messages) != 2 || !strings.Contains(a.inputs[0].Messages[1].Content, "unknown tool") {
		t.Fatalf("tool result not returned: %#v", a.inputs)
	}
	if !strings.Contains(w.Body.String(), `"response":"safe"`) || !strings.Contains(w.Body.String(), `"done":true`) {
		t.Fatalf("unexpected output: %s", w.Body.String())
	}
}

func TestToolLoopStopsAfterFourToolIterations(t *testing.T) {
	call := aiadapter.Chunk{Done: true, ToolCalls: []aiadapter.ToolCall{{ID: "c", Name: "unknown", Arguments: "{}"}}}
	a := &loopAdapter{streams: []aiadapter.Stream{&loopStream{chunks: []aiadapter.Chunk{call}}, &loopStream{chunks: []aiadapter.Chunk{call}}, &loopStream{chunks: []aiadapter.Chunk{call}}}}
	w := httptest.NewRecorder()
	(&AIHandler{}).runToolLoop(context.Background(), w, w, a, aiadapter.Input{}, &loopStream{chunks: []aiadapter.Chunk{call}}, "u", "", "provider", false)
	if len(a.inputs) != 3 || !strings.Contains(w.Body.String(), "tool_iteration_limit") {
		t.Fatalf("calls=%d output=%s", len(a.inputs), w.Body.String())
	}
}

func TestToolLoopReportsCancellationAndProviderFailure(t *testing.T) {
	for _, tc := range []struct {
		name   string
		stream aiadapter.Stream
	}{
		{"cancelled", &loopStream{err: context.Canceled}},
		{"provider", &loopStream{err: &aiadapter.ErrProvider{Kind: aiadapter.KindOpenAI, Message: "secret provider failure"}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			(&AIHandler{}).runToolLoop(context.Background(), w, w, &loopAdapter{}, aiadapter.Input{}, tc.stream, "u", "", "provider", false)
			if !strings.Contains(w.Body.String(), `"error"`) {
				t.Fatalf("unexpected output: %s", w.Body.String())
			}
		})
	}
}

func TestHostedToolsAreProjectScoped(t *testing.T) {
	if got := hostedTools("", true); len(got) != 2 || got[0].Name != "list_projects" {
		t.Fatalf("global tools: %#v", got)
	}
	if got := hostedTools("p1", true); len(got) != 10 {
		t.Fatalf("project tools: %#v", got)
	}
	if got := hostedTools("p1", false); len(got) != 8 {
		t.Fatalf("degraded tools: %#v", got)
	}
}

func TestToolLoopDeduplicatesRedeliveredMutation(t *testing.T) {
	call := aiadapter.Chunk{Done: true, ToolCalls: []aiadapter.ToolCall{{ID: "stable-call", Name: "create_scene", Arguments: `{"scene_heading":"One"}`}}}
	a := &loopAdapter{streams: []aiadapter.Stream{&loopStream{chunks: []aiadapter.Chunk{call}}, &loopStream{chunks: []aiadapter.Chunk{{Delta: "done", Done: true}}}}}
	mutations := 0
	h := &AIHandler{executeTool: func(context.Context, string, string, aiadapter.ToolCall) string {
		mutations++
		return `{"scene":{"id":"s1"}}`
	}}
	w := httptest.NewRecorder()
	h.runToolLoop(context.Background(), w, w, a, aiadapter.Input{}, &loopStream{chunks: []aiadapter.Chunk{call}}, "u", "p", "provider", false)
	if mutations != 1 {
		t.Fatalf("redelivery made %d mutations", mutations)
	}
}

func TestDestructiveToolEmitsApprovalAndEndsTurn(t *testing.T) {
	store := &memoryApprovals{values: map[string]approval.Checkpoint{}}
	call := aiadapter.Chunk{Done: true, ToolCalls: []aiadapter.ToolCall{{ID: "call1", Name: "delete_scene", Arguments: `{ "scene_id": "s1" }`}}}
	w := httptest.NewRecorder()
	(&AIHandler{approvals: store}).runToolLoop(context.Background(), w, w, &loopAdapter{}, aiadapter.Input{Model: "m"}, &loopStream{chunks: []aiadapter.Chunk{call}}, "u", "p", "provider", false)
	if !strings.Contains(w.Body.String(), "approval_required") || !strings.Contains(w.Body.String(), `"done":true`) {
		t.Fatalf("output=%s", w.Body.String())
	}
	if len(store.values) != 1 {
		t.Fatalf("checkpoints=%d", len(store.values))
	}
}
