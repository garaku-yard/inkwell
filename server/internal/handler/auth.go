package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/l1roii/screenwriter/server/internal/entity"
	"github.com/l1roii/screenwriter/server/internal/repository"

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

type RegisterRequest struct {
	Name     string `json:"name"`
	LastName string `json:"lastName"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	hashedPassword, err := utils.HashPassword(req.Password)
	if err != nil {
		http.Error(w, `{"error": "Internal server error on hashing"}`, http.StatusInternalServerError)
		return
	}

	user := &entity.User{
		Name:     req.Name,
		LastName: req.LastName,
		Email:    req.Email,
		Password: hashedPassword,
	}

	if err := h.userRepo.Create(user); err != nil {
		http.Error(w, `{"error": "Could not create user"}`, http.StatusInternalServerError)
		return
	}

	user.Password = ""
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(user)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	user, err := h.userRepo.GetByEmail(req.Email)
	if err != nil || user == nil {
		http.Error(w, `{"error": "Invalid email or password"}`, http.StatusUnauthorized)
		return
	}

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
