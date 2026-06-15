package handlers

import (
	"net/http"
	"time"

	"inkwell/server/internal/gateway/apierror"
	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/pkg/grpc/common"
)

// GetUserIDFromContext returns the authenticated user ID placed on the request
// context by AuthMiddleware, or "" if absent. It is the shared convenience over
// contextx.UserIDFrom for handlers that don't need the presence bool.
func GetUserIDFromContext(r *http.Request) string {
	id, _ := contextx.UserIDFrom(r.Context())
	return id
}

// WriteError emits a structured JSON error envelope with the given HTTP status.
// The message is carried in the envelope's `message` field and the envelope's
// `code` is inferred from the HTTP status, producing a stable shape that
// front-end callers can branch on.
func WriteError(w http.ResponseWriter, message string, status int) {
	apierror.WriteStatus(w, status, CodeForHTTPStatus(status), message)
}

// HandleGRPCError converts a gRPC error into a structured envelope and writes
// it to w. It preserves the gRPC status code (NotFound, PermissionDenied, etc.)
// and the server-provided message rather than collapsing everything to HTTP 500.
func HandleGRPCError(w http.ResponseWriter, err error) {
	apierror.Write(w, err)
}

// CodeForHTTPStatus maps ad-hoc HTTP statuses emitted by handler-level
// validation to the matching apierror.Code so that responses created via
// WriteError carry the same envelope shape as those translated from gRPC.
func CodeForHTTPStatus(status int) apierror.Code {
	switch status {
	case http.StatusBadRequest:
		return apierror.CodeInvalidArgument
	case http.StatusUnauthorized:
		return apierror.CodeUnauthenticated
	case http.StatusForbidden:
		return apierror.CodePermissionDenied
	case http.StatusNotFound:
		return apierror.CodeNotFound
	case http.StatusConflict:
		return apierror.CodeAlreadyExists
	case http.StatusUnprocessableEntity:
		return apierror.CodeFailedPrecondition
	case http.StatusServiceUnavailable:
		return apierror.CodeUnavailable
	case http.StatusGatewayTimeout:
		return apierror.CodeDeadlineExceeded
	default:
		return apierror.CodeInternal
	}
}

// TimestampToString converts a protobuf Timestamp to an RFC3339 UTC string.
// Returns "" for nil timestamps.
func TimestampToString(ts *common.Timestamp) string {
	if ts == nil {
		return ""
	}
	return time.Unix(ts.Seconds, int64(ts.Nanos)).UTC().Format(time.RFC3339)
}
