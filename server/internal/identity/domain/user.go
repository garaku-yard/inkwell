package domain

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

// User represents a user in the system
type User struct {
	ID            uuid.UUID  `json:"id" db:"user_id"`
	Email         string     `json:"email" db:"email"`
	Username      string     `json:"username" db:"username"`
	UserTag       string     `json:"user_tag" db:"user_tag"` // 5-digit unique tag for username#tag invitations
	PasswordHash  string     `json:"-" db:"password_hash"`   // Never serialize password
	FirstName     *string    `json:"first_name" db:"first_name"`
	LastName      *string    `json:"last_name" db:"last_name"`
	AvatarURL     *string    `json:"avatar_url" db:"avatar_url"`
	Role          string     `json:"role" db:"role"`
	IsActive      bool       `json:"is_active" db:"is_active"`
	IsVerified    bool       `json:"is_verified" db:"is_verified"`       // For repository compatibility
	EmailVerified bool       `json:"email_verified" db:"email_verified"` // For backwards compatibility
	LastLoginAt   *time.Time `json:"last_login_at" db:"last_login_at"`
	CreatedAt     time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt     *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

// UserSession represents an active user session
type UserSession struct {
	ID               uuid.UUID  `json:"id" db:"session_id"`
	UserID           uuid.UUID  `json:"user_id" db:"user_id"`
	RefreshTokenHash string     `json:"-" db:"refresh_token_hash"`
	DeviceInfo       *string    `json:"device_info" db:"device_info"`
	IPAddress        *string    `json:"ip_address" db:"ip_address"`
	ExpiresAt        time.Time  `json:"expires_at" db:"expires_at"`
	IsActive         bool       `json:"is_active" db:"is_active"`
	CreatedAt        time.Time  `json:"created_at" db:"created_at"`
	LastUsedAt       time.Time  `json:"last_used_at" db:"last_used_at"`
	RevokedAt        *time.Time `json:"revoked_at,omitempty" db:"revoked_at"`
}

// PasswordResetToken represents a password reset request
type PasswordResetToken struct {
	ID        uuid.UUID `json:"id" db:"token_id"`
	UserID    uuid.UUID `json:"user_id" db:"user_id"`
	TokenHash string    `json:"-" db:"token_hash"`
	ExpiresAt time.Time `json:"expires_at" db:"expires_at"`
	Used      bool      `json:"used" db:"used"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// EmailVerificationToken represents an email verification token
type EmailVerificationToken struct {
	ID        uuid.UUID `json:"id" db:"token_id"`
	UserID    uuid.UUID `json:"user_id" db:"user_id"`
	TokenHash string    `json:"-" db:"token_hash"`
	ExpiresAt time.Time `json:"expires_at" db:"expires_at"`
	Used      bool      `json:"used" db:"used"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// LoginHistory represents a login attempt
type LoginHistory struct {
	ID            uuid.UUID `json:"id" db:"login_id"`
	UserID        uuid.UUID `json:"user_id" db:"user_id"`
	IPAddress     *string   `json:"ip_address" db:"ip_address"`
	UserAgent     *string   `json:"user_agent" db:"user_agent"`
	Success       bool      `json:"success" db:"success"`
	FailureReason *string   `json:"failure_reason" db:"failure_reason"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
}

// TokenPair represents access and refresh tokens
type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int64  `json:"expires_in"`
}

// RegisterRequest represents user registration data
type RegisterRequest struct {
	Email     string  `json:"email" validate:"required,email"`
	Username  string  `json:"username" validate:"required,min=3,max=50"`
	Password  string  `json:"password" validate:"required,min=8"`
	FirstName *string `json:"first_name,omitempty"`
	LastName  *string `json:"last_name,omitempty"`
}

// LoginRequest represents login credentials
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

// UpdateUserRequest represents user update data
type UpdateUserRequest struct {
	Email     *string `json:"email,omitempty" validate:"omitempty,email"`
	Username  *string `json:"username,omitempty" validate:"omitempty,min=3,max=50"`
	FirstName *string `json:"first_name,omitempty"`
	LastName  *string `json:"last_name,omitempty"`
	AvatarURL *string `json:"avatar_url,omitempty"`
}

// ChangePasswordRequest represents password change data
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min=8"`
}

// Constants for user roles
const (
	RoleUser    = "user"
	RoleAdmin   = "admin"
	RolePremium = "premium"
)

// Domain errors
var (
	ErrUserNotFound      = errors.New("user not found")
	ErrUserAlreadyExists = errors.New("user already exists")
	ErrEmailExists       = errors.New("email already exists")
	// ErrUserTagTaken means the (username, user_tag) pair collides with an
	// existing user. Usernames are not unique on their own (Model B); the
	// username#tag combination is. Register/profile-update regenerate the tag
	// and retry on this error rather than surfacing it.
	ErrUserTagTaken        = errors.New("username#tag combination already in use")
	ErrInvalidCredentials  = errors.New("invalid credentials")
	ErrInvalidToken        = errors.New("invalid token")
	ErrInvalidRefreshToken = errors.New("invalid refresh token")
	ErrTokenExpired        = errors.New("token expired")
	ErrTokenAlreadyUsed    = errors.New("token already used")
	ErrSessionExpired      = errors.New("session expired")
	ErrSessionNotFound     = errors.New("session not found")
	ErrInvalidTOTP         = errors.New("invalid two-factor code")
	ErrTOTPAlreadyEnabled  = errors.New("two-factor is already enabled")
	ErrTOTPNotEnrolled     = errors.New("no pending two-factor enrolment")
	ErrTOTPNotEnabled      = errors.New("two-factor is not enabled")
	ErrInvalidEmail        = errors.New("invalid email format")
	ErrInvalidUsername     = errors.New("invalid username format")
	ErrWeakPassword        = errors.New("password is too weak")
	ErrUserNotActive       = errors.New("user account is not active")
	ErrEmailNotVerified    = errors.New("email not verified")
)

// Validation functions
func (u *User) Validate() error {
	if err := ValidateEmail(u.Email); err != nil {
		return err
	}
	if err := ValidateUsername(u.Username); err != nil {
		return err
	}
	if !IsValidRole(u.Role) {
		return errors.New("invalid role")
	}
	return nil
}

func ValidateEmail(email string) error {
	if email == "" {
		return ErrInvalidEmail
	}

	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	if !emailRegex.MatchString(email) {
		return ErrInvalidEmail
	}

	return nil
}

func ValidateUsername(username string) error {
	if len(username) < 3 || len(username) > 50 {
		return ErrInvalidUsername
	}

	// Username can contain alphanumeric, underscore, hyphen
	usernameRegex := regexp.MustCompile(`^[a-zA-Z0-9_\-]+$`)
	if !usernameRegex.MatchString(username) {
		return ErrInvalidUsername
	}

	return nil
}

func ValidatePassword(password string) error {
	if len(password) < 8 {
		return ErrWeakPassword
	}

	// Check for at least one number, one letter, and one special character
	hasNumber := regexp.MustCompile(`[0-9]`).MatchString(password)
	hasLetter := regexp.MustCompile(`[a-zA-Z]`).MatchString(password)
	hasSpecial := regexp.MustCompile(`[!@#$%^&*(),.?":{}|<>]`).MatchString(password)

	if !hasNumber || !hasLetter || !hasSpecial {
		return ErrWeakPassword
	}

	return nil
}

func IsValidRole(role string) bool {
	validRoles := []string{RoleUser, RoleAdmin, RolePremium}
	for _, validRole := range validRoles {
		if role == validRole {
			return true
		}
	}
	return false
}

// Helper methods
func (u *User) GetFullName() string {
	var parts []string
	if u.FirstName != nil && *u.FirstName != "" {
		parts = append(parts, *u.FirstName)
	}
	if u.LastName != nil && *u.LastName != "" {
		parts = append(parts, *u.LastName)
	}
	return strings.Join(parts, " ")
}

func (u *User) IsAdmin() bool {
	return u.Role == RoleAdmin
}

func (u *User) IsPremium() bool {
	return u.Role == RolePremium || u.Role == RoleAdmin
}

func (s *UserSession) IsExpired() bool {
	return time.Now().After(s.ExpiresAt)
}

func (s *UserSession) IsRevoked() bool {
	return s.RevokedAt != nil
}

func (t *PasswordResetToken) IsExpired() bool {
	return time.Now().After(t.ExpiresAt)
}

func (t *EmailVerificationToken) IsExpired() bool {
	return time.Now().After(t.ExpiresAt)
}

// GenerateUserTag generates a random 5-digit user tag
func GenerateUserTag() string {
	// Generate a random number between 10000 and 99999
	n, _ := rand.Int(rand.Reader, big.NewInt(90000))
	return fmt.Sprintf("%05d", n.Int64()+10000)
}

// GetDisplayName returns the username#tag format
func (u *User) GetDisplayName() string {
	return fmt.Sprintf("%s#%s", u.Username, u.UserTag)
}

// ParseUserIdentifier parses either email or username#tag format
func ParseUserIdentifier(identifier string) (string, string, bool) {
	// Check if it's an email
	if strings.Contains(identifier, "@") {
		return identifier, "", true // email format
	}

	// Check if it's username#tag format
	parts := strings.Split(identifier, "#")
	if len(parts) == 2 && len(parts[1]) == 5 {
		// Validate that tag is numeric
		for _, r := range parts[1] {
			if r < '0' || r > '9' {
				return "", "", false
			}
		}
		return parts[0], parts[1], false // username#tag format
	}

	return "", "", false // invalid format
}
