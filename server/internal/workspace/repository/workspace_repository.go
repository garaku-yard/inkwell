package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"scriptlith/server/internal/workspace/domain"
)

type WorkspaceRepository interface {
	// Categories
	ListCategories(ctx context.Context) ([]domain.Category, error)
	GetCategoryBySlug(ctx context.Context, slug string) (*domain.Category, error)
	GetCategoriesBySlugs(ctx context.Context, slugs []string) ([]domain.Category, error)

	// Workspaces
	CreateWorkspace(ctx context.Context, w *domain.Workspace) error
	GetWorkspaceByID(ctx context.Context, id uuid.UUID) (*domain.Workspace, error)
	GetWorkspacesByOwner(ctx context.Context, ownerID uuid.UUID) ([]domain.Workspace, error)
	GetOrgWorkspacesByMember(ctx context.Context, userID uuid.UUID) ([]domain.Workspace, error)
	UpdateWorkspace(ctx context.Context, w *domain.Workspace) error
	DeleteWorkspace(ctx context.Context, id uuid.UUID) error
	SlugExists(ctx context.Context, slug string) (bool, error)

	// Workspace categories
	AddWorkspaceCategory(ctx context.Context, workspaceID, categoryID uuid.UUID) error
	RemoveWorkspaceCategory(ctx context.Context, workspaceID, categoryID uuid.UUID) error
	GetWorkspaceCategories(ctx context.Context, workspaceID uuid.UUID) ([]domain.Category, error)

	// Members
	AddMember(ctx context.Context, m *domain.WorkspaceMember) error
	GetMember(ctx context.Context, workspaceID, userID uuid.UUID) (*domain.WorkspaceMember, error)
	UpdateMemberRole(ctx context.Context, workspaceID, userID uuid.UUID, role domain.MemberRole) error
	RemoveMember(ctx context.Context, workspaceID, userID uuid.UUID) error
	ListMembers(ctx context.Context, workspaceID uuid.UUID) ([]domain.WorkspaceMember, error)

	// Invites
	CreateInvite(ctx context.Context, inv *domain.WorkspaceInvite) error
	GetInviteByToken(ctx context.Context, token string) (*domain.WorkspaceInvite, error)
	MarkInviteAccepted(ctx context.Context, token string) error
	MarkInviteDeclined(ctx context.Context, token string) error
}

type postgresWorkspaceRepository struct {
	db *sql.DB
}

func NewWorkspaceRepository(db *sql.DB) WorkspaceRepository {
	return &postgresWorkspaceRepository{db: db}
}

// ─── Categories ───────────────────────────────────────────────────────────────

func (r *postgresWorkspaceRepository) ListCategories(ctx context.Context) ([]domain.Category, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, slug, name, description, icon, created_at FROM categories ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list categories: %w", err)
	}
	defer rows.Close()
	return scanCategories(rows)
}

func (r *postgresWorkspaceRepository) GetCategoryBySlug(ctx context.Context, slug string) (*domain.Category, error) {
	var c domain.Category
	err := r.db.QueryRowContext(ctx,
		`SELECT id, slug, name, description, icon, created_at FROM categories WHERE slug = $1`, slug,
	).Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, domain.ErrCategoryNotFound
	}
	return &c, err
}

func (r *postgresWorkspaceRepository) GetCategoriesBySlugs(ctx context.Context, slugs []string) ([]domain.Category, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, slug, name, description, icon, created_at FROM categories WHERE slug = ANY($1) ORDER BY name`,
		pq.Array(slugs),
	)
	if err != nil {
		return nil, fmt.Errorf("get categories by slugs: %w", err)
	}
	defer rows.Close()
	return scanCategories(rows)
}

// ─── Workspaces ───────────────────────────────────────────────────────────────

func (r *postgresWorkspaceRepository) CreateWorkspace(ctx context.Context, w *domain.Workspace) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO workspaces (id, name, slug, type, owner_id, avatar_url, description, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		w.ID, w.Name, w.Slug, w.Type, w.OwnerID, w.AvatarURL, w.Description, w.CreatedAt, w.UpdatedAt,
	)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" {
			return domain.ErrWorkspaceSlugTaken
		}
		return fmt.Errorf("create workspace: %w", err)
	}
	return nil
}

func (r *postgresWorkspaceRepository) GetWorkspaceByID(ctx context.Context, id uuid.UUID) (*domain.Workspace, error) {
	var w domain.Workspace
	err := r.db.QueryRowContext(ctx, `
		SELECT id, name, slug, type, owner_id, avatar_url, description, created_at, updated_at
		FROM workspaces WHERE id = $1`, id,
	).Scan(&w.ID, &w.Name, &w.Slug, &w.Type, &w.OwnerID, &w.AvatarURL, &w.Description, &w.CreatedAt, &w.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, domain.ErrWorkspaceNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get workspace: %w", err)
	}
	cats, err := r.GetWorkspaceCategories(ctx, id)
	if err != nil {
		return nil, err
	}
	w.Categories = cats
	return &w, nil
}

func (r *postgresWorkspaceRepository) GetWorkspacesByOwner(ctx context.Context, ownerID uuid.UUID) ([]domain.Workspace, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, name, slug, type, owner_id, avatar_url, description, created_at, updated_at
		FROM workspaces WHERE owner_id = $1 ORDER BY created_at`, ownerID,
	)
	if err != nil {
		return nil, fmt.Errorf("get workspaces by owner: %w", err)
	}
	defer rows.Close()
	return r.scanAndEnrichWorkspaces(ctx, rows)
}

func (r *postgresWorkspaceRepository) GetOrgWorkspacesByMember(ctx context.Context, userID uuid.UUID) ([]domain.Workspace, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT w.id, w.name, w.slug, w.type, w.owner_id, w.avatar_url, w.description, w.created_at, w.updated_at
		FROM workspaces w
		INNER JOIN workspace_members wm ON wm.workspace_id = w.id
		WHERE wm.user_id = $1 AND w.type = 'org' ORDER BY w.created_at`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("get org workspaces by member: %w", err)
	}
	defer rows.Close()
	return r.scanAndEnrichWorkspaces(ctx, rows)
}

func (r *postgresWorkspaceRepository) UpdateWorkspace(ctx context.Context, w *domain.Workspace) error {
	w.UpdatedAt = time.Now()
	_, err := r.db.ExecContext(ctx, `
		UPDATE workspaces SET name=$1, avatar_url=$2, description=$3, updated_at=$4 WHERE id=$5`,
		w.Name, w.AvatarURL, w.Description, w.UpdatedAt, w.ID,
	)
	return err
}

func (r *postgresWorkspaceRepository) DeleteWorkspace(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM workspaces WHERE id = $1`, id)
	return err
}

func (r *postgresWorkspaceRepository) SlugExists(ctx context.Context, slug string) (bool, error) {
	var exists bool
	err := r.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM workspaces WHERE slug = $1)`, slug).Scan(&exists)
	return exists, err
}

// ─── Workspace categories ─────────────────────────────────────────────────────

func (r *postgresWorkspaceRepository) AddWorkspaceCategory(ctx context.Context, workspaceID, categoryID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO workspace_categories (workspace_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		workspaceID, categoryID,
	)
	return err
}

func (r *postgresWorkspaceRepository) RemoveWorkspaceCategory(ctx context.Context, workspaceID, categoryID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM workspace_categories WHERE workspace_id=$1 AND category_id=$2`,
		workspaceID, categoryID,
	)
	return err
}

func (r *postgresWorkspaceRepository) GetWorkspaceCategories(ctx context.Context, workspaceID uuid.UUID) ([]domain.Category, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT c.id, c.slug, c.name, c.description, c.icon, c.created_at
		FROM categories c
		INNER JOIN workspace_categories wc ON wc.category_id = c.id
		WHERE wc.workspace_id = $1 ORDER BY c.name`, workspaceID,
	)
	if err != nil {
		return nil, fmt.Errorf("get workspace categories: %w", err)
	}
	defer rows.Close()
	return scanCategories(rows)
}

// ─── Members ─────────────────────────────────────────────────────────────────

func (r *postgresWorkspaceRepository) AddMember(ctx context.Context, m *domain.WorkspaceMember) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO workspace_members (id, workspace_id, user_id, role, invited_by, joined_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		m.ID, m.WorkspaceID, m.UserID, m.Role, m.InvitedBy, m.JoinedAt, m.CreatedAt,
	)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" {
			return domain.ErrMemberAlreadyExists
		}
		return fmt.Errorf("add member: %w", err)
	}
	return nil
}

func (r *postgresWorkspaceRepository) GetMember(ctx context.Context, workspaceID, userID uuid.UUID) (*domain.WorkspaceMember, error) {
	var m domain.WorkspaceMember
	err := r.db.QueryRowContext(ctx, `
		SELECT id, workspace_id, user_id, role, invited_by, joined_at, created_at
		FROM workspace_members WHERE workspace_id=$1 AND user_id=$2`,
		workspaceID, userID,
	).Scan(&m.ID, &m.WorkspaceID, &m.UserID, &m.Role, &m.InvitedBy, &m.JoinedAt, &m.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, domain.ErrMemberNotFound
	}
	return &m, err
}

func (r *postgresWorkspaceRepository) UpdateMemberRole(ctx context.Context, workspaceID, userID uuid.UUID, role domain.MemberRole) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE workspace_members SET role=$1 WHERE workspace_id=$2 AND user_id=$3`,
		role, workspaceID, userID,
	)
	return err
}

func (r *postgresWorkspaceRepository) RemoveMember(ctx context.Context, workspaceID, userID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2`,
		workspaceID, userID,
	)
	return err
}

func (r *postgresWorkspaceRepository) ListMembers(ctx context.Context, workspaceID uuid.UUID) ([]domain.WorkspaceMember, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, workspace_id, user_id, role, invited_by, joined_at, created_at
		FROM workspace_members WHERE workspace_id=$1 ORDER BY joined_at`,
		workspaceID,
	)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}
	defer rows.Close()

	var members []domain.WorkspaceMember
	for rows.Next() {
		var m domain.WorkspaceMember
		if err := rows.Scan(&m.ID, &m.WorkspaceID, &m.UserID, &m.Role, &m.InvitedBy, &m.JoinedAt, &m.CreatedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

// ─── Invites ─────────────────────────────────────────────────────────────────

func (r *postgresWorkspaceRepository) CreateInvite(ctx context.Context, inv *domain.WorkspaceInvite) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO workspace_invites (id, workspace_id, email, role, token, invited_by, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		inv.ID, inv.WorkspaceID, inv.Email, inv.Role, inv.Token, inv.InvitedBy, inv.ExpiresAt, inv.CreatedAt,
	)
	return err
}

func (r *postgresWorkspaceRepository) GetInviteByToken(ctx context.Context, token string) (*domain.WorkspaceInvite, error) {
	var inv domain.WorkspaceInvite
	err := r.db.QueryRowContext(ctx, `
		SELECT id, workspace_id, email, role, token, invited_by, expires_at, accepted_at, declined_at, created_at
		FROM workspace_invites WHERE token=$1`, token,
	).Scan(&inv.ID, &inv.WorkspaceID, &inv.Email, &inv.Role, &inv.Token, &inv.InvitedBy,
		&inv.ExpiresAt, &inv.AcceptedAt, &inv.DeclinedAt, &inv.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, domain.ErrInviteNotFound
	}
	return &inv, err
}

func (r *postgresWorkspaceRepository) MarkInviteAccepted(ctx context.Context, token string) error {
	now := time.Now()
	_, err := r.db.ExecContext(ctx,
		`UPDATE workspace_invites SET accepted_at=$1 WHERE token=$2`, now, token,
	)
	return err
}

func (r *postgresWorkspaceRepository) MarkInviteDeclined(ctx context.Context, token string) error {
	now := time.Now()
	_, err := r.db.ExecContext(ctx,
		`UPDATE workspace_invites SET declined_at=$1 WHERE token=$2`, now, token,
	)
	return err
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func scanCategories(rows *sql.Rows) ([]domain.Category, error) {
	var cats []domain.Category
	for rows.Next() {
		var c domain.Category
		if err := rows.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.CreatedAt); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, rows.Err()
}

func (r *postgresWorkspaceRepository) scanAndEnrichWorkspaces(ctx context.Context, rows *sql.Rows) ([]domain.Workspace, error) {
	var workspaces []domain.Workspace
	for rows.Next() {
		var w domain.Workspace
		if err := rows.Scan(&w.ID, &w.Name, &w.Slug, &w.Type, &w.OwnerID, &w.AvatarURL, &w.Description, &w.CreatedAt, &w.UpdatedAt); err != nil {
			return nil, err
		}
		workspaces = append(workspaces, w)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range workspaces {
		cats, err := r.GetWorkspaceCategories(ctx, workspaces[i].ID)
		if err != nil {
			return nil, err
		}
		workspaces[i].Categories = cats
	}
	return workspaces, nil
}

// generateSlug creates a URL-safe slug from a name, deduplicating against existing slugs.
func GenerateSlug(base string) string {
	slug := strings.ToLower(strings.ReplaceAll(base, " ", "-"))
	// Strip non-alphanumeric/dash characters
	var b strings.Builder
	for _, r := range slug {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			b.WriteRune(r)
		}
	}
	return b.String()
}
