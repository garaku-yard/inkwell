package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"inkwell/server/internal/gateway/toolcontracts"
	"inkwell/server/pkg/aiadapter"
	"inkwell/server/pkg/grpcmeta"
)

const maxHostedToolIterations = 4

func hostedReadTools(projectID string) []aiadapter.Tool {
	names := []string{"list_projects"}
	if projectID != "" {
		names = append(names, "list_scenes", "read_scene")
	}
	out := make([]aiadapter.Tool, 0, len(names))
	for _, name := range names {
		contract, err := toolcontracts.Get(name)
		if err != nil {
			panic(err)
		}
		out = append(out, aiadapter.Tool{Name: contract.Name, Description: contract.Description, Parameters: contract.Parameters})
	}
	return out
}

func (h *AIHandler) runToolLoop(ctx context.Context, w io.Writer, flusher http.Flusher, adapter aiadapter.Adapter, input aiadapter.Input, stream aiadapter.Stream, userID, projectID string, managed bool) {
	encoder := json.NewEncoder(w)
	totalTokens := 0
	defer func() {
		if managed && totalTokens > 0 {
			h.trackManagedTokens(userID, totalTokens)
		}
	}()

	for iteration := 0; iteration < maxHostedToolIterations; iteration++ {
		assistantText := ""
		var calls []aiadapter.ToolCall
		for {
			chunk, err := stream.Next(ctx)
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				_ = stream.Close()
				_ = encoder.Encode(map[string]string{"error": redactStreamError(err)})
				flusher.Flush()
				return
			}
			if chunk.Delta != "" {
				assistantText += chunk.Delta
				_ = encoder.Encode(map[string]string{"response": chunk.Delta})
				flusher.Flush()
			}
			if chunk.Usage != nil {
				totalTokens += chunk.Usage.TotalTokens
			}
			if len(chunk.ToolCalls) > 0 {
				calls = append(calls, chunk.ToolCalls...)
			}
			if chunk.Done {
				break
			}
		}
		_ = stream.Close()
		if len(calls) == 0 {
			_ = encoder.Encode(map[string]bool{"done": true})
			flusher.Flush()
			return
		}
		input.Messages = append(input.Messages, aiadapter.Message{Role: "assistant", Content: assistantText, ToolCalls: calls})
		for _, call := range calls {
			started := time.Now()
			result := h.executeReadTool(ctx, userID, projectID, call)
			_ = encoder.Encode(map[string]string{"tool": call.Name, "label": call.Name})
			flusher.Flush()
			slog.Info("hosted ai tool", "correlation_id", grpcmeta.CorrelationID(ctx), "tool", call.Name, "tool_call_id", call.ID, "duration_ms", time.Since(started).Milliseconds(), "outcome", "complete")
			input.Messages = append(input.Messages, aiadapter.Message{Role: "tool", Content: result, ToolCallID: call.ID, Name: call.Name})
		}
		if iteration == maxHostedToolIterations-1 {
			break
		}
		var err error
		stream, err = adapter.StreamChat(ctx, input)
		if err != nil {
			_ = encoder.Encode(map[string]string{"error": redactStreamError(err)})
			flusher.Flush()
			return
		}
	}
	_ = encoder.Encode(map[string]any{"done": true, "reason": "tool_iteration_limit"})
	flusher.Flush()
}

func (h *AIHandler) executeReadTool(ctx context.Context, userID, projectID string, call aiadapter.ToolCall) string {
	if call.Name != "list_projects" && call.Name != "list_scenes" && call.Name != "read_scene" {
		encoded, _ := json.Marshal(map[string]string{"error": fmt.Sprintf("unknown tool: %s", call.Name)})
		return string(encoded)
	}
	if h.reads == nil {
		return `{"error":"hosted tools are unavailable"}`
	}
	var value any
	var err error
	switch call.Name {
	case "list_projects":
		value, err = h.reads.ListOwnedProjects(ctx, userID, 1, 100)
	case "list_scenes":
		if projectID == "" {
			err = errors.New("projectId is required")
		} else {
			value, err = h.reads.ListScenes(ctx, userID, projectID)
		}
	case "read_scene":
		var args struct {
			SceneID string `json:"scene_id"`
		}
		if json.Unmarshal([]byte(call.Arguments), &args) != nil || args.SceneID == "" {
			err = errors.New("scene_id is required")
		} else if projectID == "" {
			err = errors.New("projectId is required")
		} else {
			value, err = h.reads.ReadScene(ctx, userID, projectID, args.SceneID)
		}
	}
	if err != nil {
		encoded, _ := json.Marshal(map[string]string{"error": err.Error()})
		return string(encoded)
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return `{"error":"could not encode tool result"}`
	}
	return string(encoded)
}
