package repository

import "github.com/l1roii/screenwriter/server/internal/entity"

// ProjectRepository defines the interface for project data operations.
// Using an interface allows for easier testing (mocking) and dependency injection.
type ProjectRepository interface {
	ListByUserID(userID int64) ([]*entity.Project, error)
	GetByName(userID int64, name string) (*entity.Project, error)
}

type UserRepository interface {
	Create(user *entity.User) error
	GetByEmail(email string) (*entity.User, error)
}
