package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"scriptlith/server/internal/identity/config"
	"scriptlith/server/internal/identity/domain"
	"scriptlith/server/internal/identity/repository"
	"scriptlith/server/pkg/events"
)

// AuthService defines the interface for authentication business logic
type AuthService interface {
	// Authentication
	Register(ctx context.Context, req *RegisterRequest) (*AuthResponse, error)
	Login(ctx context.Context, req *LoginRequest) (*AuthResponse, error)
	RefreshToken(ctx context.Context, refreshToken string) (*domain.TokenPair, error)
	Logout(ctx context.Context, sessionID uuid.UUID) error
	LogoutAll(ctx context.Context, userID uuid.UUID) error

	// User management
	GetUserProfile(ctx context.Context, userID uuid.UUID) (*UserProfileResponse, error)
	GetUserByUsernameTag(ctx context.Context, username, userTag string) (*UserInfo, error)
	UpdateUserProfile(ctx context.Context, userID uuid.UUID, req *UpdateProfileRequest) error
	ChangePassword(ctx context.Context, userID uuid.UUID, req *ChangePasswordRequest) error
	DeleteAccount(ctx context.Context, userID uuid.UUID) error

	// Token validation
	ValidateToken(ctx context.Context, tokenString string) (*UserInfo, error)
	ValidateAccessToken(ctx context.Context, tokenString string) (*TokenClaims, error)
	ValidateRefreshToken(ctx context.Context, tokenString string) (*domain.UserSession, error)

	// Session management
	GetActiveSessions(ctx context.Context, userID uuid.UUID) ([]*SessionInfo, error)
	RevokeSession(ctx context.Context, userID uuid.UUID, sessionID uuid.UUID) error
}

// Request/Response types
type RegisterRequest struct {
	Email     string  `json:"email" validate:"required,email"`
	Username  string  `json:"username" validate:"required,min=3,max=30"`
	Password  string  `json:"password" validate:"required,min=8"`
	FirstName *string `json:"first_name,omitempty"`
	LastName  *string `json:"last_name,omitempty"`
}

type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

type AuthResponse struct {
	User      *UserInfo         `json:"user"`
	TokenPair *domain.TokenPair `json:"tokens"`
	SessionID uuid.UUID         `json:"session_id"`
}

type UserInfo struct {
	ID          uuid.UUID  `json:"id"`
	Email       string     `json:"email"`
	Username    string     `json:"username"`
	UserTag     string     `json:"user_tag"`
	FirstName   *string    `json:"first_name"`
	LastName    *string    `json:"last_name"`
	AvatarURL   *string    `json:"avatar_url"`
	Role        string     `json:"role"`
	IsActive    bool       `json:"is_active"`
	IsVerified  bool       `json:"is_verified"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	LastLoginAt *time.Time `json:"last_login_at"`
}

type UserProfileResponse struct {
	ID          uuid.UUID  `json:"id"`
	Email       string     `json:"email"`
	Username    string     `json:"username"`
	UserTag     string     `json:"user_tag"`
	FirstName   *string    `json:"first_name"`
	LastName    *string    `json:"last_name"`
	AvatarURL   *string    `json:"avatar_url"`
	Role        string     `json:"role"`
	IsActive    bool       `json:"is_active"`
	IsVerified  bool       `json:"is_verified"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	LastLoginAt *time.Time `json:"last_login_at"`
}

type UpdateProfileRequest struct {
	Email    string `json:"email" validate:"omitempty,email"`
	Username string `json:"username" validate:"omitempty,min=3,max=30"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min=8"`
}

type SessionInfo struct {
	ID        uuid.UUID `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
	IsCurrent bool      `json:"is_current"`
}

type TokenClaims struct {
	UserID   uuid.UUID `json:"user_id"`
	Email    string    `json:"email"`
	Username string    `json:"username"`
	UserTag  string    `json:"user_tag"`
	Role     string    `json:"role"`
	jwt.RegisteredClaims
}

// authService implements AuthService interface
type authService struct {
	userRepo  repository.UserRepository
	config    *config.Config
	publisher events.Publisher
}

// NewAuthService creates a new AuthService.
// publisher receives domain events; pass &events.NoopPublisher{} in tests.
func NewAuthService(userRepo repository.UserRepository, config *config.Config, publisher events.Publisher) AuthService {
	return &authService{
		userRepo:  userRepo,
		config:    config,
		publisher: publisher,
	}
}

// Register creates a new user account
func (s *authService) Register(ctx context.Context, req *RegisterRequest) (*AuthResponse, error) {
	// Validate input
	if err := domain.ValidateEmail(req.Email); err != nil {
		return nil, err
	}

	if err := domain.ValidateUsername(req.Username); err != nil {
		return nil, err
	}

	if err := domain.ValidatePassword(req.Password); err != nil {
		return nil, err
	}

	// Check if email or username already exists
	emailExists, err := s.userRepo.EmailExists(ctx, req.Email)
	if err != nil {
		return nil, fmt.Errorf("failed to check email existence: %w", err)
	}
	if emailExists {
		return nil, domain.ErrEmailExists
	}

	usernameExists, err := s.userRepo.UsernameExists(ctx, req.Username)
	if err != nil {
		return nil, fmt.Errorf("failed to check username existence: %w", err)
	}
	if usernameExists {
		return nil, domain.ErrUsernameExists
	}

	// Hash password
	passwordHash, err := s.hashPassword(req.Password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// Set default role
	role := "user"

	// Generate unique user tag
	userTag := domain.GenerateUserTag()
	// TODO: In a production environment, ensure uniqueness by checking database
	// For now, the 5-digit random generation should be sufficient for most cases

	// Create user
	user := &domain.User{
		ID:           uuid.New(),
		Email:        req.Email,
		Username:     req.Username,
		UserTag:      userTag,
		PasswordHash: passwordHash,
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		Role:         role,
		IsActive:     true,
		IsVerified:   false, // Email verification can be added later
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	if err := s.userRepo.CreateUser(ctx, user); err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	_ = s.publisher.Publish(ctx, events.EventTypeUserCreated, map[string]string{
		"user_id":  user.ID.String(),
		"email":    user.Email,
		"username": user.Username,
	})

	// Create session and tokens
	tokenPair, session, err := s.createUserSession(ctx, user)
	if err != nil {
		return nil, fmt.Errorf("failed to create session: %w", err)
	}

	// Update last login
	if err := s.userRepo.UpdateLastLogin(ctx, user.ID); err != nil {
		// Log error but don't fail the registration
		fmt.Printf("Warning: failed to update last login for user %s: %v\n", user.ID, err)
	}

	return &AuthResponse{
		User: &UserInfo{
			ID:          user.ID,
			Email:       user.Email,
			Username:    user.Username,
			UserTag:     user.UserTag,
			FirstName:   user.FirstName,
			LastName:    user.LastName,
			AvatarURL:   user.AvatarURL,
			Role:        user.Role,
			IsActive:    user.IsActive,
			IsVerified:  user.IsVerified,
			CreatedAt:   user.CreatedAt,
			UpdatedAt:   user.UpdatedAt,
			LastLoginAt: user.LastLoginAt,
		},
		TokenPair: tokenPair,
		SessionID: session.ID,
	}, nil
}

// Login authenticates a user
func (s *authService) Login(ctx context.Context, req *LoginRequest) (*AuthResponse, error) {
	// Get user by email
	user, err := s.userRepo.GetUserByEmail(ctx, req.Email)
	if err != nil {
		if err == domain.ErrUserNotFound {
			return nil, domain.ErrInvalidCredentials
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, domain.ErrInvalidCredentials
	}

	// Create session and tokens
	tokenPair, session, err := s.createUserSession(ctx, user)
	if err != nil {
		return nil, fmt.Errorf("failed to create session: %w", err)
	}

	// Update last login
	if err := s.userRepo.UpdateLastLogin(ctx, user.ID); err != nil {
		// Log error but don't fail the login
		fmt.Printf("Warning: failed to update last login for user %s: %v\n", user.ID, err)
	}

	return &AuthResponse{
		User: &UserInfo{
			ID:          user.ID,
			Email:       user.Email,
			Username:    user.Username,
			UserTag:     user.UserTag,
			FirstName:   user.FirstName,
			LastName:    user.LastName,
			AvatarURL:   user.AvatarURL,
			Role:        user.Role,
			IsActive:    user.IsActive,
			IsVerified:  user.IsVerified,
			CreatedAt:   user.CreatedAt,
			UpdatedAt:   user.UpdatedAt,
			LastLoginAt: user.LastLoginAt,
		},
		TokenPair: tokenPair,
		SessionID: session.ID,
	}, nil
}

// RefreshToken generates new tokens using a refresh token
func (s *authService) RefreshToken(ctx context.Context, refreshToken string) (*domain.TokenPair, error) {
	// Hash the refresh token to match stored hash
	refreshTokenHash := s.hashRefreshToken(refreshToken)

	// Get session by refresh token
	session, err := s.userRepo.GetSessionByRefreshToken(ctx, refreshTokenHash)
	if err != nil {
		if err == domain.ErrSessionNotFound {
			return nil, domain.ErrInvalidRefreshToken
		}
		return nil, fmt.Errorf("failed to get session: %w", err)
	}

	// Check if session is valid
	if session.IsExpired() || session.IsRevoked() {
		return nil, domain.ErrInvalidRefreshToken
	}

	// Get user
	user, err := s.userRepo.GetUserByID(ctx, session.UserID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	// Generate new tokens
	tokenPair, err := s.generateTokenPair(user)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	// Update session with new refresh token
	session.RefreshTokenHash = s.hashRefreshToken(tokenPair.RefreshToken)
	session.ExpiresAt = time.Now().Add(s.config.JWTConfig.RefreshTokenExpiry)

	if err := s.userRepo.UpdateSession(ctx, session); err != nil {
		return nil, fmt.Errorf("failed to update session: %w", err)
	}

	return tokenPair, nil
}

// Logout invalidates a user session
func (s *authService) Logout(ctx context.Context, sessionID uuid.UUID) error {
	return s.userRepo.InvalidateSession(ctx, sessionID)
}

// LogoutAll invalidates all user sessions
func (s *authService) LogoutAll(ctx context.Context, userID uuid.UUID) error {
	return s.userRepo.InvalidateAllUserSessions(ctx, userID)
}

// GetUserProfile retrieves user profile information
func (s *authService) GetUserProfile(ctx context.Context, userID uuid.UUID) (*UserProfileResponse, error) {
	user, err := s.userRepo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return &UserProfileResponse{
		ID:          user.ID,
		Email:       user.Email,
		Username:    user.Username,
		Role:        user.Role,
		IsVerified:  user.IsVerified,
		CreatedAt:   user.CreatedAt,
		UpdatedAt:   user.UpdatedAt,
		LastLoginAt: user.LastLoginAt,
	}, nil
}

// UpdateUserProfile updates user profile information
func (s *authService) UpdateUserProfile(ctx context.Context, userID uuid.UUID, req *UpdateProfileRequest) error {
	user, err := s.userRepo.GetUserByID(ctx, userID)
	if err != nil {
		return fmt.Errorf("failed to get user: %w", err)
	}

	// Update fields if provided
	if req.Email != "" {
		if err := domain.ValidateEmail(req.Email); err != nil {
			return err
		}
		user.Email = req.Email
	}

	if req.Username != "" {
		if err := domain.ValidateUsername(req.Username); err != nil {
			return err
		}
		user.Username = req.Username
	}

	user.UpdatedAt = time.Now()

	return s.userRepo.UpdateUser(ctx, user)
}

// ChangePassword changes user password
func (s *authService) ChangePassword(ctx context.Context, userID uuid.UUID, req *ChangePasswordRequest) error {
	user, err := s.userRepo.GetUserByID(ctx, userID)
	if err != nil {
		return fmt.Errorf("failed to get user: %w", err)
	}

	// Verify current password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		return domain.ErrInvalidCredentials
	}

	// Validate new password
	if err := domain.ValidatePassword(req.NewPassword); err != nil {
		return err
	}

	// Hash new password
	newPasswordHash, err := s.hashPassword(req.NewPassword)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	// Update password
	if err := s.userRepo.UpdatePassword(ctx, userID, newPasswordHash); err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}

	// Invalidate all sessions except current one could be implemented here
	// For now, we'll invalidate all sessions for security
	if err := s.userRepo.InvalidateAllUserSessions(ctx, userID); err != nil {
		// Log error but don't fail the password change
		fmt.Printf("Warning: failed to invalidate sessions for user %s: %v\n", userID, err)
	}

	return nil
}

// DeleteAccount soft deletes a user account
func (s *authService) DeleteAccount(ctx context.Context, userID uuid.UUID) error {
	// Invalidate all sessions
	if err := s.userRepo.InvalidateAllUserSessions(ctx, userID); err != nil {
		return fmt.Errorf("failed to invalidate sessions: %w", err)
	}

	// Soft delete user
	return s.userRepo.SoftDeleteUser(ctx, userID)
}

// ValidateToken validates an access token and returns user info
func (s *authService) ValidateToken(ctx context.Context, tokenString string) (*UserInfo, error) {
	// Validate the token
	claims, err := s.ValidateAccessToken(ctx, tokenString)
	if err != nil {
		return nil, err
	}

	// Get user from database
	user, err := s.userRepo.GetUserByID(ctx, claims.UserID)
	if err != nil {
		return nil, err
	}

	// Convert to UserInfo
	return &UserInfo{
		ID:          user.ID,
		Email:       user.Email,
		Username:    user.Username,
		UserTag:     user.UserTag,
		FirstName:   user.FirstName,
		LastName:    user.LastName,
		AvatarURL:   user.AvatarURL,
		Role:        user.Role,
		IsActive:    user.IsActive,
		IsVerified:  user.IsVerified,
		CreatedAt:   user.CreatedAt,
		UpdatedAt:   user.UpdatedAt,
		LastLoginAt: user.LastLoginAt,
	}, nil
}

// ValidateAccessToken validates and parses an access token
func (s *authService) ValidateAccessToken(ctx context.Context, tokenString string) (*TokenClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, jwt.MapClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(s.config.JWTConfig.AccessTokenSecret), nil
	})

	if err != nil {
		return nil, domain.ErrInvalidToken
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		// Convert MapClaims back to TokenClaims for backward compatibility
		userIDStr, ok := claims["sub"].(string)
		if !ok {
			return nil, domain.ErrInvalidToken
		}

		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			return nil, domain.ErrInvalidToken
		}

		email, _ := claims["eml"].(string)
		username, _ := claims["usn"].(string)
		userTag, _ := claims["tag"].(string)
		role, _ := claims["role"].(string)

		return &TokenClaims{
			UserID:   userID,
			Email:    email,
			Username: username,
			UserTag:  userTag,
			Role:     role,
		}, nil
	}

	return nil, domain.ErrInvalidToken
}

// ValidateRefreshToken validates a refresh token and returns the associated session
func (s *authService) ValidateRefreshToken(ctx context.Context, tokenString string) (*domain.UserSession, error) {
	refreshTokenHash := s.hashRefreshToken(tokenString)

	session, err := s.userRepo.GetSessionByRefreshToken(ctx, refreshTokenHash)
	if err != nil {
		return nil, fmt.Errorf("failed to get session: %w", err)
	}

	if session.IsExpired() || session.IsRevoked() {
		return nil, domain.ErrInvalidRefreshToken
	}

	return session, nil
}

// GetActiveSessions retrieves all active sessions for a user
func (s *authService) GetActiveSessions(ctx context.Context, userID uuid.UUID) ([]*SessionInfo, error) {
	sessions, err := s.userRepo.GetActiveSessionsByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get active sessions: %w", err)
	}

	sessionInfos := make([]*SessionInfo, len(sessions))
	for i, session := range sessions {
		sessionInfos[i] = &SessionInfo{
			ID:        session.ID,
			CreatedAt: session.CreatedAt,
			ExpiresAt: session.ExpiresAt,
			IsCurrent: false, // This would need the current session ID to determine
		}
	}

	return sessionInfos, nil
}

// RevokeSession revokes a specific session for a user
func (s *authService) RevokeSession(ctx context.Context, userID uuid.UUID, sessionID uuid.UUID) error {
	// Verify the session belongs to the user
	session, err := s.userRepo.GetSession(ctx, sessionID)
	if err != nil {
		return fmt.Errorf("failed to get session: %w", err)
	}

	if session.UserID != userID {
		return domain.ErrSessionNotFound
	}

	return s.userRepo.InvalidateSession(ctx, sessionID)
}

// Helper methods

// createUserSession creates a new session and tokens for a user
func (s *authService) createUserSession(ctx context.Context, user *domain.User) (*domain.TokenPair, *domain.UserSession, error) {
	// Generate tokens
	tokenPair, err := s.generateTokenPair(user)
	if err != nil {
		return nil, nil, err
	}

	// Create session
	session := &domain.UserSession{
		ID:               uuid.New(),
		UserID:           user.ID,
		RefreshTokenHash: s.hashRefreshToken(tokenPair.RefreshToken),
		ExpiresAt:        time.Now().Add(s.config.JWTConfig.RefreshTokenExpiry),
		CreatedAt:        time.Now(),
	}

	if err := s.userRepo.CreateSession(ctx, session); err != nil {
		return nil, nil, err
	}

	return tokenPair, session, nil
}

// generateTokenPair generates access and refresh tokens for a user
func (s *authService) generateTokenPair(user *domain.User) (*domain.TokenPair, error) {
	// Generate access token with abbreviated field names to match old server format
	accessClaims := jwt.MapClaims{
		"sub":  user.ID.String(),
		"eml":  user.Email,
		"usn":  user.Username,
		"tag":  user.UserTag,
		"role": user.Role,
		"iat":  time.Now().Unix(),
		"exp":  time.Now().Add(s.config.JWTConfig.AccessTokenExpiry).Unix(),
		"nbf":  time.Now().Unix(),
		"iss":  s.config.JWTConfig.Issuer,
	}

	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessTokenString, err := accessToken.SignedString([]byte(s.config.JWTConfig.AccessTokenSecret))
	if err != nil {
		return nil, fmt.Errorf("failed to sign access token: %w", err)
	}

	// Generate refresh token
	refreshToken, err := s.generateSecureToken()
	if err != nil {
		return nil, fmt.Errorf("failed to generate refresh token: %w", err)
	}

	return &domain.TokenPair{
		AccessToken:  accessTokenString,
		RefreshToken: refreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    int64(s.config.JWTConfig.AccessTokenExpiry.Seconds()),
	}, nil
}

// generateSecureToken generates a cryptographically secure random token
func (s *authService) generateSecureToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(bytes), nil
}

// hashPassword hashes a password using bcrypt
func (s *authService) hashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), s.config.SecurityConfig.BcryptCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// hashRefreshToken creates a hash of the refresh token for storage
func (s *authService) hashRefreshToken(token string) string {
	// For simplicity, we're using the token directly as hash
	// In production, you might want to use a proper hash function
	return token
}

// GetUserByUsernameTag returns user information for a given username and tag
func (s *authService) GetUserByUsernameTag(ctx context.Context, username, userTag string) (*UserInfo, error) {
	user, err := s.userRepo.GetUserByUsernameAndTag(ctx, username, userTag)
	if err != nil {
		return nil, err
	}

	// Convert to UserInfo
	return &UserInfo{
		ID:          user.ID,
		Email:       user.Email,
		Username:    user.Username,
		UserTag:     user.UserTag,
		FirstName:   user.FirstName,
		LastName:    user.LastName,
		AvatarURL:   user.AvatarURL,
		Role:        user.Role,
		IsActive:    user.IsActive,
		IsVerified:  user.IsVerified,
		CreatedAt:   user.CreatedAt,
		UpdatedAt:   user.UpdatedAt,
		LastLoginAt: user.LastLoginAt,
	}, nil
}
