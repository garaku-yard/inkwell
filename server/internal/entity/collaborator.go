package entity

type CollaboratorRole string

const (
	Reviewer CollaboratorRole = "REVIEWER"
	Editor   CollaboratorRole = "EDITOR"
	Writer   CollaboratorRole = "WRITER"
)

type ProjectCollaborator struct {
	ID              string           `json:"id"`              // same as user_id
	UserID          string           `json:"userId"`
	Name            string           `json:"name"`
	Email           string           `json:"email"`
	UsernameWithTag string           `json:"usernameWithTag"`
	Avatar          *string          `json:"avatar,omitempty"`
	Role            CollaboratorRole `json:"role"`
	Status          string           `json:"status"`          // static "active"
	JoinedAt        string           `json:"joinedAt"`        // ISO format
}
