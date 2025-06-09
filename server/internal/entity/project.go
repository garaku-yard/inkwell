package entity

import "time"

// Project represents the structure of a project in the database.
// The json tags are used by encoding/json to serialize the struct into JSON.
type Project struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"userId"`
	ProjectName string    `json:"projectName"`
	Logline     string    `json:"logline"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}
