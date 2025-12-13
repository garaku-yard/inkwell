package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"scriptlith/server/internal/gateway/config"
	identitypb "scriptlith/server/pkg/grpc/identity"
)

// AuthHandler handles authentication-related HTTP endpoints
type AuthHandler struct {
	config         *config.Config
	identityClient identitypb.IdentityServiceClient
}

// NewAuthHandler creates a new AuthHandler
func NewAuthHandler(cfg *config.Config) (*AuthHandler, error) {
	// Connect to Identity service
	serviceURL := cfg.IdentityService.Host + ":" + cfg.IdentityService.Port
	conn, err := grpc.NewClient(serviceURL, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}

	return &AuthHandler{
		config:         cfg,
		identityClient: identitypb.NewIdentityServiceClient(conn),
	}, nil
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
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Call Identity service
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	grpcReq := &identitypb.LoginRequest{
		Email:    req.Email,
		Password: req.Password,
	}

	grpcResp, err := h.identityClient.Login(ctx, grpcReq)
	if err != nil {
		// Map gRPC errors to HTTP errors
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Convert gRPC response to HTTP response
	resp := LoginResponse{
		Token: grpcResp.AccessToken,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// Register handles the register HTTP endpoint
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Call Identity service
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
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
		// Map gRPC errors to HTTP errors
		http.Error(w, "Registration failed", http.StatusBadRequest)
		return
	}

	// Convert gRPC response to HTTP response
	resp := UserResponse{
		ID:          grpcResp.User.Id,
		Username:    grpcResp.User.Username,
		UsernameTag: grpcResp.User.Username, // Simplified for now
		Name:        grpcResp.User.FirstName,
		LastName:    grpcResp.User.LastName,
		Email:       grpcResp.User.Email,
		CreatedAt:   time.Now().Format(time.RFC3339), // Simplified for now
		UpdatedAt:   time.Now().Format(time.RFC3339), // Simplified for now
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
