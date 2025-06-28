package entity

import "time"

// Project represents the structure of a project in the database.
// This struct now matches the updated 'Projects' table schema.
type Project struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"userId"` // Consistent camelCase for JSON
	ProjectName string    `json:"projectName"`
	Description string    `json:"description"` // UPDATED: from Logline
	IsStarred   bool      `json:"isStarred"`   // NEW: Added for starring projects
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}
