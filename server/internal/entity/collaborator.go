package entity

import "time"

type CollaboratorRole string

const (
	Reviewer CollaboratorRole = "REVIEWER"
	Editor   CollaboratorRole = "EDITOR"
	Writer   CollaboratorRole = "WRITER"
)

type ProjectCollaborator struct {
	ID              string           `json:"id"`
	UserID          string           `json:"userId"`
	Name            string           `json:"name"`
	Email           string           `json:"email"`
	UsernameWithTag string           `json:"usernameWithTag"`
	Avatar          *string          `json:"avatar,omitempty"`
	Role            CollaboratorRole `json:"role"`
	Status          bool             `json:"status"` // false (pending) or true (accepted)
	JoinedAt        string           `json:"joinedAt"`
}

// Invitation represents a pending invite from the perspective of the invited user.
type Invitation struct {
	ProjectID   string    `json:"projectId"`
	ProjectName string    `json:"projectName"`
	InvitedBy   string    `json:"invitedBy"` // Name of the project owner
	InvitedAt   time.Time `json:"createdAt"`
}
