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
	(&AIHandler{}).runToolLoop(context.Background(), w, w, a, aiadapter.Input{}, first, "u1", "p1", "", "", "provider", false)
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
	(&AIHandler{}).runToolLoop(context.Background(), w, w, a, aiadapter.Input{}, &loopStream{chunks: []aiadapter.Chunk{call}}, "u", "", "", "", "provider", false)
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
			(&AIHandler{}).runToolLoop(context.Background(), w, w, &loopAdapter{}, aiadapter.Input{}, tc.stream, "u", "", "", "", "provider", false)
			if !strings.Contains(w.Body.String(), `"error"`) {
				t.Fatalf("unexpected output: %s", w.Body.String())
			}
		})
	}
}

func TestHostedToolsAreProjectScoped(t *testing.T) {
	if got := hostedTools("", "", true); len(got) != 2 || got[0].Name != "list_projects" {
		t.Fatalf("global tools: %#v", got)
	}
	if got := hostedTools("p1", "novel", true); len(got) != 7 {
		t.Fatalf("project tools: %#v", got)
	} else {
		for _, tool := range got {
			if tool.Name == "create_project" || tool.Name == "list_projects" || strings.HasSuffix(tool.Name, "_scene") {
				t.Fatalf("account tool %q exposed in project chat", tool.Name)
			}
		}
	}
	if got := hostedTools("p1", "novel", false); len(got) != 2 {
		t.Fatalf("degraded tools: %#v", got)
	}
}

func TestUnitNounUsesEachEditorVocabulary(t *testing.T) {
	for category, want := range map[string]string{
		"screenplay": "scene", "novel": "chapter", "memoir": "chapter",
		"poetry": "poem", "lyrics": "song", "comic_script": "page",
		"tabletop_rpg": "section", "interactive_fiction": "passage",
	} {
		if got := unitNoun(category); got != want {
			t.Fatalf("unitNoun(%q)=%q want %q", category, got, want)
		}
	}
}

func TestRequestAllowsWritesOnlyForExplicitActionTurns(t *testing.T) {
	for _, tc := range []struct {
		message string
		want    bool
	}{
		{"What could I add to this passage?", false},
		{"Give me some suggestions for what to write next", false},
		{"What do you think would be a good follow-up story?", false},
		{"Add the second suggestion to this passage", true},
		{"Yes please, go ahead", true},
		{"Rewrite this in a darker style", true},
		{"Tell me about the protagonist", false},
	} {
		t.Run(tc.message, func(t *testing.T) {
			if got := requestAllowsWrites([]ChatMessage{{Role: "user", Content: tc.message}}); got != tc.want {
				t.Fatalf("requestAllowsWrites=%v want %v", got, tc.want)
			}
		})
	}
}

func TestToolLoopDeduplicatesRedeliveredToolCall(t *testing.T) {
	call := aiadapter.Chunk{Done: true, ToolCalls: []aiadapter.ToolCall{{ID: "stable-call", Name: "list_scenes", Arguments: `{}`}}}
	a := &loopAdapter{streams: []aiadapter.Stream{&loopStream{chunks: []aiadapter.Chunk{call}}, &loopStream{chunks: []aiadapter.Chunk{{Delta: "done", Done: true}}}}}
	executions := 0
	h := &AIHandler{executeTool: func(context.Context, string, string, aiadapter.ToolCall) string {
		executions++
		return `{"scene":{"id":"s1"}}`
	}}
	w := httptest.NewRecorder()
	h.runToolLoop(context.Background(), w, w, a, aiadapter.Input{}, &loopStream{chunks: []aiadapter.Chunk{call}}, "u", "p", "", "", "provider", false)
	if executions != 1 {
		t.Fatalf("redelivery made %d executions", executions)
	}
}

func TestToolLoopUsesActiveUnitWhenModelOmitsUnitID(t *testing.T) {
	call := aiadapter.Chunk{Done: true, ToolCalls: []aiadapter.ToolCall{{ID: "rename", Name: "rename_unit", Arguments: `{"title":"Attractor:Zero"}`}}}
	a := &loopAdapter{}
	store := &memoryApprovals{values: map[string]approval.Checkpoint{}}
	h := &AIHandler{approvals: store}
	w := httptest.NewRecorder()
	h.runToolLoop(context.Background(), w, w, a, aiadapter.Input{}, &loopStream{chunks: []aiadapter.Chunk{call}}, "u", "p", "passage-1", "interactive_fiction", "provider", false)
	if len(store.values) != 1 {
		t.Fatalf("checkpoints=%d", len(store.values))
	}
	for _, checkpoint := range store.values {
		if !strings.Contains(checkpoint.Tool.Arguments, `"unit_id":"passage-1"`) {
			t.Fatalf("active passage was not supplied: %s", checkpoint.Tool.Arguments)
		}
	}
}

func TestToolLoopExecutesOfferedTextualToolCallFromCompatibleModel(t *testing.T) {
	textCall := `{"name":"rename_unit","parameters":{"title":"Attractor:\u0002Zero","unit_id":"(get current unit id from list_units())"}}`
	a := &loopAdapter{}
	store := &memoryApprovals{values: map[string]approval.Checkpoint{}}
	h := &AIHandler{approvals: store}
	w := httptest.NewRecorder()
	input := aiadapter.Input{Tools: hostedTools("p", "interactive_fiction", true)}
	h.runToolLoop(context.Background(), w, w, a, input, &loopStream{chunks: []aiadapter.Chunk{{Delta: textCall, Done: true}}}, "u", "p", "passage-1", "interactive_fiction", "provider", false)
	var checkpoint approval.Checkpoint
	for _, checkpoint = range store.values {
	}
	if checkpoint.Tool.Name != "rename_unit" || !strings.Contains(checkpoint.Tool.Arguments, `"unit_id":"passage-1"`) {
		t.Fatalf("textual tool call was not normalized for approval: %#v", checkpoint.Tool)
	}
	if strings.Contains(w.Body.String(), `"name":"rename_unit"`) || !strings.Contains(w.Body.String(), `"approval_required"`) {
		t.Fatalf("raw textual call leaked or approval missing: %s", w.Body.String())
	}
}

func TestTextualToolCallRejectsToolThatWasNotOffered(t *testing.T) {
	if calls := textualToolCalls(`{"name":"delete_project","parameters":{}}`, hostedTools("p", "screenplay", true), 0); len(calls) != 0 {
		t.Fatalf("accepted unknown textual tool: %#v", calls)
	}
}

func TestCleanHeadingRemovesModelControlCharacters(t *testing.T) {
	if got := cleanHeading("  Attractor:\x02Zero  "); got != "Attractor:Zero" {
		t.Fatalf("cleanHeading=%q", got)
	}
}

func TestDestructiveToolEmitsApprovalAndEndsTurn(t *testing.T) {
	store := &memoryApprovals{values: map[string]approval.Checkpoint{}}
	call := aiadapter.Chunk{Done: true, ToolCalls: []aiadapter.ToolCall{{ID: "call1", Name: "delete_unit", Arguments: `{ "unit_id": "s1" }`}}}
	w := httptest.NewRecorder()
	(&AIHandler{approvals: store}).runToolLoop(context.Background(), w, w, &loopAdapter{}, aiadapter.Input{Model: "m"}, &loopStream{chunks: []aiadapter.Chunk{call}}, "u", "p", "", "", "provider", false)
	if !strings.Contains(w.Body.String(), "approval_required") || !strings.Contains(w.Body.String(), `"done":true`) {
		t.Fatalf("output=%s", w.Body.String())
	}
	if len(store.values) != 1 {
		t.Fatalf("checkpoints=%d", len(store.values))
	}
}
