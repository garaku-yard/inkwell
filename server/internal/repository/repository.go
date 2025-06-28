package repository

import "github.com/l1roii/screenwriter/server/internal/entity"

type ProjectRepository interface {
	// Read operations
	ListByUserID(userID int64) ([]*entity.Project, error)
	GetByID(projectID int64) (*entity.Project, error)
	GetByName(userID int64, name string) (*entity.Project, error)

	// Write operations
	Create(project *entity.Project) error
	Update(project *entity.Project) (*entity.Project, error)
	Delete(projectID int64, userID int64) error
	UpdateIsStarred(projectID int64, userID int64, isStarred bool) (*entity.Project, error)
}

type UserRepository interface {
	Create(user *entity.User) error
	GetByEmail(email string) (*entity.User, error)
}
