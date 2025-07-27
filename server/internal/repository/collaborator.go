package repository

import (
	"database/sql"
	"github.com/l1roii/screenwriter/server/internal/entity"
	"time"
)

type postgresCollaboratorRepository struct {
	db *sql.DB
}


func NewCollaboratorRepository(db *sql.DB) CollaboratorRepository {
	return &postgresCollaboratorRepository{db: db}
}

func (r *postgresCollaboratorRepository) Add(projectID string, userID string, role entity.CollaboratorRole) error {
	query := `INSERT INTO project_collaborators (project_id, user_id, role) VALUES ($1, $2, $3)`
	_, err := r.db.Exec(query, projectID, userID, role)
	return err
}

func (r *postgresCollaboratorRepository) Remove(projectID string, userID string) error {
	query := `DELETE FROM project_collaborators WHERE project_id = $1 AND user_id = $2`
	_, err := r.db.Exec(query, projectID, userID)
	return err
}

func (r *postgresCollaboratorRepository) UpdateRole(projectID string, userID string, role entity.CollaboratorRole) error {
	query := `UPDATE project_collaborators SET role = $1 WHERE project_id = $2 AND user_id = $3`
	_, err := r.db.Exec(query, role, projectID, userID)
	return err
}

func (r *postgresCollaboratorRepository) ListByProjectID(projectID string) ([]*entity.ProjectCollaborator, error) {
	query := `
		SELECT 
			u.user_id as id,
			u.name,
			u.email,
			u.username || '#' || u.username_tag AS username_with_tag,
			NULL AS avatar, -- no avatar column, adjust if added later
			pc.role,
			'active' AS status, -- assuming default status
			u.created_at AS joined_at
		FROM project_collaborators pc
		JOIN users u ON u.user_id = pc.user_id
		WHERE pc.project_id = $1
	`

	rows, err := r.db.Query(query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var collaborators []*entity.ProjectCollaborator

	for rows.Next() {
		var c entity.ProjectCollaborator
		var avatar sql.NullString
		var joinedAt time.Time

		err := rows.Scan(
			&c.ID,               // FIXED: id column goes to ID field
			&c.Name,
			&c.Email,
			&c.UsernameWithTag,
			&avatar,
			&c.Role,
			&c.Status,
			&joinedAt,
		)
		if err != nil {
			return nil, err
		}

		if avatar.Valid {
			c.Avatar = &avatar.String
		}

		c.UserID = c.ID // optional: maintain backward compatibility
		c.JoinedAt = joinedAt.Format(time.RFC3339)
		collaborators = append(collaborators, &c)
	}

	return collaborators, nil
}
