package repository

import "github.com/l1roii/screenwriter/server/internal/entity"

// ProjectRepository defines the interface for project data operations.
type ProjectRepository interface {
	// Read operations
	ListByUserID(userID string) ([]*entity.Project, error)
	GetByID(projectID string) (*entity.Project, error)
	GetFullProjectByID(projectID string) (*entity.FullProject, error) // <-- NEW

	// Write operations
	Create(project *entity.Project) error
	Update(project *entity.Project) (*entity.Project, error)
	Delete(projectID string, userID string) error
	UpdateIsStarred(projectID string, userID string, isStarred bool) (*entity.Project, error)
}

// UserRepository interface (no changes needed here).
type UserRepository interface {
	Create(user *entity.User) error
	GetByEmail(email string) (*entity.User, error)
	GetByUsernameAndTag(username, tag string) (*entity.User, error) // <-- NEW
}

// NEW INTERFACE: For managing collaborators
type CollaboratorRepository interface {
	Add(projectID, userID string) error
}
