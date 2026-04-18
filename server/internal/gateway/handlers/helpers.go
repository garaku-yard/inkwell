package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"scriptlith/server/pkg/grpc/common"
)

// writeError writes a JSON error response: {"error": "message"}.
// Use this for plain-text error messages.
func writeError(w http.ResponseWriter, message string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// writeRawError writes a pre-formatted JSON body as an application/json error response.
// Use this when the body is already a valid JSON string (e.g. `{"error":"..."}`).
func writeRawError(w http.ResponseWriter, body string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	fmt.Fprint(w, body)
}

// timestampToString converts a protobuf Timestamp to an RFC3339 UTC string.
// Returns "" for nil timestamps.
func timestampToString(ts *common.Timestamp) string {
	if ts == nil {
		return ""
	}
	return time.Unix(ts.Seconds, int64(ts.Nanos)).UTC().Format(time.RFC3339)
}
