package entity

import "time"

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

type FullProject struct {
	Project
	Acts []*Act `json:"acts"`
}

type Act struct {
	ID        string   `json:"id"`
	ProjectID string   `json:"projectId"`
	ActNumber int      `json:"actNumber"`
	Title     *string  `json:"title"`
	Scenes    []*Scene `json:"scenes"`
}

type Scene struct {
	ID          string           `json:"id"`
	ActID       string           `json:"actId"`
	SceneNumber int              `json:"sceneNumber"`
	Setting     string           `json:"setting"`
	Elements    []*ScriptElement `json:"elements"`
	Comments    []*Comment       `json:"comments"`
}

type ScriptElement struct {
	ID           string     `json:"id"`
	SceneID      string     `json:"sceneId"`
	ElementOrder int        `json:"elementOrder"`
	ElementType  string     `json:"elementType"`
	Content      string     `json:"content"`
	CharacterID  *string    `json:"characterId"`
	Comments     []*Comment `json:"comments"`
}
