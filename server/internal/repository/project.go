package repository

import (
	"database/sql"
	// This import path MUST match the module path in your go.mod file.
	"github.com/l1roii/screenwriter/server/internal/entity"
)

// postgresProjectRepository is the concrete implementation for PostgreSQL.
type postgresProjectRepository struct {
	db *sql.DB
}

// NewProjectRepository creates a new instance of the project repository.
func NewProjectRepository(db *sql.DB) ProjectRepository {
	return &postgresProjectRepository{db: db}
}

// ListByUserID retrieves all projects owned by a specific user.
func (r *postgresProjectRepository) ListByUserID(userID int64) ([]*entity.Project, error) {
	query := `
        SELECT projectid, userid, projectname, description, createdat, updatedat
        FROM projects
        WHERE userid = $1
        ORDER BY updatedat DESC`

	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []*entity.Project
	for rows.Next() {
		var p entity.Project
		// Note: The order of fields in Scan must match the order in the SELECT statement.
		if err := rows.Scan(&p.ID, &p.UserID, &p.ProjectName, &p.Logline, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, &p)
	}

	// rows.Err() checks for any errors that occurred during iteration.
	if err = rows.Err(); err != nil {
		return nil, err
	}

	return projects, nil
}

// GetByName retrieves a single project by its name for a specific user.
// Searching by name requires the userID to ensure you get the correct project,
// as different users might have projects with the same name.
func (r *postgresProjectRepository) GetByName(userID int64, name string) (*entity.Project, error) {
	query := `
        SELECT projectid, userid, projectname, description, createdat, updatedat
        FROM projects
        WHERE userid = $1 AND projectname = $2`

	var p entity.Project
	err := r.db.QueryRow(query, userID, name).Scan(&p.ID, &p.UserID, &p.ProjectName, &p.Logline, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Not found
		}
		return nil, err
	}
	return &p, nil
}
