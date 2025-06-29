package repository

import "database/sql"

type postgresCollaboratorRepository struct {
	db *sql.DB
}

// NewCollaboratorRepository creates a new instance of the collaborator repository.
func NewCollaboratorRepository(db *sql.DB) CollaboratorRepository {
	return &postgresCollaboratorRepository{db: db}
}

// Add creates a new record in the project_collaborators table, linking a user to a project.
func (r *postgresCollaboratorRepository) Add(projectID, userID string) error {
	// The role defaults to 'Editor' in the database schema.
	query := `INSERT INTO project_collaborators (project_id, user_id) VALUES ($1, $2)`
	_, err := r.db.Exec(query, projectID, userID)
	return err
}
