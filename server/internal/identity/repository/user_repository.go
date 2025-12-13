package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"

	"scriptlith/server_microservices/internal/identity/domain"
)

// UserRepository defines the interface for user data access
type UserRepository interface {
	// User operations
	CreateUser(ctx context.Context, user *domain.User) error
	GetUserByID(ctx context.Context, id uuid.UUID) (*domain.User, error)
	GetUserByEmail(ctx context.Context, email string) (*domain.User, error)
	GetUserByUsername(ctx context.Context, username string) (*domain.User, error)
	GetUserByUsernameAndTag(ctx context.Context, username, userTag string) (*domain.User, error)
	UpdateUser(ctx context.Context, user *domain.User) error
	UpdatePassword(ctx context.Context, userID uuid.UUID, passwordHash string) error
	UpdateLastLogin(ctx context.Context, userID uuid.UUID) error
	SoftDeleteUser(ctx context.Context, userID uuid.UUID) error

	// Session operations
	CreateSession(ctx context.Context, session *domain.UserSession) error
	GetSession(ctx context.Context, sessionID uuid.UUID) (*domain.UserSession, error)
	GetSessionByRefreshToken(ctx context.Context, refreshToken string) (*domain.UserSession, error)
	GetActiveSessionsByUserID(ctx context.Context, userID uuid.UUID) ([]*domain.UserSession, error)
	UpdateSession(ctx context.Context, session *domain.UserSession) error
	InvalidateSession(ctx context.Context, sessionID uuid.UUID) error
	InvalidateAllUserSessions(ctx context.Context, userID uuid.UUID) error
	CleanupExpiredSessions(ctx context.Context) (int64, error)

	// Utility operations
	EmailExists(ctx context.Context, email string) (bool, error)
	UsernameExists(ctx context.Context, username string) (bool, error)
}

// userRepository implements UserRepository interface
type userRepository struct {
	db *sql.DB
}

// NewUserRepository creates a new UserRepository instance
func NewUserRepository(db *sql.DB) UserRepository {
	return &userRepository{db: db}
}

// CreateUser creates a new user in the database
func (r *userRepository) CreateUser(ctx context.Context, user *domain.User) error {
	query := `
		INSERT INTO users (user_id, email, username, user_tag, password_hash, first_name, last_name, avatar_url, role, is_active, is_verified, email_verified, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	`

	_, err := r.db.ExecContext(ctx, query,
		user.ID,
		user.Email,
		user.Username,
		user.UserTag,
		user.PasswordHash,
		user.FirstName,
		user.LastName,
		user.AvatarURL,
		user.Role,
		user.IsActive,
		user.IsVerified,
		user.EmailVerified,
		user.CreatedAt,
		user.UpdatedAt,
	)

	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok {
			switch pqErr.Code {
			case "23505": // unique_violation
				if pqErr.Constraint == "users_email_key" {
					return domain.ErrEmailExists
				}
				if pqErr.Constraint == "users_username_key" {
					return domain.ErrUsernameExists
				}
			}
		}
		return fmt.Errorf("failed to create user: %w", err)
	}

	return nil
}

// GetUserByID retrieves a user by ID
func (r *userRepository) GetUserByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	query := `
		SELECT user_id, email, username, user_tag, password_hash, first_name, last_name, avatar_url, role, is_active, is_verified, email_verified, last_login_at, created_at, updated_at, deleted_at
		FROM users 
		WHERE user_id = $1 AND deleted_at IS NULL
	`

	user := &domain.User{}
	var lastLogin sql.NullTime

	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&user.ID,
		&user.Email,
		&user.Username,
		&user.UserTag,
		&user.PasswordHash,
		&user.FirstName,
		&user.LastName,
		&user.AvatarURL,
		&user.Role,
		&user.IsActive,
		&user.IsVerified,
		&user.EmailVerified,
		&lastLogin,
		&user.CreatedAt,
		&user.UpdatedAt,
		&user.DeletedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, domain.ErrUserNotFound
		}
		return nil, fmt.Errorf("failed to get user by ID: %w", err)
	}

	if lastLogin.Valid {
		user.LastLoginAt = &lastLogin.Time
	}

	return user, nil
}

// GetUserByEmail retrieves a user by email
func (r *userRepository) GetUserByEmail(ctx context.Context, email string) (*domain.User, error) {
	query := `
		SELECT user_id, email, username, user_tag, password_hash, first_name, last_name, avatar_url, role, is_active, is_verified, email_verified, last_login_at, created_at, updated_at, deleted_at
		FROM users 
		WHERE email = $1 AND deleted_at IS NULL
	`

	user := &domain.User{}
	var lastLogin sql.NullTime

	err := r.db.QueryRowContext(ctx, query, email).Scan(
		&user.ID,
		&user.Email,
		&user.Username,
		&user.UserTag,
		&user.PasswordHash,
		&user.FirstName,
		&user.LastName,
		&user.AvatarURL,
		&user.Role,
		&user.IsActive,
		&user.IsVerified,
		&user.EmailVerified,
		&lastLogin,
		&user.CreatedAt,
		&user.UpdatedAt,
		&user.DeletedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, domain.ErrUserNotFound
		}
		return nil, fmt.Errorf("failed to get user by email: %w", err)
	}

	if lastLogin.Valid {
		user.LastLoginAt = &lastLogin.Time
	}

	return user, nil
}

// GetUserByUsername retrieves a user by username
func (r *userRepository) GetUserByUsername(ctx context.Context, username string) (*domain.User, error) {
	query := `
		SELECT user_id, email, username, user_tag, password_hash, first_name, last_name, avatar_url, role, is_active, is_verified, email_verified, last_login_at, created_at, updated_at, deleted_at
		FROM users 
		WHERE username = $1 AND deleted_at IS NULL
	`

	user := &domain.User{}
	var lastLogin sql.NullTime

	err := r.db.QueryRowContext(ctx, query, username).Scan(
		&user.ID,
		&user.Email,
		&user.Username,
		&user.UserTag,
		&user.PasswordHash,
		&user.FirstName,
		&user.LastName,
		&user.AvatarURL,
		&user.Role,
		&user.IsActive,
		&user.IsVerified,
		&user.EmailVerified,
		&lastLogin,
		&user.CreatedAt,
		&user.UpdatedAt,
		&user.DeletedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, domain.ErrUserNotFound
		}
		return nil, fmt.Errorf("failed to get user by username: %w", err)
	}

	if lastLogin.Valid {
		user.LastLoginAt = &lastLogin.Time
	}

	return user, nil
}

// GetUserByUsernameAndTag retrieves a user by username and user tag
func (r *userRepository) GetUserByUsernameAndTag(ctx context.Context, username, userTag string) (*domain.User, error) {
	query := `
		SELECT user_id, email, username, user_tag, password_hash, first_name, last_name, avatar_url, role, is_active, is_verified, email_verified, last_login_at, created_at, updated_at, deleted_at
		FROM users 
		WHERE username = $1 AND user_tag = $2 AND deleted_at IS NULL
	`

	user := &domain.User{}
	var lastLogin sql.NullTime

	err := r.db.QueryRowContext(ctx, query, username, userTag).Scan(
		&user.ID,
		&user.Email,
		&user.Username,
		&user.UserTag,
		&user.PasswordHash,
		&user.FirstName,
		&user.LastName,
		&user.AvatarURL,
		&user.Role,
		&user.IsActive,
		&user.IsVerified,
		&user.EmailVerified,
		&lastLogin,
		&user.CreatedAt,
		&user.UpdatedAt,
		&user.DeletedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, domain.ErrUserNotFound
		}
		return nil, fmt.Errorf("failed to get user by username and tag: %w", err)
	}

	if lastLogin.Valid {
		user.LastLoginAt = &lastLogin.Time
	}

	return user, nil
}

// UpdateUser updates user information
func (r *userRepository) UpdateUser(ctx context.Context, user *domain.User) error {
	query := `
		UPDATE users 
		SET email = $2, username = $3, role = $4, is_verified = $5, updated_at = $6
		WHERE user_id = $1 AND deleted_at IS NULL
	`

	result, err := r.db.ExecContext(ctx, query,
		user.ID,
		user.Email,
		user.Username,
		user.Role,
		user.IsVerified,
		time.Now(),
	)

	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok {
			switch pqErr.Code {
			case "23505": // unique_violation
				if pqErr.Constraint == "users_email_key" {
					return domain.ErrEmailExists
				}
				if pqErr.Constraint == "users_username_key" {
					return domain.ErrUsernameExists
				}
			}
		}
		return fmt.Errorf("failed to update user: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return domain.ErrUserNotFound
	}

	return nil
}

// UpdatePassword updates user password hash
func (r *userRepository) UpdatePassword(ctx context.Context, userID uuid.UUID, passwordHash string) error {
	query := `
		UPDATE users 
		SET password_hash = $2, updated_at = $3
		WHERE user_id = $1 AND deleted_at IS NULL
	`

	result, err := r.db.ExecContext(ctx, query, userID, passwordHash, time.Now())
	if err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return domain.ErrUserNotFound
	}

	return nil
}

// UpdateLastLogin updates the user's last login timestamp
func (r *userRepository) UpdateLastLogin(ctx context.Context, userID uuid.UUID) error {
	query := `
		UPDATE users 
		SET last_login_at = $2, updated_at = $3
		WHERE user_id = $1 AND deleted_at IS NULL
	`

	now := time.Now()
	result, err := r.db.ExecContext(ctx, query, userID, now, now)
	if err != nil {
		return fmt.Errorf("failed to update last login: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return domain.ErrUserNotFound
	}

	return nil
}

// SoftDeleteUser soft deletes a user
func (r *userRepository) SoftDeleteUser(ctx context.Context, userID uuid.UUID) error {
	query := `
		UPDATE users 
		SET deleted_at = $2, updated_at = $3
		WHERE user_id = $1 AND deleted_at IS NULL
	`

	now := time.Now()
	result, err := r.db.ExecContext(ctx, query, userID, now, now)
	if err != nil {
		return fmt.Errorf("failed to soft delete user: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return domain.ErrUserNotFound
	}

	return nil
}

// CreateSession creates a new user session
func (r *userRepository) CreateSession(ctx context.Context, session *domain.UserSession) error {
	query := `
		INSERT INTO user_sessions (session_id, user_id, refresh_token_hash, device_info, ip_address, expires_at, is_active, created_at, last_used_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`

	_, err := r.db.ExecContext(ctx, query,
		session.ID,
		session.UserID,
		session.RefreshTokenHash,
		session.DeviceInfo,
		session.IPAddress,
		session.ExpiresAt,
		session.IsActive,
		session.CreatedAt,
		session.LastUsedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}

	return nil
}

// GetSession retrieves a session by ID
func (r *userRepository) GetSession(ctx context.Context, sessionID uuid.UUID) (*domain.UserSession, error) {
	query := `
		SELECT session_id, user_id, refresh_token_hash, device_info, ip_address, expires_at, is_active, created_at, last_used_at, revoked_at
		FROM user_sessions 
		WHERE session_id = $1
	`

	session := &domain.UserSession{}
	var revokedAt sql.NullTime

	err := r.db.QueryRowContext(ctx, query, sessionID).Scan(
		&session.ID,
		&session.UserID,
		&session.RefreshTokenHash,
		&session.DeviceInfo,
		&session.IPAddress,
		&session.ExpiresAt,
		&session.IsActive,
		&session.CreatedAt,
		&session.LastUsedAt,
		&revokedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, domain.ErrSessionNotFound
		}
		return nil, fmt.Errorf("failed to get session: %w", err)
	}

	if revokedAt.Valid {
		session.RevokedAt = &revokedAt.Time
	}

	return session, nil
}

// GetSessionByRefreshToken retrieves a session by refresh token hash
func (r *userRepository) GetSessionByRefreshToken(ctx context.Context, refreshTokenHash string) (*domain.UserSession, error) {
	query := `
		SELECT session_id, user_id, refresh_token_hash, device_info, ip_address, expires_at, is_active, created_at, last_used_at, revoked_at
		FROM user_sessions 
		WHERE refresh_token_hash = $1
	`

	session := &domain.UserSession{}
	var revokedAt sql.NullTime

	err := r.db.QueryRowContext(ctx, query, refreshTokenHash).Scan(
		&session.ID,
		&session.UserID,
		&session.RefreshTokenHash,
		&session.DeviceInfo,
		&session.IPAddress,
		&session.ExpiresAt,
		&session.IsActive,
		&session.CreatedAt,
		&session.LastUsedAt,
		&revokedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, domain.ErrSessionNotFound
		}
		return nil, fmt.Errorf("failed to get session by refresh token: %w", err)
	}

	if revokedAt.Valid {
		session.RevokedAt = &revokedAt.Time
	}

	return session, nil
}

// GetActiveSessionsByUserID retrieves all active sessions for a user
func (r *userRepository) GetActiveSessionsByUserID(ctx context.Context, userID uuid.UUID) ([]*domain.UserSession, error) {
	query := `
		SELECT session_id, user_id, refresh_token_hash, device_info, ip_address, expires_at, is_active, created_at, last_used_at, revoked_at
		FROM user_sessions 
		WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
		ORDER BY created_at DESC
	`

	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get active sessions: %w", err)
	}
	defer rows.Close()

	var sessions []*domain.UserSession
	for rows.Next() {
		session := &domain.UserSession{}
		var revokedAt sql.NullTime

		err := rows.Scan(
			&session.ID,
			&session.UserID,
			&session.RefreshTokenHash,
			&session.DeviceInfo,
			&session.IPAddress,
			&session.ExpiresAt,
			&session.IsActive,
			&session.CreatedAt,
			&session.LastUsedAt,
			&revokedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan session: %w", err)
		}

		if revokedAt.Valid {
			session.RevokedAt = &revokedAt.Time
		}

		sessions = append(sessions, session)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate sessions: %w", err)
	}

	return sessions, nil
}

// UpdateSession updates session information
func (r *userRepository) UpdateSession(ctx context.Context, session *domain.UserSession) error {
	query := `
		UPDATE user_sessions 
		SET refresh_token_hash = $2, expires_at = $3, revoked_at = $4
		WHERE session_id = $1
	`

	result, err := r.db.ExecContext(ctx, query,
		session.ID,
		session.RefreshTokenHash,
		session.ExpiresAt,
		session.RevokedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to update session: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return domain.ErrSessionNotFound
	}

	return nil
}

// InvalidateSession revokes a specific session
func (r *userRepository) InvalidateSession(ctx context.Context, sessionID uuid.UUID) error {
	query := `
		UPDATE user_sessions 
		SET revoked_at = $2
		WHERE session_id = $1 AND revoked_at IS NULL
	`

	result, err := r.db.ExecContext(ctx, query, sessionID, time.Now())
	if err != nil {
		return fmt.Errorf("failed to invalidate session: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return domain.ErrSessionNotFound
	}

	return nil
}

// InvalidateAllUserSessions revokes all sessions for a user
func (r *userRepository) InvalidateAllUserSessions(ctx context.Context, userID uuid.UUID) error {
	query := `
		UPDATE user_sessions 
		SET revoked_at = $2
		WHERE user_id = $1 AND revoked_at IS NULL
	`

	_, err := r.db.ExecContext(ctx, query, userID, time.Now())
	if err != nil {
		return fmt.Errorf("failed to invalidate all user sessions: %w", err)
	}

	return nil
}

// CleanupExpiredSessions removes expired sessions from the database
func (r *userRepository) CleanupExpiredSessions(ctx context.Context) (int64, error) {
	query := `
		DELETE FROM user_sessions 
		WHERE expires_at < NOW() OR revoked_at < NOW() - INTERVAL '30 days'
	`

	result, err := r.db.ExecContext(ctx, query)
	if err != nil {
		return 0, fmt.Errorf("failed to cleanup expired sessions: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get rows affected: %w", err)
	}

	return rowsAffected, nil
}

// EmailExists checks if an email is already in use
func (r *userRepository) EmailExists(ctx context.Context, email string) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1 AND deleted_at IS NULL)`

	var exists bool
	err := r.db.QueryRowContext(ctx, query, email).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to check email existence: %w", err)
	}

	return exists, nil
}

// UsernameExists checks if a username is already in use
func (r *userRepository) UsernameExists(ctx context.Context, username string) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM users WHERE username = $1 AND deleted_at IS NULL)`

	var exists bool
	err := r.db.QueryRowContext(ctx, query, username).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to check username existence: %w", err)
	}

	return exists, nil
}
