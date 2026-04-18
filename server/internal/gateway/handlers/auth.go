package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"scriptlith/server/internal/gateway/grpcclient"
	"scriptlith/server/internal/gateway/middleware"
	identitypb "scriptlith/server/pkg/grpc/identity"
)

// AuthHandler handles authentication-related HTTP endpoints.
type AuthHandler struct {
	identityClient identitypb.IdentityServiceClient
	blocklist      *middleware.TokenBlocklist
}

// NewAuthHandler creates a new AuthHandler. blocklist may be nil when Redis is unavailable.
func NewAuthHandler(clients *grpcclient.Registry, blocklist *middleware.TokenBlocklist) *AuthHandler {
	return &AuthHandler{
		identityClient: clients.Identity,
		blocklist:      blocklist,
	}
}

// LoginRequest matches the client's expected structure
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginResponse matches the client's expected structure
type LoginResponse struct {
	Token string `json:"token"`
}

// RegisterRequest matches the client's expected structure
type RegisterRequest struct {
	Name     string `json:"name"`
	LastName string `json:"lastName"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// UserResponse matches the client's expected structure
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

// Login handles the login HTTP endpoint
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

// UpdateProfileRequest matches the client's expected structure
type UpdateProfileRequest struct {
	Username string `json:"username,omitempty"`
	Email    string `json:"email,omitempty"`
}

// UpdateProfile handles the PATCH /users/me endpoint
func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID, ok := r.Context().Value("userID").(string)
	if !ok || userID == "" {
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

// ChangePassword handles PATCH /users/me/password
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, ok := r.Context().Value("userID").(string)
	if !ok || userID == "" {
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

// Register handles the register HTTP endpoint
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
