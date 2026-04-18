package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"inkwell/server/internal/gateway/apierror"
	"inkwell/server/internal/gateway/contextx"
)

// Wrap collapses the decode → auth → validate → call → error-map → respond
// boilerplate that every gateway handler repeats into a single generic entry
// point. It accepts an Endpoint describing the HTTP shape and the business
// logic, and returns an http.HandlerFunc ready to register on chi.
//
// Typical usage:
//
//	router.Post("/projects", Wrap(Endpoint[CreateProjectBody, CreateProjectResponse]{
//	    Auth:          true,
//	    Decode:        JSONBody[CreateProjectBody],
//	    Handle:        h.createProject,
//	    SuccessStatus: http.StatusCreated,
//	}))
//
// Errors from Handle are passed through apierror.Write, so gRPC status errors
// are translated to the structured envelope automatically. Handlers that need
// a specific HTTP status for a validation failure can return an *apierror.Error
// directly.
func Wrap[Req, Resp any](endpoint Endpoint[Req, Resp]) http.HandlerFunc {
	return endpoint.ServeHTTP
}

// Endpoint is a declarative description of an HTTP endpoint. Zero values are
// sensible defaults: Method empty means "any method", Auth false skips the
// userID check, SuccessStatus zero defaults to 200 OK.
type Endpoint[Req, Resp any] struct {
	// Method restricts the endpoint to a single HTTP verb (e.g. http.MethodPost).
	// Leave empty to allow any method — typically used for endpoints that
	// perform their own CORS preflight.
	Method string
	// Auth reports whether an authenticated user is required. When true, the
	// wrapper extracts userID from the request context and returns 401 if absent.
	Auth bool
	// Decode builds the typed request from the HTTP request. See helpers
	// JSONBody, NoBody, etc. A non-nil error is returned as 400 Bad Request.
	Decode func(r *http.Request) (*Req, error)
	// Handle is the business logic. ctx is the HTTP request context; userID
	// is empty when Auth is false.
	Handle func(r *http.Request, userID string, req *Req) (*Resp, error)
	// SuccessStatus is the HTTP status code to emit on success. Defaults to 200.
	SuccessStatus int
}

// ServeHTTP implements http.Handler so callers can pass an Endpoint anywhere
// a handler is expected, without going through Wrap.
func (e Endpoint[Req, Resp]) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if e.Method != "" && r.Method != e.Method {
		apierror.WriteStatus(w, http.StatusMethodNotAllowed, apierror.CodeInvalidArgument, "method not allowed")
		return
	}

	userID := ""
	if e.Auth {
		id, ok := contextx.UserIDFrom(r.Context())
		if !ok {
			apierror.WriteStatus(w, http.StatusUnauthorized, apierror.CodeUnauthenticated, "unauthorized")
			return
		}
		userID = id
	}

	var req *Req
	if e.Decode != nil {
		decoded, err := e.Decode(r)
		if err != nil {
			apierror.WriteStatus(w, http.StatusBadRequest, apierror.CodeInvalidArgument, err.Error())
			return
		}
		req = decoded
	} else {
		// Zero value — callers that don't need a body just ignore req.
		var zero Req
		req = &zero
	}

	resp, err := e.Handle(r, userID, req)
	if err != nil {
		apierror.Write(w, err)
		return
	}

	status := e.SuccessStatus
	if status == 0 {
		status = http.StatusOK
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if any(resp) == nil {
		return
	}
	_ = json.NewEncoder(w).Encode(resp)
}

// JSONBody is a Decode helper that unmarshals the request body as JSON into
// a fresh *T. Returns an error for an empty body, malformed JSON, or IO failure.
func JSONBody[T any](r *http.Request) (*T, error) {
	var v T
	if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
		if errors.Is(err, io.EOF) {
			return nil, errors.New("request body is required")
		}
		return nil, errors.New("invalid JSON")
	}
	return &v, nil
}

// NoBody is a Decode helper for endpoints that carry no request body (e.g. GET).
// Returns a zero-value *T for callers that still want a typed handle on the
// "request" object (often an empty struct used for URL-param extraction).
func NoBody[T any](r *http.Request) (*T, error) {
	var v T
	return &v, nil
}
