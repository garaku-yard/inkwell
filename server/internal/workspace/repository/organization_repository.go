package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"inkwell/server/internal/workspace/domain"
)

// ─── Organizations ─────────────────────────────────────────────────────────────

func (r *postgresWorkspaceRepository) CreateOrganization(ctx context.Context, o *domain.Organization) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO organizations (id, name, slug, owner_id, avatar_url, description, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		o.ID, o.Name, o.Slug, o.OwnerID, o.AvatarURL, o.Description, o.CreatedAt, o.UpdatedAt,
	)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" {
			return domain.ErrOrgSlugTaken
		}
		return fmt.Errorf("create organization: %w", err)
	}
	return nil
}

func (r *postgresWorkspaceRepository) GetOrganizationByID(ctx context.Context, id uuid.UUID) (*domain.Organization, error) {
	var o domain.Organization
	err := r.db.QueryRowContext(ctx, `
		SELECT id, name, slug, owner_id, avatar_url, description, created_at, updated_at
		FROM organizations WHERE id = $1`, id,
	).Scan(&o.ID, &o.Name, &o.Slug, &o.OwnerID, &o.AvatarURL, &o.Description, &o.CreatedAt, &o.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, domain.ErrOrgNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get organization: %w", err)
	}
	return &o, nil
}

// GetOrganizationsForUser returns every organization the user belongs to (the
// owner is also a member row), with the user's role filled into MemberRole.
func (r *postgresWorkspaceRepository) GetOrganizationsForUser(ctx context.Context, userID uuid.UUID) ([]domain.Organization, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT o.id, o.name, o.slug, o.owner_id, o.avatar_url, o.description, o.created_at, o.updated_at, om.role
		FROM organizations o
		INNER JOIN org_members om ON om.org_id = o.id
		WHERE om.user_id = $1 ORDER BY o.created_at`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("get organizations for user: %w", err)
	}
	defer rows.Close()

	var orgs []domain.Organization
	for rows.Next() {
		var o domain.Organization
		if err := rows.Scan(&o.ID, &o.Name, &o.Slug, &o.OwnerID, &o.AvatarURL, &o.Description, &o.CreatedAt, &o.UpdatedAt, &o.MemberRole); err != nil {
			return nil, fmt.Errorf("scan organization: %w", err)
		}
		orgs = append(orgs, o)
	}
	return orgs, rows.Err()
}

func (r *postgresWorkspaceRepository) UpdateOrganization(ctx context.Context, o *domain.Organization) error {
	o.UpdatedAt = time.Now()
	_, err := r.db.ExecContext(ctx, `
		UPDATE organizations SET name=$1, avatar_url=$2, description=$3, updated_at=$4 WHERE id=$5`,
		o.Name, o.AvatarURL, o.Description, o.UpdatedAt, o.ID,
	)
	return err
}

func (r *postgresWorkspaceRepository) DeleteOrganization(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM organizations WHERE id = $1`, id)
	return err
}

func (r *postgresWorkspaceRepository) OrgSlugExists(ctx context.Context, slug string) (bool, error) {
	var exists bool
	err := r.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM organizations WHERE slug = $1)`, slug).Scan(&exists)
	return exists, err
}

// ─── Organization members ──────────────────────────────────────────────────────

func (r *postgresWorkspaceRepository) AddOrgMember(ctx context.Context, m *domain.OrgMember) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO org_members (id, org_id, user_id, role, invited_by, joined_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		m.ID, m.OrgID, m.UserID, m.Role, m.InvitedBy, m.JoinedAt, m.CreatedAt,
	)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" {
			return domain.ErrMemberAlreadyExists
		}
		return fmt.Errorf("add org member: %w", err)
	}
	return nil
}

func (r *postgresWorkspaceRepository) GetOrgMember(ctx context.Context, orgID, userID uuid.UUID) (*domain.OrgMember, error) {
	var m domain.OrgMember
	err := r.db.QueryRowContext(ctx, `
		SELECT id, org_id, user_id, role, invited_by, joined_at, created_at
		FROM org_members WHERE org_id=$1 AND user_id=$2`,
		orgID, userID,
	).Scan(&m.ID, &m.OrgID, &m.UserID, &m.Role, &m.InvitedBy, &m.JoinedAt, &m.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, domain.ErrMemberNotFound
	}
	return &m, err
}

func (r *postgresWorkspaceRepository) UpdateOrgMemberRole(ctx context.Context, orgID, userID uuid.UUID, role domain.MemberRole) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE org_members SET role=$1 WHERE org_id=$2 AND user_id=$3`,
		role, orgID, userID,
	)
	return err
}

func (r *postgresWorkspaceRepository) RemoveOrgMember(ctx context.Context, orgID, userID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM org_members WHERE org_id=$1 AND user_id=$2`,
		orgID, userID,
	)
	return err
}

func (r *postgresWorkspaceRepository) ListOrgMembers(ctx context.Context, orgID uuid.UUID) ([]domain.OrgMember, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, org_id, user_id, role, invited_by, joined_at, created_at
		FROM org_members WHERE org_id=$1 ORDER BY joined_at`,
		orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("list org members: %w", err)
	}
	defer rows.Close()

	var members []domain.OrgMember
	for rows.Next() {
		var m domain.OrgMember
		if err := rows.Scan(&m.ID, &m.OrgID, &m.UserID, &m.Role, &m.InvitedBy, &m.JoinedAt, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan org member: %w", err)
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

func (r *postgresWorkspaceRepository) CountOrgSeats(ctx context.Context, orgID uuid.UUID) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM org_members WHERE org_id = $1`, orgID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count org seats: %w", err)
	}
	return count, nil
}

// ─── Organization invites ──────────────────────────────────────────────────────

func (r *postgresWorkspaceRepository) CreateOrgInvite(ctx context.Context, inv *domain.OrgInvite) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO org_invites (id, org_id, email, role, token, invited_by, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		inv.ID, inv.OrgID, inv.Email, inv.Role, inv.Token, inv.InvitedBy, inv.ExpiresAt, inv.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("create org invite: %w", err)
	}
	return nil
}

func (r *postgresWorkspaceRepository) GetOrgInviteByToken(ctx context.Context, token string) (*domain.OrgInvite, error) {
	var inv domain.OrgInvite
	err := r.db.QueryRowContext(ctx, `
		SELECT id, org_id, email, role, token, invited_by, expires_at, accepted_at, declined_at, created_at
		FROM org_invites WHERE token = $1`, token,
	).Scan(&inv.ID, &inv.OrgID, &inv.Email, &inv.Role, &inv.Token, &inv.InvitedBy, &inv.ExpiresAt, &inv.AcceptedAt, &inv.DeclinedAt, &inv.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, domain.ErrInviteNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get org invite: %w", err)
	}
	return &inv, nil
}

func (r *postgresWorkspaceRepository) MarkOrgInviteAccepted(ctx context.Context, token string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE org_invites SET accepted_at = NOW() WHERE token = $1`, token,
	)
	return err
}

func (r *postgresWorkspaceRepository) MarkOrgInviteDeclined(ctx context.Context, token string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE org_invites SET declined_at = NOW() WHERE token = $1`, token,
	)
	return err
}
