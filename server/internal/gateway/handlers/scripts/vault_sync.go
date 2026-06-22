package scripts

import (
	"context"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"google.golang.org/protobuf/encoding/protojson"

	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/internal/gateway/handlers"
	scriptspb "inkwell/server/pkg/grpc/scripts"
)

// SyncVault handles POST /api/v1/sync/vault/projects/{projectId}: a bidirectional
// reconcile of a vault project's files (markdown + attachments) for the desktop
// client. Like SyncProject it's a thin protojson↔gRPC bridge — the desktop
// client speaks the same SyncVaultRequest/Response shape. project_id comes from
// the path and owner_id from the auth context; any in-body identity is
// overridden so a caller can't sync someone else's vault. The response is one
// page; when has_more is set the client calls again with the returned cursor.
func (h *ScriptsHandler) SyncVault(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		handlers.WriteError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, ok := contextx.UserIDFrom(r.Context())
	if !ok || userID == "" {
		handlers.WriteError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	projectID := chi.URLParam(r, "projectId")
	if projectID == "" {
		handlers.WriteError(w, "Missing project id", http.StatusBadRequest)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxSyncBody))
	if err != nil {
		handlers.WriteError(w, "Failed to read body", http.StatusBadRequest)
		return
	}

	req := &scriptspb.SyncVaultRequest{}
	if len(body) > 0 {
		if err := (protojson.UnmarshalOptions{DiscardUnknown: true}).Unmarshal(body, req); err != nil {
			handlers.WriteError(w, "Invalid sync payload", http.StatusBadRequest)
			return
		}
	}
	// Authoritative identity comes from the path + auth, never the body.
	req.ProjectId = projectID
	req.OwnerId = userID

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	resp, err := h.scriptsClient.SyncVault(ctx, req)
	if err != nil {
		handlers.HandleGRPCError(w, err)
		return
	}

	out, err := syncMarshal.Marshal(resp)
	if err != nil {
		handlers.WriteError(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(out)
}
