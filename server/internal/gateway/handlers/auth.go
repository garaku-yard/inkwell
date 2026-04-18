package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/internal/gateway/middleware"
	identitypb "inkwell/server/pkg/grpc/identity"
)

// AuthHandler routes authentication HTTP requests to the identity gRPC service.
// It holds a reference to the token blocklist so that Logout can immediately
// invalidate a JWT without waiting for its natural expiry.
type AuthHandler struct {
	identityClient identitypb.IdentityServiceClient
	blocklist      *middleware.TokenBlocklist
}

// NewAuthHandler creates an AuthHandler using the identity gRPC client in the
// provided registry. blocklist may be nil when Redis is unavailable; in that
// case Logout will still succeed but will not block the token.
func NewAuthHandler(clients *grpcclient.Registry, blocklist *middleware.TokenBlocklist) *AuthHandler {
	return &AuthHandler{
		identityClient: clients.Identity,
		blocklist:      blocklist,
	}
}

// LoginRequest carries the credentials a client submits to begin a session.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginResponse carries the JWT access token issued after successful authentication.
type LoginResponse struct {
	Token string `json:"token"`
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
// It is used after registration, login, and profile update operations.
type UserResponse struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	UsernameTag string `json:"usernameTag"`
	Name        string `json:"name"`
	LastName    string `json:"lastName"`
	Email       string `json:"email"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

// Login authenticates a user with their email and password. It forwards the
// credentials to the identity service and returns a JWT access token on success.
// Returns 401 if the credentials are invalid or the identity service rejects them.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Call Identity service
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	grpcReq := &identitypb.LoginRequest{
		Email:    req.Email,
		Password: req.Password,
	}

	grpcResp, err := h.identityClient.Login(ctx, grpcReq)
	if err != nil {
		// Map gRPC errors to HTTP errors
		writeError(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Convert gRPC response to HTTP response
	resp := LoginResponse{
		Token: grpcResp.AccessToken,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
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
	if r.Method != http.MethodPatch {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, ok := contextx.UserIDFrom(r.Context())
	if !ok {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

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
		writeError(w, "Failed to update profile", http.StatusInternalServerError)
		return
	}

	resp := UserResponse{
		ID:          grpcResp.User.Id,
		Username:    grpcResp.User.Username,
		UsernameTag: grpcResp.User.UserTag,
		Name:        grpcResp.User.FirstName,
		LastName:    grpcResp.User.LastName,
		Email:       grpcResp.User.Email,
		CreatedAt:   time.Now().Format(time.RFC3339),
		UpdatedAt:   time.Now().Format(time.RFC3339),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ChangePassword updates the authenticated user's password after verifying the
// current one. Requires a userID in the request context. Both currentPassword and
// newPassword must be non-empty; returns 400 if either is missing or if the identity
// service rejects the change (e.g. wrong current password).
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, ok := contextx.UserIDFrom(r.Context())
	if !ok {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.CurrentPassword == "" || req.NewPassword == "" {
		writeError(w, "currentPassword and newPassword are required", http.StatusBadRequest)
		return
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
		writeError(w, "Failed to change password", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// Register creates a new user account by forwarding the request to the identity
// service. On success it returns the new user's public profile. Returns 400 if
// registration fails, for example when the email or username is already taken.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		slog.Warn("failed to decode register request", "error", err)
		writeError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	slog.Info("register request received", "email", req.Email, "username", req.Username)

	// Call Identity service
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	grpcReq := &identitypb.RegisterRequest{
		Email:     req.Email,
		Username:  req.Username,
		Password:  req.Password,
		FirstName: req.Name,
		LastName:  req.LastName,
	}

	grpcResp, err := h.identityClient.Register(ctx, grpcReq)
	if err != nil {
		slog.Error("registration failed", "error", err)
		writeError(w, fmt.Sprintf("Registration failed: %v", err), http.StatusBadRequest)
		return
	}

	resp := UserResponse{
		ID:          grpcResp.User.Id,
		Username:    grpcResp.User.Username,
		UsernameTag: grpcResp.User.Username,
		Name:        grpcResp.User.FirstName,
		LastName:    grpcResp.User.LastName,
		Email:       grpcResp.User.Email,
		CreatedAt:   time.Now().Format(time.RFC3339),
		UpdatedAt:   time.Now().Format(time.RFC3339),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// Logout revokes the caller's JWT by adding it to the Redis blocklist so it cannot
// be reused even if it hasn't expired yet. Responds 200 regardless of whether the
// blocklist write succeeds so the client always clears its local token.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" && h.blocklist != nil {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && parts[0] == "Bearer" {
			token := parts[1]
			// Block for 24 h — generous TTL; the token's own exp claim is the real ceiling.
			if err := h.blocklist.Block(r.Context(), token, 24*time.Hour); err != nil {
				slog.Warn("failed to add token to blocklist", "error", err)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
