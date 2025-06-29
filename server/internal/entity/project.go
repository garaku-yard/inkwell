package entity

import "time"

// Project represents the structure of a project in the database.
// This struct now matches the updated 'Projects' table schema.
type Project struct {
	ID                string    `json:"id"`
	UserID            string    `json:"userId"`
	ProjectName       string    `json:"projectName"`
	Description       string    `json:"description"`
	IsStarred         bool      `json:"isStarred"`
	CollaboratorCount int       `json:"collaboratorCount"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

// FullProject extends the basic project with its hierarchical content.
type FullProject struct {
	Project        // Embed the basic Project struct
	Acts    []*Act `json:"acts"`
}

// Act represents a single act within a project.
type Act struct {
	ID        string   `json:"id"`
	ProjectID string   `json:"projectId"`
	ActNumber int      `json:"actNumber"`
	Title     *string  `json:"title"` // Use pointer for nullable string
	Scenes    []*Scene `json:"scenes"`
}

// Scene represents a single scene within an act.
type Scene struct {
	ID          string           `json:"id"`
	ActID       string           `json:"actId"`
	SceneNumber int              `json:"sceneNumber"`
	Setting     string           `json:"setting"`
	Elements    []*ScriptElement `json:"elements"`
}

// ScriptElement represents a single block of content within a scene.
type ScriptElement struct {
	ID           string  `json:"id"`
	SceneID      string  `json:"sceneId"`
	ElementOrder int     `json:"elementOrder"`
	ElementType  string  `json:"elementType"`
	Content      string  `json:"content"`
	CharacterID  *string `json:"characterId"` // Use pointer for nullable string
}
