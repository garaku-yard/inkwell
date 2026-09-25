package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode"

	"inkwell/server/internal/gateway/application/scriptwrites"
	"inkwell/server/internal/gateway/handlers/ai/approval"
	"inkwell/server/internal/gateway/toolcontracts"
	"inkwell/server/pkg/aiadapter"
	"inkwell/server/pkg/grpcmeta"
)

const maxHostedToolIterations = 4

func requestAllowsWrites(messages []ChatMessage) bool {
	latest := ""
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role == "user" {
			latest = strings.ToLower(strings.TrimSpace(messages[i].Content))
			break
		}
	}
	if latest == "" {
		return false
	}
	// Discussion and ideation stay read-only even if the question happens to
	// mention a write verb ("what can I add?", "how should I rewrite this?").
	for _, prefix := range []string{"what ", "what's ", "how ", "why ", "can you suggest", "could you suggest", "would you suggest"} {
		if strings.HasPrefix(latest, prefix) {
			return false
		}
	}
	for _, prefix := range []string{"add ", "write ", "apply ", "insert ", "rename ", "replace ", "delete ", "create ", "update ", "change "} {
		if strings.HasPrefix(latest, prefix) {
			return true
		}
	}
	for _, marker := range []string{"suggestion", "suggestions", "ideas", "feedback", "what do you think"} {
		if strings.Contains(latest, marker) {
			return false
		}
	}
	for _, marker := range []string{"add ", "write ", "apply ", "insert ", "rename ", "replace ", "delete ", "create ", "update ", "change ", "go ahead", "proceed", "do it"} {
		if strings.Contains(latest, marker) {
			return true
		}
	}
	return false
}

func hostedTools(projectID, category string, destructive bool) []aiadapter.Tool {
	names := []string{"list_projects", "create_project"}
	if projectID != "" {
		// A project chat must only receive tools that act on the open project.
		// Offering create_project here lets a model misinterpret requests such as
		// "change the title" and silently create a duplicate project.
		names = []string{"list_units", "read_unit", "list_characters", "read_character"}
		if destructive {
			names = append(names, "create_unit", "append_to_unit", "rename_unit", "rewrite_unit", "delete_unit", "create_character", "update_character")
		}
	}
	out := make([]aiadapter.Tool, 0, len(names))
	for _, name := range names {
		contract, err := toolcontracts.Get(name)
		if err != nil {
			panic(err)
		}
		description := strings.ReplaceAll(contract.Description, "top-level writing unit", unitNoun(category))
		description = strings.ReplaceAll(description, "top-level unit", unitNoun(category))
		out = append(out, aiadapter.Tool{Name: contract.Name, Description: description, Parameters: contract.Parameters})
	}
	return out
}

func (h *AIHandler) runToolLoop(ctx context.Context, w io.Writer, flusher http.Flusher, adapter aiadapter.Adapter, input aiadapter.Input, stream aiadapter.Stream, userID, projectID, activeUnitID, category, providerID string, managed bool) {
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
			calls = textualToolCalls(assistantText, input.Tools, iteration)
		}
		if len(calls) == 0 {
			if assistantText != "" {
				_ = encoder.Encode(map[string]string{"response": assistantText})
			}
			_ = encoder.Encode(map[string]bool{"done": true})
			flusher.Flush()
			return
		}
		input.Messages = append(input.Messages, aiadapter.Message{Role: "assistant", Content: assistantText, ToolCalls: calls})
		for _, call := range calls {
			call = withActiveUnit(call, activeUnitID)
			if requiresApproval(call.Name) {
				if h.approvals == nil {
					_ = encoder.Encode(map[string]string{"error": "write approvals are unavailable"})
					flusher.Flush()
					return
				}
				var normalized any
				if json.Unmarshal([]byte(call.Arguments), &normalized) != nil {
					_ = encoder.Encode(map[string]string{"error": "invalid tool arguments"})
					flusher.Flush()
					return
				}
				args, _ := json.Marshal(normalized)
				call.Arguments = string(args)
				checkpoint, err := h.approvals.Create(ctx, approval.Checkpoint{UserID: userID, ProjectID: projectID, Category: category, Tool: call, Messages: input.Messages, Model: input.Model, ProviderID: providerID, CorrelationID: grpcmeta.CorrelationID(ctx)}, 15*time.Minute)
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
					result = h.executeHostedTool(ctx, userID, projectID, category, call)
				}
				if call.ID != "" {
					toolResults[call.ID] = result
				}
			}
			_ = encoder.Encode(map[string]any{"tool": call.Name, "label": call.Name, "arguments": json.RawMessage(call.Arguments)})
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

func requiresApproval(tool string) bool {
	switch tool {
	case "create_scene", "append_to_scene", "add_beat", "rename_scene", "rewrite_scene", "delete_scene",
		"create_unit", "append_to_unit", "rename_unit", "rewrite_unit", "delete_unit", "create_character", "update_character":
		return true
	default:
		return false
	}
}

func withActiveUnit(call aiadapter.ToolCall, activeUnitID string) aiadapter.ToolCall {
	if activeUnitID == "" {
		return call
	}
	switch call.Name {
	case "read_scene", "append_to_scene", "rename_scene", "rewrite_scene", "delete_scene",
		"read_unit", "append_to_unit", "rename_unit", "rewrite_unit", "delete_unit":
	default:
		return call
	}
	var args map[string]any
	if json.Unmarshal([]byte(call.Arguments), &args) != nil {
		return call
	}
	idKey := "scene_id"
	if strings.HasSuffix(call.Name, "_unit") {
		idKey = "unit_id"
	}
	if id, _ := args[idKey].(string); id == "" || resourceIDPlaceholder(id) {
		args[idKey] = activeUnitID
	}
	encoded, err := json.Marshal(args)
	if err == nil {
		call.Arguments = string(encoded)
	}
	return call
}

// Some small OpenAI-compatible models serialize a requested tool call into
// assistant content instead of the protocol's tool_calls field. Accept only a
// single JSON object naming a tool that was explicitly offered in this request;
// ordinary prose and unknown/hallucinated tools remain ordinary assistant text.
func textualToolCalls(content string, offered []aiadapter.Tool, iteration int) []aiadapter.ToolCall {
	raw := strings.TrimSpace(content)
	if strings.HasPrefix(raw, "```") && strings.HasSuffix(raw, "```") {
		raw = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(raw, "```json"), "```"))
		raw = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(raw, "```"), "```"))
	}
	var envelope struct {
		Name       string          `json:"name"`
		Parameters json.RawMessage `json:"parameters"`
		Arguments  json.RawMessage `json:"arguments"`
	}
	if json.Unmarshal([]byte(raw), &envelope) != nil || envelope.Name == "" {
		return nil
	}
	allowed := false
	for _, tool := range offered {
		if tool.Name == envelope.Name {
			allowed = true
			break
		}
	}
	if !allowed {
		return nil
	}
	args := envelope.Parameters
	if len(args) == 0 {
		args = envelope.Arguments
	}
	if len(args) == 0 || !json.Valid(args) {
		args = json.RawMessage(`{}`)
	}
	return []aiadapter.ToolCall{{ID: fmt.Sprintf("textual-%d", iteration), Name: envelope.Name, Arguments: string(args)}}
}

func resourceIDPlaceholder(id string) bool {
	normalized := strings.ToLower(strings.TrimSpace(id))
	return strings.Contains(normalized, "current scene") || strings.Contains(normalized, "current unit") ||
		strings.Contains(normalized, "current passage") || strings.Contains(normalized, "list_scenes") ||
		strings.Contains(normalized, "list_units") || strings.HasPrefix(normalized, "(")
}

func unitNoun(category string) string {
	switch category {
	case "novel", "memoir":
		return "chapter"
	case "poetry":
		return "poem"
	case "lyrics":
		return "song"
	case "comic_script":
		return "page"
	case "tabletop_rpg", "ttrpg":
		return "section"
	case "interactive_fiction":
		return "passage"
	default:
		return "scene"
	}
}

func cleanHeading(value string) string {
	return strings.TrimSpace(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, value))
}

func (h *AIHandler) executeReadTool(ctx context.Context, userID, projectID string, call aiadapter.ToolCall) string {
	if call.Name != "list_projects" && call.Name != "list_scenes" && call.Name != "read_scene" && call.Name != "list_units" && call.Name != "read_unit" && call.Name != "list_characters" && call.Name != "read_character" {
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
	case "list_units":
		if projectID == "" {
			err = errors.New("projectId is required")
		} else {
			items, readErr := h.reads.ListScenes(ctx, userID, projectID)
			err = readErr
			if err == nil {
				units := make([]map[string]any, 0, len(items))
				for _, item := range items {
					units = append(units, map[string]any{"unit_id": item.GetId(), "title": item.GetSceneHeading(), "order_index": item.GetOrderIndex()})
				}
				value = map[string]any{"units": units}
			}
		}
	case "read_unit":
		var args struct {
			UnitID string `json:"unit_id"`
		}
		if json.Unmarshal([]byte(call.Arguments), &args) != nil || args.UnitID == "" {
			err = errors.New("unit_id is required")
		} else if projectID == "" {
			err = errors.New("projectId is required")
		} else {
			content, readErr := h.reads.ReadScene(ctx, userID, projectID, args.UnitID)
			err = readErr
			if err == nil && content.Scene != nil {
				elements := make([]map[string]string, 0, len(content.Elements))
				for _, item := range content.Elements {
					elements = append(elements, map[string]string{"type": item.GetType(), "content": item.GetContent()})
				}
				value = map[string]any{"unit_id": content.Scene.GetId(), "title": content.Scene.GetSceneHeading(), "elements": elements}
			} else if err == nil {
				value = map[string]any{"error": "unit not found"}
			}
		}
	case "list_characters":
		if projectID == "" {
			err = errors.New("projectId is required")
		} else {
			value, err = h.reads.ListCharacters(ctx, userID, projectID)
		}
	case "read_character":
		var args struct {
			Character string `json:"character"`
		}
		if json.Unmarshal([]byte(call.Arguments), &args) != nil || strings.TrimSpace(args.Character) == "" {
			err = errors.New("character is required")
		} else if projectID == "" {
			err = errors.New("projectId is required")
		} else {
			character, readErr := h.reads.ReadCharacter(ctx, userID, projectID, strings.TrimSpace(args.Character))
			err = readErr
			if err == nil && character == nil {
				value = map[string]string{"error": "character not found"}
			} else if err == nil {
				value = character
			}
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

func (h *AIHandler) executeHostedTool(ctx context.Context, userID, projectID, category string, call aiadapter.ToolCall) string {
	if call.Name == "list_projects" || call.Name == "list_scenes" || call.Name == "read_scene" || call.Name == "list_units" || call.Name == "read_unit" || call.Name == "list_characters" || call.Name == "read_character" {
		return h.executeReadTool(ctx, userID, projectID, call)
	}
	call = asSceneTool(call)
	if call.Name != "create_project" && call.Name != "create_scene" && call.Name != "append_to_scene" && call.Name != "add_beat" && call.Name != "rename_scene" && call.Name != "create_character" && call.Name != "update_character" {
		encoded, _ := json.Marshal(map[string]string{"error": fmt.Sprintf("unknown tool: %s", call.Name)})
		return string(encoded)
	}
	if h.writes == nil {
		return `{"error":"hosted write tools are unavailable"}`
	}
	var args struct {
		Title         string  `json:"title"`
		Description   string  `json:"description"`
		Category      string  `json:"category"`
		OrgID         string  `json:"org_id"`
		SceneID       string  `json:"scene_id"`
		Heading       string  `json:"scene_heading"`
		HeadingAlias  string  `json:"heading"`
		Content       string  `json:"content"`
		OutlineUnitID string  `json:"outline_unit_id"`
		OrderIndex    int32   `json:"order_index"`
		Color         string  `json:"color"`
		ActNumber     int32   `json:"act_number"`
		Order         int32   `json:"order"`
		Character     string  `json:"character"`
		Name          *string `json:"name"`
		Role          *string `json:"role"`
		Traits        *string `json:"traits"`
		Motivation    *string `json:"motivation"`
		Voice         *string `json:"voice"`
		Relationships *string `json:"relationships"`
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
			value, err = h.writes.AppendToScene(ctx, userID, projectID, args.SceneID, args.Content, category)
		}
	case "add_beat":
		if projectID == "" {
			err = errors.New("projectId is required")
		} else {
			value, err = h.writes.AddBeat(ctx, userID, projectID, scriptwrites.AddBeatInput{Title: args.Title, Description: args.Description, Color: args.Color, ActNumber: args.ActNumber, Order: args.Order})
		}
	case "rename_scene":
		if args.Heading == "" {
			args.Heading = args.HeadingAlias
		}
		if args.Heading == "" {
			args.Heading = args.Title
		}
		args.Heading = cleanHeading(args.Heading)
		if projectID == "" || args.SceneID == "" {
			err = errors.New("projectId and scene_id are required")
		} else {
			value, err = h.writes.RenameScene(ctx, userID, projectID, args.SceneID, args.Heading, category)
		}
	case "create_character":
		if projectID == "" {
			err = errors.New("projectId is required")
		} else if args.Name == nil || strings.TrimSpace(*args.Name) == "" {
			err = errors.New("name is required")
		} else {
			attributes := characterToolAttributes(args.Traits, args.Motivation, args.Voice, args.Relationships)
			description, role := "", ""
			if args.Description != "" {
				description = args.Description
			}
			if args.Role != nil {
				role = strings.TrimSpace(*args.Role)
			}
			value, err = h.writes.CreateCharacter(ctx, userID, projectID, scriptwrites.CreateCharacterInput{
				Name: strings.TrimSpace(*args.Name), Description: description, Role: role, Attributes: attributes,
			})
		}
	case "update_character":
		if projectID == "" || strings.TrimSpace(args.Character) == "" {
			err = errors.New("projectId and character are required")
		} else {
			current, readErr := h.reads.ReadCharacter(ctx, userID, projectID, strings.TrimSpace(args.Character))
			if readErr != nil {
				err = readErr
			} else if current == nil {
				err = errors.New("character not found")
			} else {
				var attributes *map[string]string
				if args.Traits != nil || args.Motivation != nil || args.Voice != nil || args.Relationships != nil {
					merged := make(map[string]string, len(current.Attributes))
					for key, item := range current.Attributes {
						merged[key] = item
					}
					applyCharacterAttribute(merged, "traits", args.Traits)
					applyCharacterAttribute(merged, "motivation", args.Motivation)
					applyCharacterAttribute(merged, "voice", args.Voice)
					applyCharacterAttribute(merged, "relationships", args.Relationships)
					attributes = &merged
				}
				var description *string
				if _, present := rawStringField(call.Arguments, "description"); present {
					cleaned := strings.TrimSpace(args.Description)
					description = &cleaned
				}
				value, err = h.writes.UpdateCharacter(ctx, userID, projectID, current.Id, scriptwrites.UpdateCharacterInput{
					Name: args.Name, Description: description, Role: args.Role, Attributes: attributes,
				})
			}
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

func characterToolAttributes(traits, motivation, voice, relationships *string) map[string]string {
	out := map[string]string{}
	applyCharacterAttribute(out, "traits", traits)
	applyCharacterAttribute(out, "motivation", motivation)
	applyCharacterAttribute(out, "voice", voice)
	applyCharacterAttribute(out, "relationships", relationships)
	return out
}

func applyCharacterAttribute(target map[string]string, key string, value *string) {
	if value == nil {
		return
	}
	cleaned := strings.TrimSpace(*value)
	if cleaned == "" {
		delete(target, key)
		return
	}
	target[key] = cleaned
}

func rawStringField(arguments, key string) (string, bool) {
	var fields map[string]json.RawMessage
	if json.Unmarshal([]byte(arguments), &fields) != nil {
		return "", false
	}
	raw, ok := fields[key]
	if !ok {
		return "", false
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return "", false
	}
	return value, true
}

func asSceneTool(call aiadapter.ToolCall) aiadapter.ToolCall {
	names := map[string]string{
		"create_unit": "create_scene", "append_to_unit": "append_to_scene", "rename_unit": "rename_scene",
		"rewrite_unit": "rewrite_scene", "delete_unit": "delete_scene",
	}
	name, ok := names[call.Name]
	if !ok {
		return call
	}
	call.Name = name
	var args map[string]any
	if json.Unmarshal([]byte(call.Arguments), &args) != nil {
		return call
	}
	if value, exists := args["unit_id"]; exists {
		args["scene_id"] = value
		delete(args, "unit_id")
	}
	if value, exists := args["title"]; exists {
		args["scene_heading"] = value
	}
	encoded, err := json.Marshal(args)
	if err == nil {
		call.Arguments = string(encoded)
	}
	return call
}
