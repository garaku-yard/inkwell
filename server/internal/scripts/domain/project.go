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
	OrgID       *uuid.UUID `json:"org_id,omitempty" db:"org_id"` // owning org; nil = personal project
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

type ElementPatch struct{ Content, Type *string }

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

type ScenePatch struct {
	OutlineUnitID         **uuid.UUID
	SceneHeading, Content *string
	OrderIndex            *int32
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

type OutlineUnitPatch struct {
	Title, Description, Color, Icon *string
	Tags                            *[]string
	OrderIndex                      *int32
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

type CharacterPatch struct {
	Name, Description, Role *string
	Attributes              *map[string]string
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

	// ErrMissingActor means a protected operation was called with no actor
	// identity (empty/nil user_id). Distinct from ErrUnauthorizedAccess (a real actor who was
	// checked and denied): this is "the request itself is malformed" —
	// missing identity is never proof of authorization (0029) — so the
	// handler maps it to InvalidArgument, not PermissionDenied. Orbit #360.
	ErrMissingActor = errors.New("actor identity is required")
)

// CallerRole is the access level the gateway resolved for the caller and is
// asserting for this call (mirrors scripts.CallerRole in the proto, and
// handlers.ProjectRole in the gateway — kept as its own type here because
// scripts must not depend on gateway internals, per 0029). It is never
// authoritative for ownership on its own: verifyProjectAccess always
// re-checks projects.owner_id independently before trusting anything else,
// so a misapplied or stale CallerRoleOwner cannot grant owner-level access —
// see that function's doc comment. For every other value, scripts has no
// independent way to verify org or collaborator membership (nor is it meant
// to; that stays the gateway's job), but it still enforces that the asserted
// role is sufficient for the concrete RPC: viewer for reads and editor for
// content mutations. CallerRoleUnspecified is never sufficient.
type CallerRole int

const (
	CallerRoleUnspecified CallerRole = iota
	CallerRoleViewer
	CallerRoleEditor
	CallerRoleOrgAdmin
	CallerRoleOwner
)

// Allows reports whether the gateway-asserted role satisfies the minimum role
// required by a scripts operation. The enum is intentionally ordered from
// least to most privilege; unspecified values and future out-of-range values
// fail closed.
func (r CallerRole) Allows(required CallerRole) bool {
	return r >= CallerRoleViewer && r <= CallerRoleOwner &&
		required >= CallerRoleViewer && required <= CallerRoleOwner &&
		r >= required
}
