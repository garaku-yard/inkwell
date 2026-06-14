package handlers

import (
	"net/http"
	"time"

	"inkwell/server/internal/gateway/apierror"
	"inkwell/server/pkg/grpc/common"
)

// writeError emits a structured JSON error envelope with the given HTTP status.
// The message is carried in the envelope's `message` field and the envelope's
// `code` is inferred from the HTTP status, producing a stable shape that
// front-end callers can branch on.
func writeError(w http.ResponseWriter, message string, status int) {
	apierror.WriteStatus(w, status, codeForHTTPStatus(status), message)
}

// handleGRPCError converts a gRPC error into a structured envelope and writes
// it to w. It preserves the gRPC status code (NotFound, PermissionDenied, etc.)
// and the server-provided message rather than collapsing everything to HTTP 500.
func handleGRPCError(w http.ResponseWriter, err error) {
	apierror.Write(w, err)
}

// codeForHTTPStatus maps ad-hoc HTTP statuses emitted by handler-level
// validation to the matching apierror.Code so that responses created via
// writeError carry the same envelope shape as those translated from gRPC.
func codeForHTTPStatus(status int) apierror.Code {
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

// timestampToString converts a protobuf Timestamp to an RFC3339 UTC string.
// Returns "" for nil timestamps.
func timestampToString(ts *common.Timestamp) string {
	if ts == nil {
		return ""
	}
	return time.Unix(ts.Seconds, int64(ts.Nanos)).UTC().Format(time.RFC3339)
}
