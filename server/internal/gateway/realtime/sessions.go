package realtime

import (
	"context"
	"log/slog"
	"time"

	"inkwell/server/pkg/grpc/collab"
)

// sessionOpTimeout bounds a single durable-session gRPC call. Durable sessions
// are a persisted overlay on top of live presence, so a slow collab service must
// never stall the WebSocket — the call is abandoned and retried on the next
// focus change or heartbeat.
const sessionOpTimeout = 3 * time.Second

// sessionRecorder persists durable advisory edit sessions through the collab
// service. Where the ephemeral presence store lives only for the length of a
// connection, an edit session is written to Postgres: a row is opened on join,
// its focused element is refreshed on focus changes and heartbeats, and it is
// closed on disconnect. That lets soft-lock markers ("who has this open, and
// where") survive a reconnect or a gateway restart.
//
// Every call is best-effort: a failure is logged and swallowed, never surfaced
// to the editing session. A nil recorder (collab client absent) is a no-op, so
// single-service test setups and Collab-less deployments simply skip persistence.
type sessionRecorder struct {
	client collab.CollaborationServiceClient
}

// newSessionRecorder returns a recorder over the collab client, or nil when the
// client is absent (durable sessions disabled — live presence still works).
func newSessionRecorder(client collab.CollaborationServiceClient) *sessionRecorder {
	if client == nil {
		return nil
	}
	return &sessionRecorder{client: client}
}

// record upserts the (project, user) edit session and sets the element the user
// is focused on (empty = idle). It returns the session id, or "" if the write
// failed. The collab service is get-or-create by (project, user), so this is the
// single call used for join (empty elementID), focus changes, and heartbeats.
func (s *sessionRecorder) record(projectID, userID, elementID string) string {
	if s == nil {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), sessionOpTimeout)
	defer cancel()
	resp, err := s.client.StartEditSession(ctx, &collab.StartEditSessionRequest{
		ProjectId: projectID,
		UserId:    userID,
		ElementId: elementID,
	})
	if err != nil {
		slog.Warn("realtime durable edit-session record failed", "error", err)
		return ""
	}
	return resp.GetSession().GetId()
}

// end closes the session on disconnect. A blank id (record never succeeded) is a
// no-op; ending is idempotent on the service side, so a redundant close is safe.
func (s *sessionRecorder) end(sessionID string) {
	if s == nil || sessionID == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), sessionOpTimeout)
	defer cancel()
	if _, err := s.client.EndEditSession(ctx, &collab.EndEditSessionRequest{SessionId: sessionID}); err != nil {
		slog.Warn("realtime durable edit-session end failed", "error", err)
	}
}
