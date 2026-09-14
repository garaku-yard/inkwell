package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base32"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image/png"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/pquerna/otp/totp"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/grpc/metadata"

	"inkwell/server/internal/identity/config"
	"inkwell/server/internal/identity/domain"
	"inkwell/server/internal/identity/repository"
	"inkwell/server/pkg/crypto"
	"inkwell/server/pkg/events"
	"inkwell/server/pkg/outbox"
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
	GetUserByEmail(ctx context.Context, email string) (*UserInfo, error)
	UpdateUserProfile(ctx context.Context, userID uuid.UUID, req *UpdateProfileRequest) error
	ChangePassword(ctx context.Context, userID uuid.UUID, req *ChangePasswordRequest) error
	DeleteAccount(ctx context.Context, userID uuid.UUID) error
	// VerifyPassword checks a password against the user's stored hash (a
	// confirmation gate before destructive actions). ErrInvalidCredentials on mismatch.
	VerifyPassword(ctx context.Context, userID uuid.UUID, password string) error
	// RequestDataDeletion records a GDPR data-deletion request (idempotent).
	RequestDataDeletion(ctx context.Context, userID uuid.UUID) (*domain.DataDeletionRequest, error)
	// GetDataDeletionStatus returns the user's active request, or ErrDataDeletionRequestNotFound.
	GetDataDeletionStatus(ctx context.Context, userID uuid.UUID) (*domain.DataDeletionRequest, error)
	// PurgeExpiredAccounts hard-deletes accounts soft-deleted longer ago than
	// retention (the deletion grace-period reaper). Returns the number purged.
	PurgeExpiredAccounts(ctx context.Context, retention time.Duration) (int64, error)

	// Token validation
	ValidateToken(ctx context.Context, tokenString string) (*UserInfo, time.Time, error)
	ValidateAccessToken(ctx context.Context, tokenString string) (*TokenClaims, error)
	ValidateRefreshToken(ctx context.Context, tokenString string) (*domain.UserSession, error)

	// Session management
	GetActiveSessions(ctx context.Context, userID uuid.UUID, currentSessionID uuid.UUID) ([]*SessionInfo, error)
	RevokeSession(ctx context.Context, userID uuid.UUID, sessionID uuid.UUID) error

	// Two-factor (TOTP). Enroll generates a pending secret; Confirm verifies a
	// code and turns it on (returning one-time recovery codes); Disable turns
	// it off after verifying a current code.
	EnrollTOTP(ctx context.Context, userID uuid.UUID) (*TOTPEnrollment, error)
	ConfirmTOTP(ctx context.Context, userID uuid.UUID, code string) (recoveryCodes []string, err error)
	DisableTOTP(ctx context.Context, userID uuid.UUID, code string) error
}

// TOTPEnrollment is the data the client needs to add Inkwell to an
// authenticator app: the base32 secret (manual entry), the otpauth:// URI, and
// a ready-to-render QR PNG.
type TOTPEnrollment struct {
	Secret     string
	OtpauthURI string
	QRPNG      []byte
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
	// TOTPCode is the second factor: empty on the first step (Login replies
	// with TOTPRequired); on the second step it's a 6-digit TOTP code or a
	// recovery code.
	TOTPCode string `json:"totp_code"`
}

type AuthResponse struct {
	User      *UserInfo         `json:"user"`
	TokenPair *domain.TokenPair `json:"tokens"`
	SessionID uuid.UUID         `json:"session_id"`
	// TOTPRequired is true when the password was correct but 2FA is enabled and
	// no (valid) code was supplied yet. In that case User/TokenPair are nil.
	TOTPRequired bool `json:"totp_required"`
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
	TOTPEnabled bool       `json:"totp_enabled"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	LastLoginAt *time.Time `json:"last_login_at"`
}

type UpdateProfileRequest struct {
	Email, Username, FirstName, LastName, AvatarURL *string
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min=8"`
}

type SessionInfo struct {
	ID         uuid.UUID `json:"id"`
	CreatedAt  time.Time `json:"created_at"`
	ExpiresAt  time.Time `json:"expires_at"`
	LastUsedAt time.Time `json:"last_used_at"`
	DeviceInfo string    `json:"device_info"`
	IPAddress  string    `json:"ip_address"`
	IsCurrent  bool      `json:"is_current"`
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
	db        *sql.DB
	userRepo  repository.UserRepository
	config    *config.Config
	publisher events.Publisher
	outbox    outbox.Store
}

// NewAuthService creates a new AuthService.
//
// The service commits user creation together with a matching `user.created`
// outbox event in a single database transaction so no event can be lost
// if the process crashes after the row insert. db opens transactions;
// store is the event store (typically outbox.NewPostgresStore(db,
// "identity_outbox")); publisher is the best-effort Kafka emitter that
// the background poller falls back to for reliability.
//
// In tests, pass an in-memory outbox.Store and &events.NoopPublisher{}.
func NewAuthService(db *sql.DB, userRepo repository.UserRepository, config *config.Config, publisher events.Publisher, store outbox.Store) AuthService {
	return &authService{
		db:        db,
		userRepo:  userRepo,
		config:    config,
		publisher: publisher,
		outbox:    store,
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

	// Note: usernames are intentionally NOT unique on their own. The unique
	// identity is the (username, user_tag) pair — see the retry loop below.

	// Hash password
	passwordHash, err := s.hashPassword(req.Password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// Create user. The (username, user_tag) pair must be unique (Model B), so
	// two people can share a username as long as their tags differ. The tag is
	// random; the rare collision with an existing username#tag is handled by
	// regenerating the tag and retrying.
	user := &domain.User{
		ID:           uuid.New(),
		Email:        req.Email,
		Username:     req.Username,
		PasswordHash: passwordHash,
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		Role:         "user",
		IsActive:     true,
		IsVerified:   false, // Email verification can be added later
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	payload, err := json.Marshal(map[string]string{
		"user_id":  user.ID.String(),
		"email":    user.Email,
		"username": user.Username,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal user.created payload: %w", err)
	}

	// Commit the user row and its `user.created` outbox event in a single
	// transaction so no event can be lost if the process crashes between the
	// two writes. The inline Publish below is a best-effort fast path; the
	// background outbox poller handles reliability. On a username#tag collision
	// the whole transaction rolls back and we retry with a fresh tag.
	const maxTagAttempts = 10
	event := events.Event{ID: uuid.NewString(), Type: events.EventTypeUserCreated, OccurredAt: time.Now().UTC(), Payload: payload}
	for attempt := 1; ; attempt++ {
		user.UserTag = domain.GenerateUserTag()
		err = outbox.RunInTx(ctx, s.db, func(tx *sql.Tx) error {
			if err := s.userRepo.CreateUserTx(ctx, tx, user); err != nil {
				return err
			}
			return s.outbox.EnqueueTx(ctx, tx, outbox.Event{
				ID:      uuid.MustParse(event.ID),
				Type:    event.Type,
				Payload: payload,
			})
		})
		if err == nil {
			break
		}
		if errors.Is(err, domain.ErrUserTagTaken) && attempt < maxTagAttempts {
			continue // tag collided with an existing username#tag — pick another
		}
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	_ = events.PublishEvent(ctx, s.publisher, event)

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

	// Second factor: if 2FA is on, the password alone isn't enough.
	enabled, ct, nonce, _, err := s.userRepo.GetTOTP(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to read 2FA state: %w", err)
	}
	if enabled {
		if req.TOTPCode == "" {
			// Password OK, but we need the code — signal the client to prompt.
			return &AuthResponse{TOTPRequired: true}, nil
		}
		ok, err := s.verifyLoginTOTP(ctx, user.ID, ct, nonce, req.TOTPCode)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, domain.ErrInvalidTOTP
		}
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

	// 2FA state is surfaced on the profile so the Security UI can show it.
	// Best-effort: a read failure just reports "off".
	totpEnabled, _, _, _, _ := s.userRepo.GetTOTP(ctx, userID)

	return &UserProfileResponse{
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
		TOTPEnabled: totpEnabled,
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

	usernameChanged, err := applyProfilePatch(user, req)
	if err != nil {
		return err
	}

	user.UpdatedAt = time.Now()

	// When the username didn't change, the existing (username, user_tag) pair is
	// already unique, so a plain update suffices. A username change, however, can
	// collide with an existing username#tag — keep the current tag if it still
	// fits, and on collision regenerate the tag and retry (mirrors Register).
	if !usernameChanged {
		return s.userRepo.UpdateUser(ctx, user)
	}
	const maxTagAttempts = 10
	for attempt := 1; ; attempt++ {
		err = s.userRepo.UpdateUser(ctx, user)
		if err == nil {
			return nil
		}
		if errors.Is(err, domain.ErrUserTagTaken) && attempt < maxTagAttempts {
			user.UserTag = domain.GenerateUserTag()
			continue
		}
		return err
	}
}

func applyProfilePatch(user *domain.User, req *UpdateProfileRequest) (bool, error) {
	if req.Email != nil {
		if err := domain.ValidateEmail(*req.Email); err != nil {
			return false, err
		}
		user.Email = *req.Email
	}

	usernameChanged := false
	if req.Username != nil {
		if err := domain.ValidateUsername(*req.Username); err != nil {
			return false, err
		}
		usernameChanged = *req.Username != user.Username
		user.Username = *req.Username
	}

	if req.FirstName != nil {
		if *req.FirstName == "" {
			user.FirstName = nil
		} else {
			user.FirstName = req.FirstName
		}
	}
	if req.LastName != nil {
		if *req.LastName == "" {
			user.LastName = nil
		} else {
			user.LastName = req.LastName
		}
	}
	if req.AvatarURL != nil {
		if *req.AvatarURL == "" {
			user.AvatarURL = nil
		} else {
			user.AvatarURL = req.AvatarURL
		}
	}

	return usernameChanged, nil
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

// dataDeletionSLADays is the window we tell users their data-deletion request
// will be processed within. It also matches the account-deletion grace period.
const dataDeletionSLADays = 30

// VerifyPassword checks a password against the user's stored hash. Returns
// ErrInvalidCredentials on mismatch (mirrors ChangePassword's check).
func (s *authService) VerifyPassword(ctx context.Context, userID uuid.UUID, password string) error {
	user, err := s.userRepo.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return domain.ErrInvalidCredentials
	}
	return nil
}

// RequestDataDeletion records a GDPR data-deletion request. Idempotent: if an
// active request already exists it's returned unchanged.
func (s *authService) RequestDataDeletion(ctx context.Context, userID uuid.UUID) (*domain.DataDeletionRequest, error) {
	if existing, err := s.userRepo.GetActiveDataDeletionRequest(ctx, userID); err == nil {
		return existing, nil
	} else if !errors.Is(err, domain.ErrDataDeletionRequestNotFound) {
		return nil, err
	}
	now := time.Now()
	req := &domain.DataDeletionRequest{
		ID:                     uuid.New(),
		UserID:                 userID,
		Status:                 domain.DataDeletionPending,
		CreatedAt:              now,
		ExpectedCompletionDate: now.Add(dataDeletionSLADays * 24 * time.Hour),
	}
	if err := s.userRepo.CreateDataDeletionRequest(ctx, req); err != nil {
		return nil, err
	}
	return req, nil
}

// GetDataDeletionStatus returns the user's active data-deletion request.
func (s *authService) GetDataDeletionStatus(ctx context.Context, userID uuid.UUID) (*domain.DataDeletionRequest, error) {
	return s.userRepo.GetActiveDataDeletionRequest(ctx, userID)
}

// PurgeExpiredAccounts hard-deletes accounts soft-deleted longer ago than
// retention. Called periodically by the deletion reaper.
func (s *authService) PurgeExpiredAccounts(ctx context.Context, retention time.Duration) (int64, error) {
	return s.userRepo.HardDeleteUsersDeletedBefore(ctx, time.Now().Add(-retention))
}

// ValidateToken validates an access token and returns user info
// ValidateToken validates a JWT access token and returns the associated user
// profile together with the token's natural expiry timestamp. The expiry is
// read from the RegisteredClaims embedded in the JWT; callers can use it to
// surface an accurate "session ends at" time rather than a placeholder.
func (s *authService) ValidateToken(ctx context.Context, tokenString string) (*UserInfo, time.Time, error) {
	claims, err := s.ValidateAccessToken(ctx, tokenString)
	if err != nil {
		return nil, time.Time{}, err
	}

	user, err := s.userRepo.GetUserByID(ctx, claims.UserID)
	if err != nil {
		return nil, time.Time{}, err
	}

	var expiresAt time.Time
	if claims.ExpiresAt != nil {
		expiresAt = claims.ExpiresAt.Time
	}

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
	}, expiresAt, nil
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
func (s *authService) GetActiveSessions(ctx context.Context, userID uuid.UUID, currentSessionID uuid.UUID) ([]*SessionInfo, error) {
	sessions, err := s.userRepo.GetActiveSessionsByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get active sessions: %w", err)
	}

	sessionInfos := make([]*SessionInfo, len(sessions))
	for i, session := range sessions {
		info := &SessionInfo{
			ID:         session.ID,
			CreatedAt:  session.CreatedAt,
			ExpiresAt:  session.ExpiresAt,
			LastUsedAt: session.LastUsedAt,
			IsCurrent:  session.ID == currentSessionID,
		}
		if session.DeviceInfo != nil {
			info.DeviceInfo = *session.DeviceInfo
		}
		if session.IPAddress != nil {
			info.IPAddress = *session.IPAddress
		}
		sessionInfos[i] = info
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
	now := time.Now()
	session := &domain.UserSession{
		ID:               uuid.New(),
		UserID:           user.ID,
		RefreshTokenHash: s.hashRefreshToken(tokenPair.RefreshToken),
		ExpiresAt:        now.Add(s.config.JWTConfig.RefreshTokenExpiry),
		IsActive:         true,
		CreatedAt:        now,
		LastUsedAt:       now,
	}

	// Device + client IP come from gRPC metadata the gateway attaches at
	// login (the identity service has no HTTP request of its own). Absent
	// metadata just leaves them nil.
	if md, ok := metadata.FromIncomingContext(ctx); ok {
		if v := firstMeta(md, "x-device-info"); v != "" {
			session.DeviceInfo = &v
		}
		if v := firstMeta(md, "x-client-ip"); v != "" {
			session.IPAddress = &v
		}
	}

	if err := s.userRepo.CreateSession(ctx, session); err != nil {
		return nil, nil, err
	}

	return tokenPair, session, nil
}

// firstMeta returns the first value for key in md, or "" when absent.
func firstMeta(md metadata.MD, key string) string {
	if vals := md.Get(key); len(vals) > 0 {
		return vals[0]
	}
	return ""
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

// hashRefreshToken returns the SHA-256 hex digest of the refresh token for
// storage. Refresh tokens are 32 bytes of crypto/rand, so they are already
// high-entropy and do not require a slow password hash — we only need a
// one-way function so a database leak cannot hand attackers every live
// session. Lookups hash the incoming token and compare against the stored
// digest.
func (s *authService) hashRefreshToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
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

// GetUserByEmail returns user information for a given email address.
func (s *authService) GetUserByEmail(ctx context.Context, email string) (*UserInfo, error) {
	user, err := s.userRepo.GetUserByEmail(ctx, email)
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

// ── Two-factor (TOTP) ──────────────────────────────────────────────────────

// totpKey derives the 32-byte AES key used to encrypt TOTP secrets at rest
// from the deployment's JWT secret, so no separate key has to be configured.
func (s *authService) totpKey() []byte {
	sum := sha256.Sum256([]byte(s.config.JWTConfig.AccessTokenSecret))
	return sum[:]
}

// EnrollTOTP generates a new (pending, not-yet-enabled) TOTP secret for the
// user and returns the data needed to add it to an authenticator app.
func (s *authService) EnrollTOTP(ctx context.Context, userID uuid.UUID) (*TOTPEnrollment, error) {
	user, err := s.userRepo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	enabled, _, _, _, err := s.userRepo.GetTOTP(ctx, userID)
	if err != nil {
		return nil, err
	}
	if enabled {
		return nil, domain.ErrTOTPAlreadyEnabled
	}

	key, err := totp.Generate(totp.GenerateOpts{Issuer: "Inkwell", AccountName: user.Email})
	if err != nil {
		return nil, fmt.Errorf("generate totp: %w", err)
	}

	ct, nonce, err := crypto.Encrypt(s.totpKey(), []byte(key.Secret()), userID[:])
	if err != nil {
		return nil, fmt.Errorf("encrypt totp secret: %w", err)
	}
	if err := s.userRepo.SetPendingTOTP(ctx, userID, ct, nonce); err != nil {
		return nil, err
	}

	var qr []byte
	if img, ierr := key.Image(256, 256); ierr == nil {
		var buf bytes.Buffer
		if png.Encode(&buf, img) == nil {
			qr = buf.Bytes()
		}
	}

	return &TOTPEnrollment{Secret: key.Secret(), OtpauthURI: key.URL(), QRPNG: qr}, nil
}

// ConfirmTOTP verifies a code against the pending secret and, on success, turns
// 2FA on and returns one-time recovery codes (shown to the user exactly once).
func (s *authService) ConfirmTOTP(ctx context.Context, userID uuid.UUID, code string) ([]string, error) {
	enabled, ct, nonce, _, err := s.userRepo.GetTOTP(ctx, userID)
	if err != nil {
		return nil, err
	}
	if enabled {
		return nil, domain.ErrTOTPAlreadyEnabled
	}
	if len(ct) == 0 {
		return nil, domain.ErrTOTPNotEnrolled
	}

	secret, err := crypto.Decrypt(s.totpKey(), ct, nonce, userID[:])
	if err != nil {
		return nil, fmt.Errorf("decrypt totp secret: %w", err)
	}
	if !totp.Validate(strings.TrimSpace(code), string(secret)) {
		return nil, domain.ErrInvalidTOTP
	}

	plain, hashes, err := generateRecoveryCodes(10)
	if err != nil {
		return nil, err
	}
	if err := s.userRepo.EnableTOTP(ctx, userID, hashes); err != nil {
		return nil, err
	}
	return plain, nil
}

// DisableTOTP turns 2FA off after verifying a current TOTP or recovery code.
func (s *authService) DisableTOTP(ctx context.Context, userID uuid.UUID, code string) error {
	enabled, ct, nonce, _, err := s.userRepo.GetTOTP(ctx, userID)
	if err != nil {
		return err
	}
	if !enabled {
		return domain.ErrTOTPNotEnabled
	}
	ok, err := s.verifyLoginTOTP(ctx, userID, ct, nonce, code)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrInvalidTOTP
	}
	return s.userRepo.DisableTOTP(ctx, userID)
}

// verifyLoginTOTP checks a submitted code against the user's TOTP secret, then
// falls back to consuming a one-time recovery code. Reports whether it matched.
func (s *authService) verifyLoginTOTP(ctx context.Context, userID uuid.UUID, ct, nonce []byte, code string) (bool, error) {
	code = strings.TrimSpace(code)
	if len(ct) > 0 {
		if secret, derr := crypto.Decrypt(s.totpKey(), ct, nonce, userID[:]); derr == nil {
			if totp.Validate(code, string(secret)) {
				return true, nil
			}
		}
	}
	// Recovery-code fallback (one-time use).
	return s.userRepo.ConsumeRecoveryCode(ctx, userID, hashRecoveryCode(code))
}

// generateRecoveryCodes returns n random codes (plaintext, shown once) and
// their sha256 hashes (stored).
func generateRecoveryCodes(n int) (plain, hashes []string, err error) {
	for i := 0; i < n; i++ {
		b := make([]byte, 5) // 5 bytes -> 8 base32 chars
		if _, rerr := rand.Read(b); rerr != nil {
			return nil, nil, rerr
		}
		code := strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b))
		plain = append(plain, code)
		hashes = append(hashes, hashRecoveryCode(code))
	}
	return plain, hashes, nil
}

// hashRecoveryCode normalises and sha256-hashes a recovery code for storage and
// comparison.
func hashRecoveryCode(code string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(code))))
	return hex.EncodeToString(sum[:])
}
