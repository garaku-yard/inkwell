package domain

import (
	"time"

	"github.com/google/uuid"
)

// Project represents a screenplay project
type Project struct {
	ID          uuid.UUID  `json:"id" db:"project_id"`
	Title       string     `json:"title" db:"title"`
	Description string     `json:"description" db:"description"`
	OwnerID     uuid.UUID  `json:"owner_id" db:"owner_id"`
	Status      string     `json:"status" db:"status"` // "draft", "active", "completed", "archived"
	IsStarred   bool       `json:"is_starred" db:"is_starred"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

// ScriptElement represents an individual line/element in a screenplay
type ScriptElement struct {
	ID          uuid.UUID         `json:"id" db:"element_id"`
	ProjectID   uuid.UUID         `json:"project_id" db:"project_id"`
	SceneID     *uuid.UUID        `json:"scene_id,omitempty" db:"scene_id"`
	Type        string            `json:"type" db:"element_type"` // "scene_heading", "character", "dialogue", "action", "parenthetical", "transition", "shot"
	Content     string            `json:"content" db:"content"`
	CharacterID *uuid.UUID        `json:"character_id,omitempty" db:"character_id"`
	LineNumber  int32             `json:"line_number" db:"line_number"`
	Formatting  map[string]string `json:"formatting" db:"formatting"` // JSON field for formatting attributes
	CreatedAt   time.Time         `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at" db:"updated_at"`
}

// Scene represents a scene in the screenplay
type Scene struct {
	ID            uuid.UUID  `json:"id" db:"scene_id"`
	ProjectID     uuid.UUID  `json:"project_id" db:"project_id"`
	OutlineUnitID *uuid.UUID `json:"outline_unit_id,omitempty" db:"outline_unit_id"`
	SceneHeading  string     `json:"scene_heading" db:"scene_heading"`
	Content       string     `json:"content" db:"content"`
	OrderIndex    int32      `json:"order_index" db:"order_index"`
	CreatedAt     time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at" db:"updated_at"`
}

// OutlineUnit represents story structure elements (acts, sequences, beats, sub-beats)
type OutlineUnit struct {
	ID          uuid.UUID  `json:"id" db:"outline_unit_id"`
	ProjectID   uuid.UUID  `json:"project_id" db:"project_id"`
	ParentID    *uuid.UUID `json:"parent_id,omitempty" db:"parent_id"`
	Type        string     `json:"type" db:"unit_type"` // "act", "sequence", "beat", "sub-beat"
	Title       string     `json:"title" db:"title"`
	Description string     `json:"description" db:"description"`
	Color       string     `json:"color" db:"color"`
	Tags        []string   `json:"tags" db:"tags"` // JSON array
	Icon        string     `json:"icon" db:"icon"`
	SceneID     *uuid.UUID `json:"scene_id,omitempty" db:"scene_id"`
	OrderIndex  int32      `json:"order_index" db:"order_index"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
}

// Character represents a character in the screenplay
type Character struct {
	ID          uuid.UUID         `json:"id" db:"character_id"`
	ProjectID   uuid.UUID         `json:"project_id" db:"project_id"`
	Name        string            `json:"name" db:"name"`
	Description string            `json:"description" db:"description"`
	Role        string            `json:"role" db:"role"`             // "protagonist", "antagonist", "supporting", etc.
	Attributes  map[string]string `json:"attributes" db:"attributes"` // JSON field
	CreatedAt   time.Time         `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at" db:"updated_at"`
}

// Location represents a location in the screenplay
type Location struct {
	ID          uuid.UUID `json:"id" db:"location_id"`
	ProjectID   uuid.UUID `json:"project_id" db:"project_id"`
	Name        string    `json:"name" db:"name"`
	Description string    `json:"description" db:"description"`
	Type        string    `json:"type" db:"location_type"` // "interior", "exterior"
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

// Domain errors
var (
	ErrProjectNotFound    = NewDomainError("project not found", "PROJECT_NOT_FOUND")
	ErrProjectExists      = NewDomainError("project already exists", "PROJECT_EXISTS")
	ErrUnauthorizedAccess = NewDomainError("unauthorized access to project", "UNAUTHORIZED_ACCESS")
	ErrInvalidProjectData = NewDomainError("invalid project data", "INVALID_PROJECT_DATA")

	ErrScriptElementNotFound = NewDomainError("script element not found", "SCRIPT_ELEMENT_NOT_FOUND")
	ErrSceneNotFound         = NewDomainError("scene not found", "SCENE_NOT_FOUND")
	ErrCharacterNotFound     = NewDomainError("character not found", "CHARACTER_NOT_FOUND")
	ErrLocationNotFound      = NewDomainError("location not found", "LOCATION_NOT_FOUND")
	ErrOutlineUnitNotFound   = NewDomainError("outline unit not found", "OUTLINE_UNIT_NOT_FOUND")
)

// DomainError represents a domain-specific error
type DomainError struct {
	Message string `json:"message"`
	Code    string `json:"code"`
}

func (e *DomainError) Error() string {
	return e.Message
}

// NewDomainError creates a new domain error
func NewDomainError(message, code string) *DomainError {
	return &DomainError{
		Message: message,
		Code:    code,
	}
}
