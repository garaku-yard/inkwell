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

// maxSyncBody caps a sync upload (a whole project's rows). Generous — a large
// screenplay is low single-digit MB.
const maxSyncBody = 32 << 20 // 32 MiB

// syncMarshal renders the response with proto field names (snake_case) and omits
// unset fields, so a row's absent deleted_at means "live" and empty entity
// arrays are dropped.
var syncMarshal = protojson.MarshalOptions{UseProtoNames: true}

// SyncProject handles POST /api/v1/sync/projects/{projectId}: a bidirectional
// reconcile of one project for the desktop client. Unlike the rest of the
// scripts gateway (hand-mapped JSON structs), the sync payload is the proto
// SyncChanges bundle carried via protojson — the desktop client speaks the same
// shape, so the gateway is a thin protojson↔gRPC bridge. project_id comes from
// the path and owner_id from the auth context; any in-body values are
// overridden so a caller can't sync a project as someone else.
func (h *ScriptsHandler) SyncProject(w http.ResponseWriter, r *http.Request) {
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

	req := &scriptspb.SyncProjectRequest{}
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

	resp, err := h.scriptsClient.SyncProject(ctx, req)
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
