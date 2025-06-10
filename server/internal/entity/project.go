package entity

import "time"

type Project struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"userid"`
	ProjectName string    `json:"projectName"`
	Logline     string    `json:"logline"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}
