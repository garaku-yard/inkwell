package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// Project represents a writing project
type Project struct {
	ID          uuid.UUID  `json:"id" db:"project_id"`
	Title       string     `json:"title" db:"title"`
	Description string     `json:"description" db:"description"`
	OwnerID     uuid.UUID  `json:"owner_id" db:"owner_id"`
	Category    string     `json:"category" db:"category"` // "screenplay", "novel", "comic_script", "poetry", "interactive_fiction", "tabletop_rpg", "memoir", "lyrics"
	Status      string     `json:"status" db:"status"`     // "draft", "active", "completed", "archived"
	IsStarred   bool       `json:"is_starred" db:"is_starred"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

// ProjectElement represents an individual line/element in a screenplay
type ProjectElement struct {
	ID         uuid.UUID         `json:"id" db:"element_id"`
	ProjectID  uuid.UUID         `json:"project_id" db:"project_id"`
	SceneID    *uuid.UUID        `json:"scene_id,omitempty" db:"scene_id"`
	Type       string            `json:"type" db:"element_type"` // format-specific element type, interpreted per editor
	Content    string            `json:"content" db:"content"`
	LineNumber int32             `json:"line_number" db:"line_number"`
	Formatting map[string]string `json:"formatting" db:"formatting"` // JSON field for formatting attributes
	CreatedAt  time.Time         `json:"created_at" db:"created_at"`
	UpdatedAt  time.Time         `json:"updated_at" db:"updated_at"`
	DeletedAt  *time.Time        `json:"deleted_at,omitempty" db:"deleted_at"`
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
	DeletedAt     *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
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
	DeletedAt   *time.Time        `json:"deleted_at,omitempty" db:"deleted_at"`
}

// Location represents a location in the screenplay
type Location struct {
	ID          uuid.UUID  `json:"id" db:"location_id"`
	ProjectID   uuid.UUID  `json:"project_id" db:"project_id"`
	Name        string     `json:"name" db:"name"`
	Description string     `json:"description" db:"description"`
	Type        string     `json:"type" db:"location_type"` // "interior", "exterior"
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

// Domain errors. Use errors.Is(err, domain.ErrXXX) at call sites — the
// handler maps each sentinel to the matching gRPC status code so client
// callers receive meaningful error types rather than codes.Internal.
var (
	ErrProjectNotFound    = errors.New("project not found")
	ErrProjectExists      = errors.New("project already exists")
	ErrUnauthorizedAccess = errors.New("unauthorized access to project")
	ErrInvalidProjectData = errors.New("invalid project data")

	ErrProjectElementNotFound = errors.New("script element not found")
	ErrSceneNotFound          = errors.New("scene not found")
	ErrCharacterNotFound      = errors.New("character not found")
	ErrLocationNotFound       = errors.New("location not found")
	ErrOutlineUnitNotFound    = errors.New("outline unit not found")
)
