package entity

import "time"

// Project represents the structure of a project in the database.
// This struct now matches the updated 'Projects' table schema.
type Project struct {
	ID          string    `json:"id"`
	UserID      string    `json:"userId"`
	ProjectName string    `json:"projectName"`
	Description string    `json:"description"`
	IsStarred   bool      `json:"isStarred"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}
