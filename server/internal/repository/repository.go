package repository

import "github.com/l1roii/screenwriter/server/internal/entity"

type ProjectRepository interface {
	ListByUserID(userID string) ([]*entity.Project, error)
	GetByID(projectID string) (*entity.Project, error)
	GetFullProjectByID(projectID string) (*entity.FullProject, error)

	Create(project *entity.Project) error
	Update(project *entity.Project) (*entity.Project, error)
	Delete(projectID string, userID string) error
	UpdateIsStarred(projectID string, userID string, isStarred bool) (*entity.Project, error)
}

type UserRepository interface {
	Create(user *entity.User) error
	GetByEmail(email string) (*entity.User, error)
	GetByUsernameAndTag(username, tag string) (*entity.User, error)
}

type CollaboratorRepository interface {
	Add(projectID, userID string) error
}
