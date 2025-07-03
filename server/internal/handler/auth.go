package handler

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/l1roii/screenwriter/server/internal/entity"
	"github.com/l1roii/screenwriter/server/internal/repository"
	"github.com/l1roii/screenwriter/server/pkg/utils"
)

type AuthHandler struct {
	userRepo repository.UserRepository
}

func NewAuthHandler(userRepo repository.UserRepository) *AuthHandler {
	return &AuthHandler{userRepo: userRepo}
}

type RegisterRequest struct {
	Name     string `json:"name"`
	LastName string `json:"lastName"`
	Username string `json:"username"`
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

	tag, err := rand.Int(rand.Reader, big.NewInt(90000))
	if err != nil {
		http.Error(w, `{"error": "Internal server error on tag generation"}`, http.StatusInternalServerError)
		return
	}
	usernameTag := fmt.Sprintf("%05d", tag.Int64()+10000) // Ensures 5 digits, e.g., "12345"

	user := &entity.User{
		Username:    req.Username,
		UsernameTag: usernameTag,
		Name:        req.Name,
		LastName:    req.LastName,
		Email:       strings.ToLower(req.Email),
		Password:    hashedPassword,
	}

	if err := h.userRepo.Create(user); err != nil {
		log.Printf("ERROR: Could not create user: %v", err)
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

	email := strings.ToLower(req.Email)
	user, err := h.userRepo.GetByEmail(email)
	if err != nil || user == nil {
		http.Error(w, `{"error": "Invalid email or password"}`, http.StatusUnauthorized)
		return
	}

	if !utils.CheckPasswordHash(req.Password, user.Password) {
		http.Error(w, `{"error": "Invalid email or password"}`, http.StatusUnauthorized)
		return
	}

	claims := jwt.MapClaims{
		"sub": user.ID,
		"eml": user.Email,
		"usn": user.Username,
		"tag": user.UsernameTag,
		"nam": fmt.Sprintf("%s %s", user.Name, user.LastName),
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(time.Hour * 72).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	jwtSecret := os.Getenv("JWT_SECRET")
	tokenString, err := token.SignedString([]byte(jwtSecret))
	if err != nil {
		http.Error(w, `{"error": "Could not generate token"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"token": tokenString})
}
