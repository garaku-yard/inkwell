package ai

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/internal/gateway/handlers"
	"inkwell/server/internal/gateway/handlers/ai/approval"
)

type approvalDecision struct {
	Decision  string `json:"decision"`
	ProjectID string `json:"projectId"`
}

func (h *AIHandler) DecideApproval(w http.ResponseWriter, r *http.Request) {
	userID, ok := contextx.UserIDFrom(r.Context())
	if !ok {
		handlers.WriteError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if h.approvals == nil {
		handlers.WriteError(w, "Approval service unavailable", http.StatusServiceUnavailable)
		return
	}
	var body approvalDecision
	if json.NewDecoder(r.Body).Decode(&body) != nil || body.ProjectID == "" {
		handlers.WriteError(w, "decision and projectId are required", http.StatusBadRequest)
		return
	}
	id := chi.URLParam(r, "checkpointId")
	if body.Decision == "deny" {
		c, err := h.approvals.Deny(r.Context(), id, userID, body.ProjectID)
		if err != nil {
			handlers.WriteError(w, "Approval not found or expired", http.StatusNotFound)
			return
		}
		if err := h.approvals.Audit(r.Context(), approval.AuditRecord{CheckpointID: c.ID, UserID: userID, ProjectID: c.ProjectID, Tool: c.Tool.Name, Decision: "denied", CorrelationID: c.CorrelationID, Arguments: json.RawMessage(c.Tool.Arguments)}); err != nil {
			slog.Error("hosted approval audit failed", "checkpoint_id", c.ID, "error", err)
		}
		writeJSON(w, map[string]any{"denied": true})
		return
	}
	if body.Decision != "approve" {
		handlers.WriteError(w, "decision must be approve or deny", http.StatusBadRequest)
		return
	}
	c, err := h.approvals.Consume(r.Context(), id, userID, body.ProjectID)
	if err != nil {
		handlers.WriteError(w, "Approval not found or expired", http.StatusNotFound)
		return
	}
	var before any
	var result any
	var args struct {
		SceneID string `json:"scene_id"`
		Content string `json:"content"`
	}
	if json.Unmarshal([]byte(c.Tool.Arguments), &args) != nil {
		handlers.WriteError(w, "Invalid checkpoint", http.StatusBadRequest)
		return
	}
	switch c.Tool.Name {
	case "rewrite_scene":
		if args.SceneID == "" {
			handlers.WriteError(w, "Invalid checkpoint", http.StatusBadRequest)
			return
		}
		current, e := h.reads.ReadScene(r.Context(), userID, c.ProjectID, args.SceneID)
		if e != nil || current.Scene == nil {
			handlers.WriteError(w, "Approval authorization failed", http.StatusForbidden)
			return
		}
		before = current
		result, err = h.writes.RewriteScene(r.Context(), userID, c.ProjectID, args.SceneID, args.Content, c.Category)
	case "delete_scene":
		if args.SceneID == "" {
			handlers.WriteError(w, "Invalid checkpoint", http.StatusBadRequest)
			return
		}
		before, err = h.writes.DeleteScene(r.Context(), userID, c.ProjectID, args.SceneID)
		result = map[string]bool{"deleted": err == nil}
	default:
		if c.Tool.Name != "create_scene" && c.Tool.Name != "append_to_scene" && c.Tool.Name != "add_beat" && c.Tool.Name != "rename_scene" {
			handlers.WriteError(w, "Unsupported approval tool", http.StatusBadRequest)
			return
		}
		raw := h.executeHostedTool(r.Context(), userID, c.ProjectID, c.Category, c.Tool)
		var decoded map[string]any
		if json.Unmarshal([]byte(raw), &decoded) != nil {
			handlers.WriteError(w, "Approval execution failed", http.StatusInternalServerError)
			return
		}
		if message, failed := decoded["error"].(string); failed {
			handlers.WriteError(w, message, http.StatusForbidden)
			return
		}
		result = decoded
	}
	if err != nil {
		handlers.WriteError(w, "Approval execution failed", http.StatusForbidden)
		return
	}
	beforeJSON, _ := json.Marshal(before)
	resultJSON, _ := json.Marshal(result)
	if err := h.approvals.Audit(r.Context(), approval.AuditRecord{CheckpointID: c.ID, UserID: userID, ProjectID: c.ProjectID, Tool: c.Tool.Name, Decision: "approved", CorrelationID: c.CorrelationID, Arguments: json.RawMessage(c.Tool.Arguments), Before: beforeJSON, Result: resultJSON, At: time.Now().UTC()}); err != nil {
		slog.Error("hosted approval audit failed", "checkpoint_id", c.ID, "error", err)
	}
	writeJSON(w, map[string]any{"approved": true, "result": result})
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}
