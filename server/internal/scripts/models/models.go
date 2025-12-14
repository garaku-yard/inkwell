package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Project represents a screenplay project
type Project struct {
	ProjectID   uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"projectId"`
	Title       string         `gorm:"type:varchar(255);not null" json:"title"`
	Description string         `gorm:"type:text" json:"description"`
	OwnerID     uuid.UUID      `gorm:"type:uuid;not null;index" json:"ownerId"`
	Status      string         `gorm:"type:varchar(50);not null;default:'draft';index" json:"status"`
	IsStarred   bool           `gorm:"not null;default:false" json:"isStarred"`
	CreatedAt   time.Time      `gorm:"not null;default:now()" json:"createdAt"`
	UpdatedAt   time.Time      `gorm:"not null;default:now()" json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"deletedAt,omitempty"`

	// Relationships
	ScriptElements []ScriptElement `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE" json:"scriptElements,omitempty"`
	Scenes         []Scene         `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE" json:"scenes,omitempty"`
	Characters     []Character     `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE" json:"characters,omitempty"`
	Locations      []Location      `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE" json:"locations,omitempty"`
	OutlineUnits   []OutlineUnit   `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE" json:"outlineUnits,omitempty"`
	Beats          []Beat          `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE" json:"beats,omitempty"`
	Lanes          []Lane          `gorm:"foreignKey:ProjectID;constraint:OnDelete:CASCADE" json:"lanes,omitempty"`
}

// TableName overrides the table name
func (Project) TableName() string {
	return "projects"
}

// ScriptElement represents a screenplay element (action, dialogue, etc.)
type ScriptElement struct {
	ElementID   uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"elementId"`
	ProjectID   uuid.UUID  `gorm:"type:uuid;not null;index:idx_script_elements_project_id" json:"projectId"`
	SceneID     *uuid.UUID `gorm:"type:uuid" json:"sceneId,omitempty"`
	ElementType string     `gorm:"type:varchar(50);not null" json:"elementType"`
	Content     string     `gorm:"type:text;not null" json:"content"`
	CharacterID *uuid.UUID `gorm:"type:uuid" json:"characterId,omitempty"`
	LineNumber  int        `gorm:"not null;default:0;index:idx_script_elements_line_number,composite:project_line" json:"lineNumber"`
	Formatting  string     `gorm:"type:jsonb;default:'{}'" json:"formatting,omitempty"`
	CreatedAt   time.Time  `gorm:"not null;default:now()" json:"createdAt"`
	UpdatedAt   time.Time  `gorm:"not null;default:now()" json:"updatedAt"`
}

func (ScriptElement) TableName() string {
	return "script_elements"
}

// Scene represents a scene in the screenplay
type Scene struct {
	SceneID       uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"sceneId"`
	ProjectID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"projectId"`
	OutlineUnitID *uuid.UUID `gorm:"type:uuid" json:"outlineUnitId,omitempty"`
	SceneHeading  string     `gorm:"type:varchar(255);not null" json:"sceneHeading"`
	Content       string     `gorm:"type:text" json:"content"`
	OrderIndex    int        `gorm:"not null;default:0" json:"orderIndex"`
	CreatedAt     time.Time  `gorm:"not null;default:now()" json:"createdAt"`
	UpdatedAt     time.Time  `gorm:"not null;default:now()" json:"updatedAt"`
}

func (Scene) TableName() string {
	return "scenes"
}

// Character represents a character in the screenplay
type Character struct {
	CharacterID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"characterId"`
	ProjectID   uuid.UUID `gorm:"type:uuid;not null;index" json:"projectId"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	Description string    `gorm:"type:text" json:"description"`
	Role        string    `gorm:"type:varchar(100)" json:"role"`
	Attributes  string    `gorm:"type:jsonb;default:'{}'" json:"attributes,omitempty"`
	CreatedAt   time.Time `gorm:"not null;default:now()" json:"createdAt"`
	UpdatedAt   time.Time `gorm:"not null;default:now()" json:"updatedAt"`
}

func (Character) TableName() string {
	return "characters"
}

// Location represents a location in the screenplay
type Location struct {
	LocationID   uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"locationId"`
	ProjectID    uuid.UUID `gorm:"type:uuid;not null;index" json:"projectId"`
	Name         string    `gorm:"type:varchar(255);not null" json:"name"`
	Description  string    `gorm:"type:text" json:"description"`
	LocationType string    `gorm:"type:varchar(50)" json:"locationType"`
	CreatedAt    time.Time `gorm:"not null;default:now()" json:"createdAt"`
	UpdatedAt    time.Time `gorm:"not null;default:now()" json:"updatedAt"`
}

func (Location) TableName() string {
	return "locations"
}

// OutlineUnit represents an outline structure (act, sequence, etc.)
type OutlineUnit struct {
	OutlineUnitID uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"outlineUnitId"`
	ProjectID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"projectId"`
	ParentID      *uuid.UUID `gorm:"type:uuid;index" json:"parentId,omitempty"`
	UnitType      string     `gorm:"type:varchar(50);not null" json:"unitType"`
	Title         string     `gorm:"type:varchar(255);not null" json:"title"`
	Description   string     `gorm:"type:text" json:"description"`
	Color         string     `gorm:"type:varchar(50)" json:"color"`
	Tags          string     `gorm:"type:jsonb;default:'[]'" json:"tags,omitempty"`
	Icon          string     `gorm:"type:varchar(100)" json:"icon"`
	SceneID       *uuid.UUID `gorm:"type:uuid" json:"sceneId,omitempty"`
	OrderIndex    int        `gorm:"not null;default:0" json:"orderIndex"`
	CreatedAt     time.Time  `gorm:"not null;default:now()" json:"createdAt"`
	UpdatedAt     time.Time  `gorm:"not null;default:now()" json:"updatedAt"`
}

func (OutlineUnit) TableName() string {
	return "outline_units"
}

// Beat represents a beat in the beat board
type Beat struct {
	BeatID       uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"beatId"`
	ProjectID    uuid.UUID `gorm:"type:uuid;not null;index:idx_beats_project_id" json:"projectId"`
	Title        string    `gorm:"type:varchar(255);not null" json:"title"`
	Description  string    `gorm:"type:text" json:"description"`
	SceneNumbers string    `gorm:"type:varchar(255)" json:"sceneNumbers"`
	StartPage    *int      `gorm:"type:integer" json:"startPage,omitempty"`
	EndPage      *int      `gorm:"type:integer" json:"endPage,omitempty"`
	Color        string    `gorm:"type:varchar(50)" json:"color"`
	PositionX    int       `gorm:"not null;default:0" json:"positionX"`
	PositionY    int       `gorm:"not null;default:0" json:"positionY"`
	Width        int       `gorm:"not null;default:200" json:"width"`
	Height       int       `gorm:"not null;default:100" json:"height"`
	ImageURL     string    `gorm:"type:text" json:"imageUrl,omitempty"`
	ActNumber    *int      `gorm:"type:integer" json:"actNumber,omitempty"`
	BeatOrder    int       `gorm:"not null;default:0;index:idx_beats_order,composite:project_order" json:"beatOrder"`
	CreatedAt    time.Time `gorm:"not null;default:now()" json:"createdAt"`
	UpdatedAt    time.Time `gorm:"not null;default:now()" json:"updatedAt"`

	// Relationships
	OutlineItems    []OutlineItem    `gorm:"foreignKey:BeatID;constraint:OnDelete:CASCADE" json:"outlineItems,omitempty"`
	ConnectionsFrom []BeatConnection `gorm:"foreignKey:FromBeatID;constraint:OnDelete:CASCADE" json:"connectionsFrom,omitempty"`
	ConnectionsTo   []BeatConnection `gorm:"foreignKey:ToBeatID;constraint:OnDelete:CASCADE" json:"connectionsTo,omitempty"`
}

func (Beat) TableName() string {
	return "beats"
}

// BeatConnection represents a connection between beats
type BeatConnection struct {
	ConnectionID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"connectionId"`
	ProjectID    uuid.UUID `gorm:"type:uuid;not null;index" json:"projectId"`
	FromBeatID   uuid.UUID `gorm:"type:uuid;not null;index" json:"fromBeatId"`
	ToBeatID     uuid.UUID `gorm:"type:uuid;not null;index" json:"toBeatId"`
	FromSide     string    `gorm:"type:varchar(20);not null" json:"fromSide"`
	ToSide       string    `gorm:"type:varchar(20);not null" json:"toSide"`
	CreatedAt    time.Time `gorm:"not null;default:now()" json:"createdAt"`
}

func (BeatConnection) TableName() string {
	return "beat_connections"
}

// Lane represents a timeline lane
type Lane struct {
	LaneID    uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"laneId"`
	ProjectID uuid.UUID `gorm:"type:uuid;not null;index:idx_lanes_project_id" json:"projectId"`
	Name      string    `gorm:"type:varchar(255);not null" json:"name"`
	Color     string    `gorm:"type:varchar(50)" json:"color"`
	LaneOrder int       `gorm:"not null;default:0;index:idx_lanes_order,composite:project_order" json:"laneOrder"`
	CreatedAt time.Time `gorm:"not null;default:now()" json:"createdAt"`
	UpdatedAt time.Time `gorm:"not null;default:now()" json:"updatedAt"`

	// Relationships
	OutlineItems []OutlineItem `gorm:"foreignKey:LaneID;constraint:OnDelete:CASCADE" json:"outlineItems,omitempty"`
}

func (Lane) TableName() string {
	return "lanes"
}

// OutlineItem represents a beat placed on a timeline lane
type OutlineItem struct {
	OutlineItemID    uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"outlineItemId"`
	ProjectID        uuid.UUID `gorm:"type:uuid;not null;index:idx_outline_items_project_id" json:"projectId"`
	BeatID           uuid.UUID `gorm:"type:uuid;not null;index:idx_outline_items_beat_id" json:"beatId"`
	LaneID           uuid.UUID `gorm:"type:uuid;not null;index:idx_outline_items_lane_id" json:"laneId"`
	ItemOrder        int       `gorm:"not null;default:0" json:"itemOrder"`
	TimelinePosition float64   `gorm:"type:double precision;not null;default:0" json:"timelinePosition"`
	Width            float64   `gorm:"type:double precision;not null;default:100" json:"width"`
	CreatedAt        time.Time `gorm:"not null;default:now()" json:"createdAt"`
	UpdatedAt        time.Time `gorm:"not null;default:now()" json:"updatedAt"`
}

func (OutlineItem) TableName() string {
	return "outline_items"
}
