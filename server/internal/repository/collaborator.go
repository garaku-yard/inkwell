package repository

import (
	"database/sql"
	"time"

	"github.com/l1roii/screenwriter/server/internal/entity"
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
			&c.ID, // FIXED: id column goes to ID field
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

func (r *postgresCollaboratorRepository) RespondToInvite(projectID string, userID string, accepted bool) error {
	if !accepted {
		// If the user declines, we simply delete the invitation row.
		return r.Remove(projectID, userID)
	}
	// If accepted, update the status to true, but only if it was pending (false).
	query := `UPDATE project_collaborators SET status = true, updated_at = NOW() WHERE project_id = $1 AND user_id = $2 AND status = false`
	_, err := r.db.Exec(query, projectID, userID)
	return err
}

func (r *postgresCollaboratorRepository) ListPendingInvitesForUser(userID string) ([]*entity.Invitation, error) {
	query := `
		SELECT
			p.project_id,
			p.project_name,
			owner.username || '#' || owner.username_tag AS invited_by,
			pc.created_at
		FROM project_collaborators pc
		JOIN projects p ON p.project_id = pc.project_id
		JOIN users owner ON owner.user_id = p.user_id
		WHERE pc.user_id = $1 AND pc.status = false
		ORDER BY pc.created_at DESC`

	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invitations []*entity.Invitation
	for rows.Next() {
		var i entity.Invitation
		if err := rows.Scan(&i.ProjectID, &i.ProjectName, &i.InvitedBy, &i.InvitedAt); err != nil {
			return nil, err
		}
		invitations = append(invitations, &i)
	}
	return invitations, nil
}

// CleanupExpiredInvitations deletes pending invites older than 7 days.
func (r *postgresCollaboratorRepository) CleanupExpiredInvitations() (int64, error) {
	query := `DELETE FROM project_collaborators WHERE status = false AND created_at < NOW() - INTERVAL '7 days'`
	result, err := r.db.Exec(query)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
