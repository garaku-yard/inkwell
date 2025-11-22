package domain

import (
	"time"

	"github.com/google/uuid"
)

// Collaborator represents a project collaborator
type Collaborator struct {
	ID        uuid.UUID  `json:"id" db:"collaborator_id"`
	ProjectID uuid.UUID  `json:"project_id" db:"project_id"`
	UserID    uuid.UUID  `json:"user_id" db:"user_id"`
	Role      string     `json:"role" db:"role"`     // "owner", "editor", "viewer"
	Status    string     `json:"status" db:"status"` // "pending", "active", "inactive"
	InvitedBy uuid.UUID  `json:"invited_by" db:"invited_by"`
	InvitedAt time.Time  `json:"invited_at" db:"invited_at"`
	JoinedAt  *time.Time `json:"joined_at,omitempty" db:"joined_at"`
}

// Comment represents a project comment
type Comment struct {
	ID              uuid.UUID  `json:"id" db:"comment_id"`
	ProjectID       uuid.UUID  `json:"project_id" db:"project_id"`
	ScreenplayID    *uuid.UUID `json:"screenplay_id,omitempty" db:"screenplay_id"`
	ScriptElementID *uuid.UUID `json:"script_element_id,omitempty" db:"script_element_id"`
	SceneID         *uuid.UUID `json:"scene_id,omitempty" db:"scene_id"`
	UserID          uuid.UUID  `json:"user_id" db:"user_id"`
	Content         string     `json:"content" db:"content"`
	LineNumber      *int32     `json:"line_number,omitempty" db:"line_number"`
	CharPosition    *int32     `json:"char_position,omitempty" db:"char_position"`
	ParentID        *uuid.UUID `json:"parent_id,omitempty" db:"parent_id"`
	IsResolved      bool       `json:"is_resolved" db:"is_resolved"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
}

// EditSession represents a real-time editing session
type EditSession struct {
	ID           uuid.UUID `json:"id" db:"session_id"`
	ProjectID    uuid.UUID `json:"project_id" db:"project_id"`
	ScreenplayID uuid.UUID `json:"screenplay_id" db:"screenplay_id"`
	UserID       uuid.UUID `json:"user_id" db:"user_id"`
	StartedAt    time.Time `json:"started_at" db:"started_at"`
	LastActivity time.Time `json:"last_activity" db:"last_activity"`
	IsActive     bool      `json:"is_active" db:"is_active"`
}

// EditOperation represents a real-time edit operation
type EditOperation struct {
	ID            uuid.UUID `json:"id" db:"operation_id"`
	SessionID     uuid.UUID `json:"session_id" db:"session_id"`
	UserID        uuid.UUID `json:"user_id" db:"user_id"`
	OperationType string    `json:"operation_type" db:"operation_type"` // "insert", "delete", "replace"
	Position      int32     `json:"position" db:"position"`
	Content       *string   `json:"content,omitempty" db:"content"`
	Length        *int32    `json:"length,omitempty" db:"length"`
	Timestamp     time.Time `json:"timestamp" db:"timestamp"`
}

// UserPresence represents user presence in a project
type UserPresence struct {
	ID             uuid.UUID  `json:"id" db:"presence_id"`
	UserID         uuid.UUID  `json:"user_id" db:"user_id"`
	ProjectID      uuid.UUID  `json:"project_id" db:"project_id"`
	ScreenplayID   *uuid.UUID `json:"screenplay_id,omitempty" db:"screenplay_id"`
	CursorPosition int32      `json:"cursor_position" db:"cursor_position"`
	SelectionStart *int32     `json:"selection_start,omitempty" db:"selection_start"`
	SelectionEnd   *int32     `json:"selection_end,omitempty" db:"selection_end"`
	LastSeen       time.Time  `json:"last_seen" db:"last_seen"`
	IsOnline       bool       `json:"is_online" db:"is_online"`
}

// Domain errors
var (
	ErrCollaboratorNotFound = NewDomainError("collaborator not found", "COLLABORATOR_NOT_FOUND")
	ErrCollaboratorExists   = NewDomainError("collaborator already exists", "COLLABORATOR_EXISTS")
	ErrUnauthorized         = NewDomainError("unauthorized", "UNAUTHORIZED")
	ErrCommentNotFound      = NewDomainError("comment not found", "COMMENT_NOT_FOUND")
	ErrEditSessionNotFound  = NewDomainError("edit session not found", "EDIT_SESSION_NOT_FOUND")
	ErrUserPresenceNotFound = NewDomainError("user presence not found", "USER_PRESENCE_NOT_FOUND")
	ErrInvalidRole          = NewDomainError("invalid role", "INVALID_ROLE")
	ErrInvalidStatus        = NewDomainError("invalid status", "INVALID_STATUS")
)

// DomainError represents a domain-specific error
type DomainError struct {
	Message string
	Code    string
}

func (e *DomainError) Error() string {
	return e.Message
}

func NewDomainError(message, code string) *DomainError {
	return &DomainError{
		Message: message,
		Code:    code,
	}
}
