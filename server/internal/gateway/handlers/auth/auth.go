package auth

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"google.golang.org/grpc/metadata"

	"inkwell/server/internal/gateway/apierror"
	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/internal/gateway/handlers"
	"inkwell/server/internal/gateway/middleware"
	commonpb "inkwell/server/pkg/grpc/common"
	identitypb "inkwell/server/pkg/grpc/identity"
)

// AuthHandler routes authentication HTTP requests to the identity gRPC service.
// It holds a reference to the token blocklist so Logout can immediately revoke
// a JWT, and the deploy environment string so that cookies use the right
// Secure/SameSite posture.
type AuthHandler struct {
	identityClient identitypb.IdentityServiceClient
	blocklist      *middleware.TokenBlocklist
	environment    string
}

// NewAuthHandler creates an AuthHandler using the identity gRPC client in the
// provided registry. blocklist may be nil when Redis is unavailable; in that
// case Logout will still succeed but will not block the token. environment
// selects the cookie Secure flag ("development" => Secure=false; anything
// else => Secure=true).
func NewAuthHandler(clients *grpcclient.Registry, blocklist *middleware.TokenBlocklist, environment string) *AuthHandler {
	return &AuthHandler{
		identityClient: clients.Identity,
		blocklist:      blocklist,
		environment:    environment,
	}
}

// LoginRequest carries the credentials a client submits to begin a session.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AuthResponse is returned by Login, Register, and GetMe. The access token is
// delivered as an httpOnly cookie rather than in the body, so JavaScript on
// the page cannot exfiltrate it via XSS. Callers that need to know "am I
// logged in" check for a successful response.
type AuthResponse struct {
	User UserResponse `json:"user"`
}

// RegisterRequest holds the fields required to create a new user account.
// All fields are mandatory; the identity service enforces uniqueness of both
// email and username.
type RegisterRequest struct {
	Name     string `json:"name"`
	LastName string `json:"lastName"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// UserResponse represents the user's public profile as returned by the gateway.
// It is used after registration, login, profile update, and /users/me operations.
type UserResponse struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	UsernameTag string `json:"usernameTag"`
	Name        string `json:"name"`
	LastName    string `json:"lastName"`
	Email       string `json:"email"`
	Role        string `json:"role,omitempty"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

// userFromProto maps an identity proto User to the gateway's JSON response shape.
func userFromProto(u *identitypb.User) UserResponse {
	return UserResponse{
		ID:          u.Id,
		Username:    u.Username,
		UsernameTag: u.UserTag,
		Name:        u.FirstName,
		LastName:    u.LastName,
		Email:       u.Email,
		Role:        u.Role,
		CreatedAt:   time.Now().Format(time.RFC3339),
		UpdatedAt:   time.Now().Format(time.RFC3339),
	}
}

// Login authenticates a user with their email and password. On success the
// JWT is written as an httpOnly cookie (no token in the body) and the user
// profile is returned so the client can populate its auth state in one
// round-trip. Returns 401 on bad credentials.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		handlers.WriteError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		handlers.WriteError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	ctx = withSessionMetadata(ctx, r)

	grpcResp, err := h.identityClient.Login(ctx, &identitypb.LoginRequest{
		Email:    req.Email,
		Password: req.Password,
	})
	if err != nil {
		handlers.WriteError(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	SetAuthCookie(w, grpcResp.AccessToken, h.environment)
	SetSidCookie(w, grpcResp.SessionId, h.environment)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(AuthResponse{User: userFromProto(grpcResp.User)})
}

// UpdateProfileRequest carries the profile fields to update for the authenticated user.
// Only non-empty fields are forwarded to the identity service; omitted fields are left unchanged.
type UpdateProfileRequest struct {
	Username string `json:"username,omitempty"`
	Email    string `json:"email,omitempty"`
}

// UpdateProfile applies a partial profile update for the authenticated user.
// It requires a userID in the request context (set by the auth middleware) and
// forwards only non-empty fields to the identity service. Returns 401 if the
// context carries no userID.
func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[UpdateProfileRequest, UserResponse]{
		Method: http.MethodPatch,
		Auth:   true,
		Decode: func(r *http.Request) (*UpdateProfileRequest, error) {
			var req UpdateProfileRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return nil, errors.New("Invalid request body")
			}
			return &req, nil
		},
		Handle: func(r *http.Request, userID string, req *UpdateProfileRequest) (*UserResponse, error) {
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()

			grpcReq := &identitypb.UpdateUserRequest{
				UserId: userID,
			}
			if req.Email != "" {
				grpcReq.Email = &req.Email
			}
			if req.Username != "" {
				grpcReq.Username = &req.Username
			}

			grpcResp, err := h.identityClient.UpdateUser(ctx, grpcReq)
			if err != nil {
				slog.Error("UpdateProfile gRPC error", "error", err)
				return nil, apierror.New(apierror.CodeInternal, http.StatusInternalServerError, "Failed to update profile")
			}

			resp := userFromProto(grpcResp.User)
			return &resp, nil
		},
	}.ServeHTTP(w, r)
}

// ChangePassword updates the authenticated user's password after verifying the
// current one. Requires a userID in the request context. Both currentPassword and
// newPassword must be non-empty; returns 400 if either is missing or if the identity
// service rejects the change (e.g. wrong current password).
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	type changePasswordBody struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	handlers.Endpoint[changePasswordBody, map[string]bool]{
		Method: http.MethodPost,
		Auth:   true,
		Decode: func(r *http.Request) (*changePasswordBody, error) {
			var req changePasswordBody
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return nil, errors.New("Invalid request body")
			}
			return &req, nil
		},
		Handle: func(r *http.Request, userID string, req *changePasswordBody) (*map[string]bool, error) {
			if req.CurrentPassword == "" || req.NewPassword == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "currentPassword and newPassword are required")
			}

			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()

			_, err := h.identityClient.ChangePassword(ctx, &identitypb.ChangePasswordRequest{
				UserId:          userID,
				CurrentPassword: req.CurrentPassword,
				NewPassword:     req.NewPassword,
			})
			if err != nil {
				slog.Error("ChangePassword gRPC error", "error", err)
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "Failed to change password")
			}

			return &map[string]bool{"success": true}, nil
		},
	}.ServeHTTP(w, r)
}

// Register creates a new user account and immediately logs them in by setting
// the auth cookie alongside the new user profile in the response body. Returns
// a structured error envelope if registration fails (e.g. email already taken).
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		handlers.WriteError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		slog.Warn("failed to decode register request", "error", err)
		handlers.WriteError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	slog.Info("register request received", "email", req.Email, "username", req.Username)

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	ctx = withSessionMetadata(ctx, r)

	grpcResp, err := h.identityClient.Register(ctx, &identitypb.RegisterRequest{
		Email:     req.Email,
		Username:  req.Username,
		Password:  req.Password,
		FirstName: req.Name,
		LastName:  req.LastName,
	})
	if err != nil {
		slog.Error("registration failed", "error", err)
		handlers.HandleGRPCError(w, err)
		return
	}

	SetAuthCookie(w, grpcResp.AccessToken, h.environment)
	SetSidCookie(w, grpcResp.SessionId, h.environment)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(AuthResponse{User: userFromProto(grpcResp.User)})
}

// Me returns the authenticated user's profile. The frontend calls this on
// mount to determine whether a session cookie is valid and to hydrate its
// auth state without having to read a JWT.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, AuthResponse]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*AuthResponse, error) {
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()

			grpcResp, err := h.identityClient.GetUser(ctx, &identitypb.GetUserRequest{UserId: userID})
			if err != nil {
				slog.Error("Me gRPC error", "error", err)
				return nil, err
			}

			return &AuthResponse{User: userFromProto(grpcResp.User)}, nil
		},
	}.ServeHTTP(w, r)
}

// Logout revokes the caller's JWT by blocklisting it in Redis and clearing the
// auth cookie. The token is discovered from either the cookie (browser flow)
// or the Authorization header (API clients / tests). Responds 200 regardless
// of whether the blocklist write succeeds so the client always drops the
// session cleanly.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	token := tokenFromRequest(r)
	if token != "" && h.blocklist != nil {
		// Block for 24 h — generous TTL; the token's own exp claim is the real ceiling.
		if err := h.blocklist.Block(r.Context(), token, 24*time.Hour); err != nil {
			slog.Warn("failed to add token to blocklist", "error", err)
		}
	}

	// Best-effort: revoke the current session row so it stops appearing in the
	// user's Active Sessions list. Logout runs under the auth middleware, so the
	// userID is on the context; the session id comes from the sid cookie.
	if userID, ok := contextx.UserIDFrom(r.Context()); ok {
		if sid := sidFromRequest(r); sid != "" {
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			if _, err := h.identityClient.RevokeSession(ctx, &identitypb.RevokeSessionRequest{UserId: userID, SessionId: sid}); err != nil {
				slog.Warn("logout: failed to revoke session", "error", err)
			}
			cancel()
		}
	}

	ClearAuthCookie(w, h.environment)
	ClearSidCookie(w, h.environment)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// SessionResponse is one active session shown in Security → Active Sessions.
type SessionResponse struct {
	ID         string `json:"id"`
	DeviceInfo string `json:"deviceInfo"`
	IPAddress  string `json:"ipAddress"`
	CreatedAt  string `json:"createdAt"`
	LastUsedAt string `json:"lastUsedAt"`
	ExpiresAt  string `json:"expiresAt"`
	IsCurrent  bool   `json:"isCurrent"`
}

func sessionFromProto(s *identitypb.Session) SessionResponse {
	return SessionResponse{
		ID:         s.SessionId,
		DeviceInfo: s.DeviceInfo,
		IPAddress:  s.IpAddress,
		CreatedAt:  commonTimeToRFC3339(s.CreatedAt),
		LastUsedAt: commonTimeToRFC3339(s.LastUsedAt),
		ExpiresAt:  commonTimeToRFC3339(s.ExpiresAt),
		IsCurrent:  s.IsCurrent,
	}
}

// ListSessions returns the authenticated user's active sessions, flagging the
// one belonging to the requesting device (via the sid cookie).
func (h *AuthHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, []SessionResponse]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*[]SessionResponse, error) {
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()

			grpcResp, err := h.identityClient.ListSessions(ctx, &identitypb.ListSessionsRequest{
				UserId:           userID,
				CurrentSessionId: sidFromRequest(r),
			})
			if err != nil {
				slog.Error("ListSessions gRPC error", "error", err)
				return nil, err
			}

			out := make([]SessionResponse, len(grpcResp.Sessions))
			for i, s := range grpcResp.Sessions {
				out[i] = sessionFromProto(s)
			}
			return &out, nil
		},
	}.ServeHTTP(w, r)
}

// RevokeSession revokes one of the authenticated user's sessions by id. The
// identity service enforces that the session belongs to the caller (404
// otherwise). Note: this invalidates the session's refresh token immediately;
// a still-valid access token on that device keeps working until it expires
// (≤24h) — the UI surfaces that, and doesn't offer revoke for the current
// device (use logout there).
func (h *AuthHandler) RevokeSession(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, map[string]bool]{
		Method: http.MethodDelete,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*map[string]bool, error) {
			sessionID := chi.URLParam(r, "sessionId")
			if sessionID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "session id is required")
			}

			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()

			if _, err := h.identityClient.RevokeSession(ctx, &identitypb.RevokeSessionRequest{
				UserId:    userID,
				SessionId: sessionID,
			}); err != nil {
				slog.Error("RevokeSession gRPC error", "error", err)
				return nil, err
			}

			return &map[string]bool{"success": true}, nil
		},
	}.ServeHTTP(w, r)
}

// withSessionMetadata attaches the caller's user-agent and client IP as gRPC
// metadata so the identity service can stamp them on the new session row.
func withSessionMetadata(ctx context.Context, r *http.Request) context.Context {
	return metadata.AppendToOutgoingContext(ctx,
		"x-device-info", r.UserAgent(),
		"x-client-ip", clientIP(r),
	)
}

// clientIP best-guesses the caller's IP: the first hop of X-Forwarded-For when
// a proxy set it, otherwise the request's remote address with the port stripped.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i >= 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// commonTimeToRFC3339 formats a proto common.Timestamp as RFC3339 (UTC), or ""
// when nil/zero.
func commonTimeToRFC3339(ts *commonpb.Timestamp) string {
	if ts == nil || ts.Seconds == 0 {
		return ""
	}
	return time.Unix(ts.Seconds, int64(ts.Nanos)).UTC().Format(time.RFC3339)
}

// tokenFromRequest returns the JWT access token carried by r. The cookie set
// by Login/Register takes priority; a Bearer Authorization header is used as
// a fallback so API clients and tests keep working.
func tokenFromRequest(r *http.Request) string {
	if c, err := r.Cookie(AuthCookieName); err == nil && c.Value != "" {
		return c.Value
	}
	header := r.Header.Get("Authorization")
	if header == "" {
		return ""
	}
	const prefix = "Bearer "
	if len(header) <= len(prefix) || header[:len(prefix)] != prefix {
		return ""
	}
	return header[len(prefix):]
}
