package repository

import "database/sql"

type postgresCollaboratorRepository struct {
	db *sql.DB
}

func NewCollaboratorRepository(db *sql.DB) CollaboratorRepository {
	return &postgresCollaboratorRepository{db: db}
}

func (r *postgresCollaboratorRepository) Add(projectID, userID string) error {
	query := `INSERT INTO project_collaborators (project_id, user_id) VALUES ($1, $2)`
	_, err := r.db.Exec(query, projectID, userID)
	return err
}
