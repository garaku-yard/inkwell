package repository

import (
	"database/sql"
	"time"

	"github.com/l1roii/screenwriter/server/internal/entity"
)

type postgresProjectRepository struct {
	db *sql.DB
}

func NewProjectRepository(db *sql.DB) ProjectRepository {
	return &postgresProjectRepository{db: db}
}

func (r *postgresProjectRepository) ListByUserID(userID string) ([]*entity.Project, error) {
	query := `SELECT project_id, user_id, project_name, description, is_starred, created_at, updated_at FROM projects WHERE user_id = $1 ORDER BY updated_at DESC`
	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var projects []*entity.Project
	for rows.Next() {
		var p entity.Project
		if err := rows.Scan(&p.ID, &p.UserID, &p.ProjectName, &p.Description, &p.IsStarred, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, &p)
	}
	return projects, rows.Err()
}

func (r *postgresProjectRepository) GetByID(projectID string) (*entity.Project, error) {
	query := `SELECT project_id, user_id, project_name, description, is_starred, created_at, updated_at FROM projects WHERE project_id = $1`
	var p entity.Project
	err := r.db.QueryRow(query, projectID).Scan(&p.ID, &p.UserID, &p.ProjectName, &p.Description, &p.IsStarred, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &p, err
}

func (r *postgresProjectRepository) GetByName(userID string, name string) (*entity.Project, error) {
	query := `SELECT project_id, user_id, project_name, description, is_starred, created_at, updated_at FROM projects WHERE user_id = $1 AND project_name = $2`
	var p entity.Project
	err := r.db.QueryRow(query, userID, name).Scan(&p.ID, &p.UserID, &p.ProjectName, &p.Description, &p.IsStarred, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &p, nil
}

func (r *postgresProjectRepository) Create(project *entity.Project) error {
	query := `INSERT INTO projects (user_id, project_name, description) VALUES ($1, $2, $3) RETURNING project_id, is_starred, created_at, updated_at`
	return r.db.QueryRow(query, project.UserID, project.ProjectName, project.Description).Scan(&project.ID, &project.IsStarred, &project.CreatedAt, &project.UpdatedAt)
}

func (r *postgresProjectRepository) Update(project *entity.Project) (*entity.Project, error) {
	query := `UPDATE projects SET project_name = $1, description = $2, updated_at = $3 WHERE project_id = $4 AND user_id = $5 RETURNING project_id, user_id, project_name, description, is_starred, created_at, updated_at`
	var p entity.Project
	updatedAt := time.Now()
	err := r.db.QueryRow(query, project.ProjectName, project.Description, updatedAt, project.ID, project.UserID).Scan(&p.ID, &p.UserID, &p.ProjectName, &p.Description, &p.IsStarred, &p.CreatedAt, &p.UpdatedAt)
	return &p, err
}

func (r *postgresProjectRepository) Delete(projectID string, userID string) error {
	query := `DELETE FROM projects WHERE project_id = $1 AND user_id = $2`
	_, err := r.db.Exec(query, projectID, userID)
	return err
}

func (r *postgresProjectRepository) UpdateIsStarred(projectID string, userID string, isStarred bool) (*entity.Project, error) {
	query := `UPDATE projects SET is_starred = $1, updated_at = $2 WHERE project_id = $3 AND user_id = $4 RETURNING project_id, user_id, project_name, description, is_starred, created_at, updated_at`
	var p entity.Project
	updatedAt := time.Now()
	err := r.db.QueryRow(query, isStarred, updatedAt, projectID, userID).Scan(&p.ID, &p.UserID, &p.ProjectName, &p.Description, &p.IsStarred, &p.CreatedAt, &p.UpdatedAt)
	return &p, err
}
