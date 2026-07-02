package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"inkwell/server/internal/collab/domain"

	"github.com/google/uuid"
)

type PostgresCollaborationRepository struct {
	db *sql.DB
}

func NewPostgresCollaborationRepository(db *sql.DB) CollaborationRepository {
	return &PostgresCollaborationRepository{db: db}
}

// collaboratorInsert is the shared SQL used by CreateCollaborator and
// CreateCollaboratorTx so the schema can't drift between the two paths.
const collaboratorInsert = `
	INSERT INTO collaborators (collaborator_id, project_id, user_id, role, status, invited_by, invited_at, joined_at)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`

// Collaborator operations
func (r *PostgresCollaborationRepository) CreateCollaborator(ctx context.Context, collaborator *domain.Collaborator) error {
	_, err := r.db.ExecContext(ctx, collaboratorInsert,
		collaborator.ID,
		collaborator.ProjectID,
		collaborator.UserID,
		collaborator.Role,
		collaborator.Status,
		collaborator.InvitedBy,
		collaborator.InvitedAt,
		collaborator.JoinedAt,
	)
	return err
}

// CreateCollaboratorTx inserts a collaborator inside the given transaction.
// Pairs with outbox.EnqueueTx in the service layer to keep the
// collaborator row and its `collab.added` event atomic.
func (r *PostgresCollaborationRepository) CreateCollaboratorTx(ctx context.Context, tx *sql.Tx, collaborator *domain.Collaborator) error {
	_, err := tx.ExecContext(ctx, collaboratorInsert,
		collaborator.ID,
		collaborator.ProjectID,
		collaborator.UserID,
		collaborator.Role,
		collaborator.Status,
		collaborator.InvitedBy,
		collaborator.InvitedAt,
		collaborator.JoinedAt,
	)
	return err
}

func (r *PostgresCollaborationRepository) GetCollaboratorByID(ctx context.Context, id uuid.UUID) (*domain.Collaborator, error) {
	query := `
		SELECT collaborator_id, project_id, user_id, role, status, invited_by, invited_at, joined_at
		FROM collaborators
		WHERE collaborator_id = $1`

	collaborator := &domain.Collaborator{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&collaborator.ID,
		&collaborator.ProjectID,
		&collaborator.UserID,
		&collaborator.Role,
		&collaborator.Status,
		&collaborator.InvitedBy,
		&collaborator.InvitedAt,
		&collaborator.JoinedAt,
	)

	if err == sql.ErrNoRows {
		return nil, domain.ErrCollaboratorNotFound
	}
	if err != nil {
		return nil, err
	}

	return collaborator, nil
}

func (r *PostgresCollaborationRepository) GetPendingCollaboratorByUserAndProject(ctx context.Context, userID, projectID uuid.UUID) (*domain.Collaborator, error) {
	query := `
		SELECT collaborator_id, project_id, user_id, role, status, invited_by, invited_at, joined_at
		FROM collaborators
		WHERE user_id = $1 AND project_id = $2 AND status = 'pending'`

	collaborator := &domain.Collaborator{}
	err := r.db.QueryRowContext(ctx, query, userID, projectID).Scan(
		&collaborator.ID,
		&collaborator.ProjectID,
		&collaborator.UserID,
		&collaborator.Role,
		&collaborator.Status,
		&collaborator.InvitedBy,
		&collaborator.InvitedAt,
		&collaborator.JoinedAt,
	)

	if err == sql.ErrNoRows {
		return nil, domain.ErrCollaboratorNotFound
	}
	if err != nil {
		return nil, err
	}

	return collaborator, nil
}

func (r *PostgresCollaborationRepository) GetProjectCollaborators(ctx context.Context, projectID uuid.UUID) ([]*domain.Collaborator, error) {
	query := `
		SELECT collaborator_id, project_id, user_id, role, status, invited_by, invited_at, joined_at
		FROM collaborators
		WHERE project_id = $1
		ORDER BY invited_at DESC`

	rows, err := r.db.QueryContext(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var collaborators []*domain.Collaborator
	for rows.Next() {
		collaborator := &domain.Collaborator{}
		err := rows.Scan(
			&collaborator.ID,
			&collaborator.ProjectID,
			&collaborator.UserID,
			&collaborator.Role,
			&collaborator.Status,
			&collaborator.InvitedBy,
			&collaborator.InvitedAt,
			&collaborator.JoinedAt,
		)
		if err != nil {
			return nil, err
		}
		collaborators = append(collaborators, collaborator)
	}

	return collaborators, nil
}

func (r *PostgresCollaborationRepository) GetUserInvitations(ctx context.Context, userID uuid.UUID) ([]*domain.Collaborator, error) {
	// Query invitations table for pending invites by email
	// Note: Since we don't have user's email from user ID, we'll need to enhance this
	// For now, return all pending invitations as the user might match by email
	query := `
		SELECT invitation_id, project_id, inviter_id, email, role, created_at
		FROM invitations
		WHERE accepted = false AND expires_at > NOW()
		ORDER BY created_at DESC`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var collaborators []*domain.Collaborator
	for rows.Next() {
		var invitationID uuid.UUID
		var inviterID uuid.UUID
		var email string
		var role string
		var createdAt time.Time
		var projectID uuid.UUID

		err := rows.Scan(
			&invitationID,
			&projectID,
			&inviterID,
			&email,
			&role,
			&createdAt,
		)
		if err != nil {
			return nil, err
		}

		// Convert invitation to collaborator format for compatibility
		// Note: userID is empty for invitations since user hasn't accepted yet
		collaborator := &domain.Collaborator{
			ID:        invitationID, // Use invitation ID temporarily
			ProjectID: projectID,
			UserID:    uuid.Nil, // No user ID yet - this is a pending invitation
			Role:      role,
			Status:    "pending",
			InvitedBy: inviterID,
			InvitedAt: createdAt,
			JoinedAt:  nil,
		}
		collaborators = append(collaborators, collaborator)
	}

	return collaborators, nil
}

func (r *PostgresCollaborationRepository) GetUserInvitationsByEmail(ctx context.Context, email string) ([]*domain.Collaborator, error) {
	// Query invitations table for pending invites by specific email
	// Also search for user tags that might resolve to this email (for backward compatibility)
	query := `
		SELECT invitation_id, project_id, inviter_id, email, role, created_at
		FROM invitations
		WHERE email = $1 AND accepted = false AND expires_at > NOW()
		ORDER BY created_at DESC`

	rows, err := r.db.QueryContext(ctx, query, email)
	if err != nil {
		fmt.Printf("DEBUG: Error querying invitations: %v\n", err)
		return nil, err
	}
	defer rows.Close()

	var collaborators []*domain.Collaborator
	for rows.Next() {
		var invitationID uuid.UUID
		var inviterID uuid.UUID
		var inviteEmail string
		var role string
		var createdAt time.Time
		var projectID uuid.UUID

		err := rows.Scan(
			&invitationID,
			&projectID,
			&inviterID,
			&inviteEmail,
			&role,
			&createdAt,
		)
		if err != nil {
			return nil, err
		}

		// Convert invitation to collaborator format for compatibility
		collaborator := &domain.Collaborator{
			ID:        invitationID, // Use invitation ID
			ProjectID: projectID,
			UserID:    uuid.Nil, // Empty for pending invitation
			Role:      role,
			Status:    "pending",
			InvitedBy: inviterID,
			InvitedAt: createdAt,
			JoinedAt:  nil,
		}
		collaborators = append(collaborators, collaborator)
	}

	return collaborators, nil
}

// GetUserActiveCollaborations returns all projects where the user is an active collaborator (not owner)
func (r *PostgresCollaborationRepository) GetUserActiveCollaborations(ctx context.Context, userID uuid.UUID) ([]*domain.Collaborator, error) {
	query := `
		SELECT collaborator_id, project_id, user_id, role, status, invited_by, invited_at, joined_at
		FROM collaborators
		WHERE user_id = $1 AND status = 'active' AND role != 'owner'
		ORDER BY joined_at DESC`

	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var collaborators []*domain.Collaborator
	for rows.Next() {
		c := &domain.Collaborator{}
		err := rows.Scan(
			&c.ID,
			&c.ProjectID,
			&c.UserID,
			&c.Role,
			&c.Status,
			&c.InvitedBy,
			&c.InvitedAt,
			&c.JoinedAt,
		)
		if err != nil {
			return nil, err
		}
		collaborators = append(collaborators, c)
	}

	return collaborators, nil
}

// CreateInvitation creates a new invitation in the invitations table
func (r *PostgresCollaborationRepository) CreateInvitation(ctx context.Context, invitation *domain.Invitation) error {
	query := `
		INSERT INTO invitations (invitation_id, project_id, inviter_id, email, role, token, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`

	_, err := r.db.ExecContext(ctx, query,
		invitation.ID,
		invitation.ProjectID,
		invitation.InviterID,
		invitation.Email,
		invitation.Role,
		invitation.Token,
		invitation.ExpiresAt,
		invitation.CreatedAt,
	)
	return err
}

// GetInvitationByID fetches an invitation from the invitations table by its ID
func (r *PostgresCollaborationRepository) GetInvitationByID(ctx context.Context, id uuid.UUID) (*domain.Invitation, error) {
	query := `
		SELECT invitation_id, project_id, inviter_id, email, role, token, expires_at, accepted, accepted_at, created_at
		FROM invitations
		WHERE invitation_id = $1`

	var inv domain.Invitation
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&inv.ID, &inv.ProjectID, &inv.InviterID, &inv.Email,
		&inv.Role, &inv.Token, &inv.ExpiresAt, &inv.Accepted, &inv.AcceptedAt, &inv.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

// GetPendingInvitationByEmailAndProject returns a non-accepted invitation for the given email+project pair, if one exists.
func (r *PostgresCollaborationRepository) GetPendingInvitationByEmailAndProject(ctx context.Context, email string, projectID uuid.UUID) (*domain.Invitation, error) {
	query := `
		SELECT invitation_id, project_id, inviter_id, email, role, token, expires_at, accepted, accepted_at, created_at
		FROM invitations
		WHERE email = $1 AND project_id = $2 AND accepted = false`

	var inv domain.Invitation
	err := r.db.QueryRowContext(ctx, query, email, projectID).Scan(
		&inv.ID, &inv.ProjectID, &inv.InviterID, &inv.Email,
		&inv.Role, &inv.Token, &inv.ExpiresAt, &inv.Accepted, &inv.AcceptedAt, &inv.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, domain.ErrInvitationNotFound
	}
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

// CountPendingProjectInvitations returns the number of outstanding invitations for
// a project — those neither accepted nor expired. These occupy a collaborator seat
// the moment they are issued, so the per-project quota counts them alongside active
// collaborators.
func (r *PostgresCollaborationRepository) CountPendingProjectInvitations(ctx context.Context, projectID uuid.UUID) (int, error) {
	query := `
		SELECT COUNT(*)
		FROM invitations
		WHERE project_id = $1 AND accepted = false AND expires_at > NOW()`

	var count int
	if err := r.db.QueryRowContext(ctx, query, projectID).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

// AcceptInvitationByID marks the invitation as accepted and creates a collaborator record
func (r *PostgresCollaborationRepository) AcceptInvitationByID(ctx context.Context, invitationID uuid.UUID, userID uuid.UUID) (*domain.Collaborator, error) {
	inv, err := r.GetInvitationByID(ctx, invitationID)
	if err != nil {
		return nil, fmt.Errorf("invitation not found: %w", err)
	}

	now := time.Now()

	// Insert into collaborators table
	collaboratorID := uuid.New()
	insertQuery := `
		INSERT INTO collaborators (collaborator_id, project_id, user_id, role, status, invited_by, invited_at, joined_at)
		VALUES ($1, $2, $3, $4, 'active', $5, $6, $7)`
	_, err = r.db.ExecContext(ctx, insertQuery,
		collaboratorID, inv.ProjectID, userID, inv.Role, inv.InviterID, inv.CreatedAt, now,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create collaborator: %w", err)
	}

	// Mark invitation as accepted
	updateQuery := `UPDATE invitations SET accepted = true, accepted_at = $1 WHERE invitation_id = $2`
	_, err = r.db.ExecContext(ctx, updateQuery, now, invitationID)
	if err != nil {
		return nil, fmt.Errorf("failed to mark invitation accepted: %w", err)
	}

	return &domain.Collaborator{
		ID:        collaboratorID,
		ProjectID: inv.ProjectID,
		UserID:    userID,
		Role:      inv.Role,
		Status:    "active",
		InvitedBy: inv.InviterID,
		InvitedAt: inv.CreatedAt,
		JoinedAt:  &now,
	}, nil
}

// DeclineInvitationByID deletes an invitation (declined invitations are removed)
func (r *PostgresCollaborationRepository) DeclineInvitationByID(ctx context.Context, invitationID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM invitations WHERE invitation_id = $1`, invitationID)
	return err
}

func (r *PostgresCollaborationRepository) UpdateCollaboratorStatus(ctx context.Context, id uuid.UUID, status string) error {
	query := `UPDATE collaborators SET status = $1 WHERE collaborator_id = $2`
	result, err := r.db.ExecContext(ctx, query, status, id)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return domain.ErrCollaboratorNotFound
	}

	return nil
}

func (r *PostgresCollaborationRepository) UpdateCollaboratorRole(ctx context.Context, id uuid.UUID, role string) error {
	query := `UPDATE collaborators SET role = $1 WHERE collaborator_id = $2`
	result, err := r.db.ExecContext(ctx, query, role, id)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return domain.ErrCollaboratorNotFound
	}

	return nil
}

func (r *PostgresCollaborationRepository) DeleteCollaborator(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM collaborators WHERE collaborator_id = $1`
	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return domain.ErrCollaboratorNotFound
	}

	return nil
}

func (r *PostgresCollaborationRepository) GetUserProjectRole(ctx context.Context, userID, projectID uuid.UUID) (string, error) {
	query := `SELECT role FROM collaborators WHERE user_id = $1 AND project_id = $2 AND status = 'active'`
	var role string
	err := r.db.QueryRowContext(ctx, query, userID, projectID).Scan(&role)
	if err == sql.ErrNoRows {
		return "", domain.ErrUnauthorized
	}
	if err != nil {
		return "", err
	}
	return role, nil
}

// IsProjectOwner checks if the user is the owner of the project (from projects table)
func (r *PostgresCollaborationRepository) IsProjectOwner(ctx context.Context, userID, projectID uuid.UUID) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM projects WHERE project_id = $1 AND owner_id = $2)`
	var isOwner bool
	err := r.db.QueryRowContext(ctx, query, projectID, userID).Scan(&isOwner)
	if err != nil {
		return false, fmt.Errorf("failed to check project ownership: %w", err)
	}
	return isOwner, nil
}

// Comment operations
func (r *PostgresCollaborationRepository) CreateComment(ctx context.Context, comment *domain.Comment) error {
	query := `
		INSERT INTO comments (comment_id, project_id, screenplay_id, script_element_id, scene_id, user_id, content, line_number, char_position, parent_id, is_resolved, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`

	_, err := r.db.ExecContext(ctx, query,
		comment.ID,
		comment.ProjectID,
		comment.ScreenplayID,
		comment.ScriptElementID,
		comment.SceneID,
		comment.UserID,
		comment.Content,
		comment.LineNumber,
		comment.CharPosition,
		comment.ParentID,
		comment.IsResolved,
		comment.CreatedAt,
		comment.UpdatedAt,
	)
	return err
}

func (r *PostgresCollaborationRepository) GetCommentByID(ctx context.Context, id uuid.UUID) (*domain.Comment, error) {
	query := `
		SELECT comment_id, project_id, screenplay_id, script_element_id, scene_id, user_id, content, line_number, char_position, parent_id, is_resolved, created_at, updated_at
		FROM comments
		WHERE comment_id = $1`

	comment := &domain.Comment{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&comment.ID,
		&comment.ProjectID,
		&comment.ScreenplayID,
		&comment.ScriptElementID,
		&comment.SceneID,
		&comment.UserID,
		&comment.Content,
		&comment.LineNumber,
		&comment.CharPosition,
		&comment.ParentID,
		&comment.IsResolved,
		&comment.CreatedAt,
		&comment.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, domain.ErrCommentNotFound
	}
	if err != nil {
		return nil, err
	}

	return comment, nil
}

func (r *PostgresCollaborationRepository) GetProjectComments(ctx context.Context, projectID uuid.UUID, offset, limit int32) ([]*domain.Comment, error) {
	query := `
		SELECT comment_id, project_id, screenplay_id, script_element_id, scene_id, user_id, content, line_number, char_position, parent_id, is_resolved, created_at, updated_at
		FROM comments
		WHERE project_id = $1
		ORDER BY created_at DESC
		OFFSET $2 LIMIT $3`

	rows, err := r.db.QueryContext(ctx, query, projectID, offset, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*domain.Comment
	for rows.Next() {
		comment := &domain.Comment{}
		err := rows.Scan(
			&comment.ID,
			&comment.ProjectID,
			&comment.ScreenplayID,
			&comment.ScriptElementID,
			&comment.SceneID,
			&comment.UserID,
			&comment.Content,
			&comment.LineNumber,
			&comment.CharPosition,
			&comment.ParentID,
			&comment.IsResolved,
			&comment.CreatedAt,
			&comment.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		comments = append(comments, comment)
	}

	return comments, nil
}

func (r *PostgresCollaborationRepository) GetElementComments(ctx context.Context, elementID uuid.UUID, offset, limit int32) ([]*domain.Comment, error) {
	query := `
		SELECT comment_id, project_id, screenplay_id, script_element_id, scene_id, user_id, content, line_number, char_position, parent_id, is_resolved, created_at, updated_at
		FROM comments
		WHERE script_element_id = $1
		ORDER BY created_at ASC
		OFFSET $2 LIMIT $3`

	rows, err := r.db.QueryContext(ctx, query, elementID, offset, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*domain.Comment
	for rows.Next() {
		comment := &domain.Comment{}
		err := rows.Scan(
			&comment.ID,
			&comment.ProjectID,
			&comment.ScreenplayID,
			&comment.ScriptElementID,
			&comment.SceneID,
			&comment.UserID,
			&comment.Content,
			&comment.LineNumber,
			&comment.CharPosition,
			&comment.ParentID,
			&comment.IsResolved,
			&comment.CreatedAt,
			&comment.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		comments = append(comments, comment)
	}

	return comments, nil
}

func (r *PostgresCollaborationRepository) GetSceneComments(ctx context.Context, sceneID uuid.UUID, offset, limit int32) ([]*domain.Comment, error) {
	query := `
		SELECT comment_id, project_id, screenplay_id, script_element_id, scene_id, user_id, content, line_number, char_position, parent_id, is_resolved, created_at, updated_at
		FROM comments
		WHERE scene_id = $1
		ORDER BY line_number ASC, created_at ASC
		OFFSET $2 LIMIT $3`

	rows, err := r.db.QueryContext(ctx, query, sceneID, offset, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*domain.Comment
	for rows.Next() {
		comment := &domain.Comment{}
		err := rows.Scan(
			&comment.ID,
			&comment.ProjectID,
			&comment.ScreenplayID,
			&comment.ScriptElementID,
			&comment.SceneID,
			&comment.UserID,
			&comment.Content,
			&comment.LineNumber,
			&comment.CharPosition,
			&comment.ParentID,
			&comment.IsResolved,
			&comment.CreatedAt,
			&comment.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		comments = append(comments, comment)
	}

	return comments, nil
}

func (r *PostgresCollaborationRepository) UpdateComment(ctx context.Context, id uuid.UUID, content string) error {
	query := `UPDATE comments SET content = $1, updated_at = $2 WHERE comment_id = $3`
	result, err := r.db.ExecContext(ctx, query, content, time.Now(), id)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return domain.ErrCommentNotFound
	}

	return nil
}

func (r *PostgresCollaborationRepository) ResolveComment(ctx context.Context, id uuid.UUID) error {
	query := `UPDATE comments SET is_resolved = true, updated_at = $1 WHERE comment_id = $2`
	result, err := r.db.ExecContext(ctx, query, time.Now(), id)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return domain.ErrCommentNotFound
	}

	return nil
}

func (r *PostgresCollaborationRepository) DeleteComment(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM comments WHERE comment_id = $1`
	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return domain.ErrCommentNotFound
	}

	return nil
}

// Edit session operations (durable advisory locks).
//
// Columns follow the actual schema — session_id, project_id, user_id,
// element_id, started_at, last_activity_at, ended_at — and a session is active
// while ended_at IS NULL. (The legacy screenplay_id column is left NULL by this
// path.) An earlier version of this code queried non-existent last_activity /
// is_active columns and never ran successfully; these methods are the corrected,
// project-and-element-scoped implementation.
//
// All timestamps are written and compared using the database clock (NOW()), so
// activity/staleness comparisons never mix Go-local time with the DB's, which —
// against a `timestamp without time zone` column — would otherwise be off by the
// gateway host's UTC offset.
const editSessionColumns = `session_id, project_id, user_id, element_id, started_at, last_activity_at`

// CreateEditSession inserts a new active session, stamping started_at and
// last_activity_at from the database clock (NOW()) and reading them back so the
// returned domain object is accurate. ended_at defaults to NULL.
func (r *PostgresCollaborationRepository) CreateEditSession(ctx context.Context, session *domain.EditSession) error {
	query := `
		INSERT INTO edit_sessions (session_id, project_id, user_id, element_id, started_at, last_activity_at)
		VALUES ($1, $2, $3, $4, NOW(), NOW())
		RETURNING started_at, last_activity_at`

	return r.db.QueryRowContext(ctx, query,
		session.ID,
		session.ProjectID,
		session.UserID,
		session.ElementID,
	).Scan(&session.StartedAt, &session.LastActivity)
}

// GetActiveEditSessionForUser returns the caller's current active session for a
// project (the most recent, if somehow more than one exists), or
// ErrEditSessionNotFound. It backs the get-or-create upsert.
func (r *PostgresCollaborationRepository) GetActiveEditSessionForUser(ctx context.Context, projectID, userID uuid.UUID) (*domain.EditSession, error) {
	query := `
		SELECT ` + editSessionColumns + `
		FROM edit_sessions
		WHERE project_id = $1 AND user_id = $2 AND ended_at IS NULL
		ORDER BY last_activity_at DESC
		LIMIT 1`

	session := &domain.EditSession{}
	err := r.db.QueryRowContext(ctx, query, projectID, userID).Scan(
		&session.ID,
		&session.ProjectID,
		&session.UserID,
		&session.ElementID,
		&session.StartedAt,
		&session.LastActivity,
	)
	if err == sql.ErrNoRows {
		return nil, domain.ErrEditSessionNotFound
	}
	if err != nil {
		return nil, err
	}
	return session, nil
}

// ListActiveProjectEditSessions returns every active session for a project whose
// last activity is within staleAfter of now, most recent first. The staleness
// filter (evaluated against the DB clock) means a crashed client that never wrote
// ended_at stops appearing once its heartbeat lapses, without waiting for the
// sweep to close the row.
func (r *PostgresCollaborationRepository) ListActiveProjectEditSessions(ctx context.Context, projectID uuid.UUID, staleAfter time.Duration) ([]*domain.EditSession, error) {
	query := `
		SELECT ` + editSessionColumns + `
		FROM edit_sessions
		WHERE project_id = $1 AND ended_at IS NULL
		  AND last_activity_at > NOW() - make_interval(secs => $2)
		ORDER BY last_activity_at DESC`

	rows, err := r.db.QueryContext(ctx, query, projectID, staleAfter.Seconds())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := make([]*domain.EditSession, 0)
	for rows.Next() {
		session := &domain.EditSession{}
		if err := rows.Scan(
			&session.ID,
			&session.ProjectID,
			&session.UserID,
			&session.ElementID,
			&session.StartedAt,
			&session.LastActivity,
		); err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}

// UpdateEditSessionFocus moves a session's focused element and bumps its last
// activity (this doubles as the heartbeat). Passing an invalid NullUUID clears
// the focus. Returns ErrEditSessionNotFound if the session is gone or ended.
func (r *PostgresCollaborationRepository) UpdateEditSessionFocus(ctx context.Context, sessionID uuid.UUID, elementID uuid.NullUUID) error {
	query := `UPDATE edit_sessions SET element_id = $1, last_activity_at = NOW() WHERE session_id = $2 AND ended_at IS NULL`
	result, err := r.db.ExecContext(ctx, query, elementID, sessionID)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return domain.ErrEditSessionNotFound
	}
	return nil
}

// EndEditSession marks a session inactive by stamping ended_at. It is idempotent
// — ending an already-ended (or missing) session is a no-op, not an error — so
// the disconnect path never has to distinguish a double-close.
func (r *PostgresCollaborationRepository) EndEditSession(ctx context.Context, sessionID uuid.UUID) error {
	query := `UPDATE edit_sessions SET ended_at = NOW() WHERE session_id = $1 AND ended_at IS NULL`
	_, err := r.db.ExecContext(ctx, query, sessionID)
	return err
}

// SweepStaleEditSessions closes every active session whose last activity is older
// than staleAfter (evaluated against the DB clock) — hygiene for sessions
// abandoned without a clean disconnect (crash, killed process). Returns the
// number of sessions closed.
func (r *PostgresCollaborationRepository) SweepStaleEditSessions(ctx context.Context, staleAfter time.Duration) (int64, error) {
	query := `UPDATE edit_sessions SET ended_at = NOW() WHERE ended_at IS NULL AND last_activity_at < NOW() - make_interval(secs => $1)`
	result, err := r.db.ExecContext(ctx, query, staleAfter.Seconds())
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// Edit operation operations
func (r *PostgresCollaborationRepository) CreateEditOperation(ctx context.Context, operation *domain.EditOperation) error {
	query := `
		INSERT INTO edit_operations (operation_id, session_id, user_id, operation_type, position, content, length, timestamp)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`

	_, err := r.db.ExecContext(ctx, query,
		operation.ID,
		operation.SessionID,
		operation.UserID,
		operation.OperationType,
		operation.Position,
		operation.Content,
		operation.Length,
		operation.Timestamp,
	)
	return err
}

func (r *PostgresCollaborationRepository) GetSessionOperations(ctx context.Context, sessionID uuid.UUID, offset, limit int32) ([]*domain.EditOperation, error) {
	query := `
		SELECT operation_id, session_id, user_id, operation_type, position, content, length, timestamp
		FROM edit_operations
		WHERE session_id = $1
		ORDER BY timestamp ASC
		OFFSET $2 LIMIT $3`

	rows, err := r.db.QueryContext(ctx, query, sessionID, offset, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var operations []*domain.EditOperation
	for rows.Next() {
		operation := &domain.EditOperation{}
		err := rows.Scan(
			&operation.ID,
			&operation.SessionID,
			&operation.UserID,
			&operation.OperationType,
			&operation.Position,
			&operation.Content,
			&operation.Length,
			&operation.Timestamp,
		)
		if err != nil {
			return nil, err
		}
		operations = append(operations, operation)
	}

	return operations, nil
}

// User presence operations
func (r *PostgresCollaborationRepository) CreateOrUpdateUserPresence(ctx context.Context, presence *domain.UserPresence) error {
	query := `
		INSERT INTO user_presence (presence_id, user_id, project_id, screenplay_id, cursor_position, selection_start, selection_end, last_seen, is_online)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (user_id, project_id) DO UPDATE SET
			screenplay_id = EXCLUDED.screenplay_id,
			cursor_position = EXCLUDED.cursor_position,
			selection_start = EXCLUDED.selection_start,
			selection_end = EXCLUDED.selection_end,
			last_seen = EXCLUDED.last_seen,
			is_online = EXCLUDED.is_online`

	_, err := r.db.ExecContext(ctx, query,
		presence.ID,
		presence.UserID,
		presence.ProjectID,
		presence.ScreenplayID,
		presence.CursorPosition,
		presence.SelectionStart,
		presence.SelectionEnd,
		presence.LastSeen,
		presence.IsOnline,
	)
	return err
}

func (r *PostgresCollaborationRepository) GetProjectUserPresence(ctx context.Context, projectID uuid.UUID) ([]*domain.UserPresence, error) {
	query := `
		SELECT presence_id, user_id, project_id, screenplay_id, cursor_position, selection_start, selection_end, last_seen, is_online
		FROM user_presence
		WHERE project_id = $1 AND is_online = true
		ORDER BY last_seen DESC`

	rows, err := r.db.QueryContext(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var presences []*domain.UserPresence
	for rows.Next() {
		presence := &domain.UserPresence{}
		err := rows.Scan(
			&presence.ID,
			&presence.UserID,
			&presence.ProjectID,
			&presence.ScreenplayID,
			&presence.CursorPosition,
			&presence.SelectionStart,
			&presence.SelectionEnd,
			&presence.LastSeen,
			&presence.IsOnline,
		)
		if err != nil {
			return nil, err
		}
		presences = append(presences, presence)
	}

	return presences, nil
}

func (r *PostgresCollaborationRepository) GetUserPresenceByID(ctx context.Context, userID, projectID uuid.UUID) (*domain.UserPresence, error) {
	query := `
		SELECT presence_id, user_id, project_id, screenplay_id, cursor_position, selection_start, selection_end, last_seen, is_online
		FROM user_presence
		WHERE user_id = $1 AND project_id = $2`

	presence := &domain.UserPresence{}
	err := r.db.QueryRowContext(ctx, query, userID, projectID).Scan(
		&presence.ID,
		&presence.UserID,
		&presence.ProjectID,
		&presence.ScreenplayID,
		&presence.CursorPosition,
		&presence.SelectionStart,
		&presence.SelectionEnd,
		&presence.LastSeen,
		&presence.IsOnline,
	)

	if err == sql.ErrNoRows {
		return nil, domain.ErrUserPresenceNotFound
	}
	if err != nil {
		return nil, err
	}

	return presence, nil
}

func (r *PostgresCollaborationRepository) UpdateUserPresence(ctx context.Context, userID, projectID uuid.UUID, presence *domain.UserPresence) error {
	query := `
		UPDATE user_presence SET
			screenplay_id = $1,
			cursor_position = $2,
			selection_start = $3,
			selection_end = $4,
			last_seen = $5,
			is_online = $6
		WHERE user_id = $7 AND project_id = $8`

	result, err := r.db.ExecContext(ctx, query,
		presence.ScreenplayID,
		presence.CursorPosition,
		presence.SelectionStart,
		presence.SelectionEnd,
		presence.LastSeen,
		presence.IsOnline,
		userID,
		projectID,
	)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return domain.ErrUserPresenceNotFound
	}

	return nil
}

func (r *PostgresCollaborationRepository) SetUserOffline(ctx context.Context, userID, projectID uuid.UUID) error {
	query := `UPDATE user_presence SET is_online = false, last_seen = $1 WHERE user_id = $2 AND project_id = $3`
	result, err := r.db.ExecContext(ctx, query, time.Now(), userID, projectID)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return domain.ErrUserPresenceNotFound
	}

	return nil
}
