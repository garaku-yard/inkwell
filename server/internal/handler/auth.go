package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/l1roii/screenwriter/server/internal/entity"
	"github.com/l1roii/screenwriter/server/internal/repository"

	// Import the new utils package
	"github.com/l1roii/screenwriter/server/pkg/utils"
)

// AuthHandler handles authentication-related HTTP requests.
type AuthHandler struct {
	userRepo repository.UserRepository
}

// NewAuthHandler creates a new instance of AuthHandler.
func NewAuthHandler(userRepo repository.UserRepository) *AuthHandler {
	return &AuthHandler{userRepo: userRepo}
}

// RegisterRequest defines the shape of the JSON body for a registration request.
type RegisterRequest struct {
	Name     string `json:"name"`
	LastName string `json:"lastName"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginRequest defines the shape of the JSON body for a login request.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Register handles new user registration.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Hash the password using the new helper function.
	hashedPassword, err := utils.HashPassword(req.Password)
	if err != nil {
		http.Error(w, `{"error": "Internal server error on hashing"}`, http.StatusInternalServerError)
		return
	}

	// Create user entity
	user := &entity.User{
		Name:     req.Name,
		LastName: req.LastName,
		Email:    req.Email,
		Password: hashedPassword,
	}

	// Save to database
	if err := h.userRepo.Create(user); err != nil {
		// This should be a more specific error check in a real app (e.g., email already exists)
		http.Error(w, `{"error": "Could not create user"}`, http.StatusInternalServerError)
		return
	}

	// Don't send the password back
	user.Password = ""
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(user)
}

// Login handles user login and token generation.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Find user by email
	user, err := h.userRepo.GetByEmail(req.Email)
	if err != nil || user == nil {
		http.Error(w, `{"error": "Invalid email or password"}`, http.StatusUnauthorized)
		return
	}

	// Compare the provided password with the stored hash using the new helper.
	if !utils.CheckPasswordHash(req.Password, user.Password) {
		http.Error(w, `{"error": "Invalid email or password"}`, http.StatusUnauthorized)
		return
	}

	// --- Create JWT Token ---
	// Define token claims (payload)
	claims := jwt.MapClaims{
		"sub": user.ID,
		"eml": user.Email,
		"nam": user.Name,
		"lnm": user.LastName,
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(time.Hour * 72).Unix(),
	}

	// Create the token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// Sign the token with our secret
	jwtSecret := os.Getenv("JWT_SECRET")
	tokenString, err := token.SignedString([]byte(jwtSecret))
	if err != nil {
		http.Error(w, `{"error": "Could not generate token"}`, http.StatusInternalServerError)
		return
	}

	// Send the token back to the client
	json.NewEncoder(w).Encode(map[string]string{
		"token": tokenString,
	})
}
