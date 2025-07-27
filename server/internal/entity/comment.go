package entity

import "time"

type Comment struct {
	ID         string    `json:"id"`
	ElementID  *string   `json:"elementId"`
	SceneID    *string   `json:"sceneId"`
	UserID     string    `json:"-"`
	UserName   string    `json:"userName"`
	Content    string    `json:"content"`
	IsResolved bool      `json:"isResolved"`
	Timestamp  time.Time `json:"timestamp"`
}
