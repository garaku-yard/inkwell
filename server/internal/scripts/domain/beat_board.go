package domain

import (
	"time"

	"github.com/google/uuid"
)

// ResourceKind identifies a project sub-resource (beat, lane, connection,
// outline item, element, or scene) for project-ownership resolution. The
// gateway uses it via ScriptsService.GetResourceProject to learn which
// project owns a resource before authorizing a mutation against it.
type ResourceKind int

const (
	ResourceKindUnspecified ResourceKind = iota
	ResourceKindBeat
	ResourceKindConnection
	ResourceKindLane
	ResourceKindOutlineItem
	ResourceKindElement
	ResourceKindDrawing
	ResourceKindScene
)

// Beat represents a story beat in the beat board
type Beat struct {
	ID           uuid.UUID  `json:"id" db:"beat_id"`
	ProjectID    uuid.UUID  `json:"projectId" db:"project_id"`
	Title        string     `json:"title" db:"title"`
	Description  string     `json:"description" db:"description"`
	SceneNumbers string     `json:"sceneNumbers" db:"scene_numbers"` // DEPRECATED: Use StartPage and EndPage
	Color        string     `json:"color" db:"color"`
	PositionX    int32      `json:"position_x" db:"position_x"`
	PositionY    int32      `json:"position_y" db:"position_y"`
	Width        int32      `json:"width" db:"width"`
	Height       int32      `json:"height" db:"height"`
	ActNumber    int32      `json:"act" db:"act_number"`
	Order        int32      `json:"order" db:"beat_order"`
	StartPage    int32      `json:"startPage" db:"start_page"`
	EndPage      int32      `json:"endPage" db:"end_page"`
	ImageURL     *string    `json:"imageUrl,omitempty" db:"image_url"`
	CreatedAt    time.Time  `json:"createdAt" db:"created_at"`
	UpdatedAt    time.Time  `json:"updatedAt" db:"updated_at"`
	DeletedAt    *time.Time `json:"deletedAt,omitempty" db:"deleted_at"`
}

// Connection represents a connection between two beats
type Connection struct {
	ID        uuid.UUID  `json:"id" db:"connection_id"`
	ProjectID uuid.UUID  `json:"projectId" db:"project_id"`
	FromID    uuid.UUID  `json:"fromId" db:"from_beat_id"`
	ToID      uuid.UUID  `json:"toId" db:"to_beat_id"`
	FromSide  string     `json:"fromSide" db:"from_side"`
	ToSide    string     `json:"toSide" db:"to_side"`
	CreatedAt time.Time  `json:"createdAt" db:"created_at"`
	UpdatedAt time.Time  `json:"updatedAt" db:"updated_at"`
	DeletedAt *time.Time `json:"deletedAt,omitempty" db:"deleted_at"`
}

// Lane represents a timeline lane for organizing beats
type Lane struct {
	ID        uuid.UUID  `json:"id" db:"lane_id"`
	ProjectID uuid.UUID  `json:"projectId" db:"project_id"`
	Name      string     `json:"name" db:"name"`
	Color     string     `json:"color" db:"color"`
	Order     int32      `json:"order" db:"lane_order"`
	CreatedAt time.Time  `json:"createdAt" db:"created_at"`
	UpdatedAt time.Time  `json:"updatedAt" db:"updated_at"`
	DeletedAt *time.Time `json:"deletedAt,omitempty" db:"deleted_at"`
}

// OutlineItem represents a beat placed on a timeline lane
type OutlineItem struct {
	ID               uuid.UUID  `json:"id" db:"outline_item_id"`
	ProjectID        uuid.UUID  `json:"projectId" db:"project_id"`
	BeatID           uuid.UUID  `json:"beatId" db:"beat_id"`
	LaneID           uuid.UUID  `json:"laneId" db:"lane_id"`
	Order            int32      `json:"order" db:"item_order"`
	TimelinePosition float64    `json:"timelinePosition" db:"timeline_position"`
	Width            float64    `json:"width" db:"width"`
	CreatedAt        time.Time  `json:"createdAt" db:"created_at"`
	UpdatedAt        time.Time  `json:"updatedAt" db:"updated_at"`
	DeletedAt        *time.Time `json:"deletedAt,omitempty" db:"deleted_at"`
}

// SyncChanges bundles per-project rows for a bidirectional sync round-trip in
// both directions. Each row carries its own DeletedAt (a tombstone when set).
// Project is the project row itself — optional on push, set by the server on a
// full pull.
type SyncChanges struct {
	Project      *Project
	Scenes       []*Scene
	Elements     []*ProjectElement
	Characters   []*Character
	Locations    []*Location
	Beats        []*Beat
	Connections  []*Connection
	Lanes        []*Lane
	OutlineItems []*OutlineItem
	Drawings     []*Drawing
}

// Drawing is one shape on the beat-board drawing layer. Per-shape rather than a
// blob per board so sync has a real unit to push and conflict on — see
// decisions/0022-drawing-per-shape-rows.md.
type Drawing struct {
	ID        uuid.UUID `json:"id" db:"drawing_id"`
	ProjectID uuid.UUID `json:"projectId" db:"project_id"`
	// pen | line | arrow | rect | ellipse — free-form, so a new kind needs no
	// migration on either database.
	Kind string `json:"kind" db:"kind"`
	// Opaque JSON (geometry + style). The server stores and returns it; nothing
	// here parses it, so it stays a string.
	Data      string     `json:"data" db:"data"`
	Order     int32      `json:"order" db:"drawing_order"`
	CreatedAt time.Time  `json:"createdAt" db:"created_at"`
	UpdatedAt time.Time  `json:"updatedAt" db:"updated_at"`
	DeletedAt *time.Time `json:"deletedAt,omitempty" db:"deleted_at"`
}

// DrawingPatch is a partial update to a shape. Fields are pointers so "absent"
// and "set to the zero value" are distinguishable.
//
// The other beat-board updates use the zero value itself as the absent sentinel
// (`if updates.Order != 0 { ... }`), which quietly makes 0 unsettable. For a
// drawing that's a real defect and not a hypothetical one: `order` is a z-index
// whose default *is* 0, so "send this shape to the back" would silently no-op.
type DrawingPatch struct {
	Kind  *string
	Data  *string
	Order *int32
}

// BeatBoardData represents all beat board data for a project
type BeatBoardData struct {
	Beats        []*Beat        `json:"beats"`
	Connections  []*Connection  `json:"connections"`
	Lanes        []*Lane        `json:"lanes"`
	OutlineItems []*OutlineItem `json:"outlineItems"`
	Drawings     []*Drawing     `json:"drawings"`
}
