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

	"inkwell/server/internal/gateway/application/scriptwrites"
	"inkwell/server/internal/gateway/handlers/ai/approval"
	"inkwell/server/internal/gateway/toolcontracts"
	"inkwell/server/pkg/aiadapter"
	"inkwell/server/pkg/grpcmeta"
)

const maxHostedToolIterations = 4

func hostedTools(projectID string, destructive bool) []aiadapter.Tool {
	names := []string{"list_projects", "create_project"}
	if projectID != "" {
		// A project chat must only receive tools that act on the open project.
		// Offering create_project here lets a model misinterpret requests such as
		// "change the title" and silently create a duplicate project.
		names = []string{"list_scenes", "read_scene", "create_scene", "append_to_scene", "add_beat", "rename_scene"}
		if destructive {
			names = append(names, "rewrite_scene", "delete_scene")
		}
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

func (h *AIHandler) runToolLoop(ctx context.Context, w io.Writer, flusher http.Flusher, adapter aiadapter.Adapter, input aiadapter.Input, stream aiadapter.Stream, userID, projectID, providerID string, managed bool) {
	encoder := json.NewEncoder(w)
	totalTokens := 0
	toolResults := map[string]string{}
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
			if call.Name == "rewrite_scene" || call.Name == "delete_scene" {
				if h.approvals == nil {
					_ = encoder.Encode(map[string]string{"error": "destructive tools are unavailable"})
					flusher.Flush()
					return
				}
				var normalized any
				if json.Unmarshal([]byte(call.Arguments), &normalized) != nil {
					_ = encoder.Encode(map[string]string{"error": "invalid destructive tool arguments"})
					flusher.Flush()
					return
				}
				args, _ := json.Marshal(normalized)
				call.Arguments = string(args)
				checkpoint, err := h.approvals.Create(ctx, approval.Checkpoint{UserID: userID, ProjectID: projectID, Tool: call, Messages: input.Messages, Model: input.Model, ProviderID: providerID, CorrelationID: grpcmeta.CorrelationID(ctx)}, 15*time.Minute)
				if err != nil {
					_ = encoder.Encode(map[string]string{"error": "approval service unavailable"})
					flusher.Flush()
					return
				}
				_ = encoder.Encode(map[string]any{"approval_required": map[string]any{"checkpoint_id": checkpoint.ID, "tool": call.Name, "arguments": json.RawMessage(call.Arguments), "expires_at": checkpoint.ExpiresAt}, "done": true})
				flusher.Flush()
				return
			}
			started := time.Now()
			result, ok := toolResults[call.ID]
			if !ok || call.ID == "" {
				if h.executeTool != nil {
					result = h.executeTool(ctx, userID, projectID, call)
				} else {
					result = h.executeHostedTool(ctx, userID, projectID, call)
				}
				if call.ID != "" {
					toolResults[call.ID] = result
				}
			}
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

func (h *AIHandler) executeHostedTool(ctx context.Context, userID, projectID string, call aiadapter.ToolCall) string {
	if call.Name == "list_projects" || call.Name == "list_scenes" || call.Name == "read_scene" {
		return h.executeReadTool(ctx, userID, projectID, call)
	}
	if call.Name != "create_project" && call.Name != "create_scene" && call.Name != "append_to_scene" && call.Name != "add_beat" && call.Name != "rename_scene" {
		encoded, _ := json.Marshal(map[string]string{"error": fmt.Sprintf("unknown tool: %s", call.Name)})
		return string(encoded)
	}
	if h.writes == nil {
		return `{"error":"hosted write tools are unavailable"}`
	}
	var args struct {
		Title         string `json:"title"`
		Description   string `json:"description"`
		Category      string `json:"category"`
		OrgID         string `json:"org_id"`
		SceneID       string `json:"scene_id"`
		Heading       string `json:"scene_heading"`
		Content       string `json:"content"`
		OutlineUnitID string `json:"outline_unit_id"`
		OrderIndex    int32  `json:"order_index"`
		Color         string `json:"color"`
		ActNumber     int32  `json:"act_number"`
		Order         int32  `json:"order"`
	}
	if err := json.Unmarshal([]byte(call.Arguments), &args); err != nil {
		return `{"error":"invalid tool arguments"}`
	}
	var value any
	var err error
	switch call.Name {
	case "create_project":
		value, err = h.writes.CreateProject(ctx, userID, scriptwrites.CreateProjectInput{Title: args.Title, Description: args.Description, Category: args.Category, OrgID: args.OrgID})
	case "create_scene":
		if projectID == "" {
			err = errors.New("projectId is required")
		} else {
			value, err = h.writes.CreateScene(ctx, userID, projectID, scriptwrites.CreateSceneInput{Heading: args.Heading, Content: args.Content, OutlineUnitID: args.OutlineUnitID, OrderIndex: args.OrderIndex})
		}
	case "append_to_scene":
		if projectID == "" || args.SceneID == "" {
			err = errors.New("projectId and scene_id are required")
		} else {
			value, err = h.writes.AppendToScene(ctx, userID, projectID, args.SceneID, args.Content)
		}
	case "add_beat":
		if projectID == "" {
			err = errors.New("projectId is required")
		} else {
			value, err = h.writes.AddBeat(ctx, userID, projectID, scriptwrites.AddBeatInput{Title: args.Title, Description: args.Description, Color: args.Color, ActNumber: args.ActNumber, Order: args.Order})
		}
	case "rename_scene":
		if projectID == "" || args.SceneID == "" {
			err = errors.New("projectId and scene_id are required")
		} else {
			value, err = h.writes.RenameScene(ctx, userID, projectID, args.SceneID, args.Heading)
		}
	default:
		err = fmt.Errorf("unknown tool: %s", call.Name)
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
