// Package apierror defines the structured error envelope used by the gateway's
// HTTP responses. The envelope carries a machine-readable code, a human-readable
// message, an HTTP status, and optional per-field details so that front-end
// callers can branch on error type and surface field-level validation errors
// without pattern-matching on message strings.
package apierror

import (
	"encoding/json"
	"errors"
	"net/http"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Code is a stable machine-readable identifier that the front-end uses to
// disambiguate error types without inspecting message text.
type Code string

// Canonical error codes. Add new values sparingly and never reuse old ones:
// front-end code may switch on these.
const (
	CodeUnknown            Code = "UNKNOWN"
	CodeInvalidArgument    Code = "INVALID_ARGUMENT"
	CodeUnauthenticated    Code = "UNAUTHENTICATED"
	CodePermissionDenied   Code = "PERMISSION_DENIED"
	CodeNotFound           Code = "NOT_FOUND"
	CodeAlreadyExists      Code = "ALREADY_EXISTS"
	CodeFailedPrecondition Code = "FAILED_PRECONDITION"
	CodeInternal           Code = "INTERNAL"
	CodeUnavailable        Code = "UNAVAILABLE"
	CodeDeadlineExceeded   Code = "DEADLINE_EXCEEDED"
	CodeResourceExhausted  Code = "RESOURCE_EXHAUSTED"
)

// Error is the envelope the gateway returns to HTTP clients on failure. It
// implements the standard error interface and is JSON-serialisable.
type Error struct {
	// HTTPStatus is the HTTP status code the gateway should emit.
	HTTPStatus int `json:"-"`
	// Code is a stable identifier for the error kind (e.g. CodeNotFound).
	Code Code `json:"code"`
	// Message is the human-readable description shown in UIs and logs.
	Message string `json:"message"`
	// Fields carries optional per-field validation details (e.g. {"email": "already in use"}).
	Fields map[string]string `json:"fields,omitempty"`
}

// Error implements the error interface.
func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	return string(e.Code) + ": " + e.Message
}

// New constructs an *Error with the given code, HTTP status, and message.
func New(code Code, httpStatus int, message string) *Error {
	return &Error{HTTPStatus: httpStatus, Code: code, Message: message}
}

// WithFields returns a shallow copy of e with the given field-level details attached.
func (e *Error) WithFields(fields map[string]string) *Error {
	cp := *e
	cp.Fields = fields
	return &cp
}

// FromError converts an arbitrary error into an *Error. gRPC status errors are
// translated to the matching canonical Code and HTTP status; already-wrapped
// *Error values are returned as-is; anything else becomes an INTERNAL 500.
func FromError(err error) *Error {
	if err == nil {
		return nil
	}

	var apiErr *Error
	if errors.As(err, &apiErr) {
		return apiErr
	}

	if st, ok := status.FromError(err); ok {
		return fromGRPCStatus(st)
	}

	return &Error{
		HTTPStatus: http.StatusInternalServerError,
		Code:       CodeInternal,
		Message:    err.Error(),
	}
}

// fromGRPCStatus maps a gRPC status to its HTTP-facing envelope.
func fromGRPCStatus(st *status.Status) *Error {
	code, httpStatus := codeToHTTP(st.Code())
	return &Error{
		HTTPStatus: httpStatus,
		Code:       code,
		Message:    st.Message(),
	}
}

// codeToHTTP maps a gRPC code to the canonical Code and HTTP status the
// gateway should emit for that failure class.
func codeToHTTP(c codes.Code) (Code, int) {
	switch c {
	case codes.OK:
		return CodeUnknown, http.StatusOK
	case codes.InvalidArgument:
		return CodeInvalidArgument, http.StatusBadRequest
	case codes.Unauthenticated:
		return CodeUnauthenticated, http.StatusUnauthorized
	case codes.PermissionDenied:
		return CodePermissionDenied, http.StatusForbidden
	case codes.NotFound:
		return CodeNotFound, http.StatusNotFound
	case codes.AlreadyExists:
		return CodeAlreadyExists, http.StatusConflict
	case codes.FailedPrecondition:
		return CodeFailedPrecondition, http.StatusUnprocessableEntity
	case codes.DeadlineExceeded:
		return CodeDeadlineExceeded, http.StatusGatewayTimeout
	case codes.Unavailable:
		return CodeUnavailable, http.StatusServiceUnavailable
	case codes.ResourceExhausted:
		return CodeResourceExhausted, http.StatusTooManyRequests
	default:
		return CodeInternal, http.StatusInternalServerError
	}
}

// Write serialises e as a JSON response with the appropriate HTTP status.
// Use this at the edge of every handler to produce a consistent error shape.
func Write(w http.ResponseWriter, err error) {
	e := FromError(err)
	if e == nil {
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(e.HTTPStatus)
	_ = json.NewEncoder(w).Encode(e)
}

// WriteStatus writes an ad-hoc error with a specific HTTP status, useful for
// validation failures that originate in the handler rather than a gRPC call.
func WriteStatus(w http.ResponseWriter, httpStatus int, code Code, message string) {
	Write(w, &Error{HTTPStatus: httpStatus, Code: code, Message: message})
}
