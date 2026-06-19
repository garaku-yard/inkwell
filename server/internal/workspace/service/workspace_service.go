package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
	"inkwell/server/internal/workspace/domain"
	"inkwell/server/internal/workspace/repository"
)

type WorkspaceService interface {
	// Categories
	ListCategories(ctx context.Context) ([]domain.Category, error)

	// Workspaces
	CreatePersonalWorkspaces(ctx context.Context, userID uuid.UUID, categorySlugs []string) ([]domain.Workspace, error)
	CreateOrgWorkspace(ctx context.Context, ownerID uuid.UUID, name, description string, categorySlugs []string) (*domain.Workspace, error)
	GetWorkspace(ctx context.Context, workspaceID uuid.UUID) (*domain.Workspace, error)
	ListUserWorkspaces(ctx context.Context, userID uuid.UUID) (personal []domain.Workspace, org []domain.Workspace, err error)
	UpdateWorkspace(ctx context.Context, workspaceID uuid.UUID, name, description, avatarURL string) (*domain.Workspace, error)
	DeleteWorkspace(ctx context.Context, workspaceID, userID uuid.UUID) error

	// Workspace categories (org only)
	EnableCategory(ctx context.Context, workspaceID uuid.UUID, categorySlug string) (*domain.Workspace, error)
	DisableCategory(ctx context.Context, workspaceID uuid.UUID, categorySlug string) (*domain.Workspace, error)

	// Members
	AddMember(ctx context.Context, workspaceID, userID, invitedBy uuid.UUID, role domain.MemberRole) (*domain.WorkspaceMember, error)
	RemoveMember(ctx context.Context, workspaceID, userID uuid.UUID) error
	UpdateMemberRole(ctx context.Context, workspaceID, userID uuid.UUID, role domain.MemberRole) (*domain.WorkspaceMember, error)
	ListMembers(ctx context.Context, workspaceID uuid.UUID) ([]domain.WorkspaceMember, error)
	// CountOwnerSeats returns the distinct member count across all org workspaces
	// owned by ownerID — the billable seat count for their per-seat subscription.
	CountOwnerSeats(ctx context.Context, ownerID uuid.UUID) (int, error)

	// Invites
	InviteMember(ctx context.Context, workspaceID uuid.UUID, email string, role domain.InviteRole, invitedBy uuid.UUID) (string, error)
	AcceptInvite(ctx context.Context, token string, userID uuid.UUID) (*domain.Workspace, error)
	DeclineInvite(ctx context.Context, token string) error
}

type workspaceService struct {
	repo repository.WorkspaceRepository
}

func NewWorkspaceService(repo repository.WorkspaceRepository) WorkspaceService {
	return &workspaceService{repo: repo}
}

// ─── Categories ───────────────────────────────────────────────────────────────

func (s *workspaceService) ListCategories(ctx context.Context) ([]domain.Category, error) {
	return s.repo.ListCategories(ctx)
}

// ─── Workspaces ───────────────────────────────────────────────────────────────

// CreatePersonalWorkspaces is called on user registration. It creates one
// personal workspace per category slug provided. Each workspace name is the
// category name and its slug is "<user-id>-<category-slug>".
func (s *workspaceService) CreatePersonalWorkspaces(ctx context.Context, userID uuid.UUID, categorySlugs []string) ([]domain.Workspace, error) {
	if len(categorySlugs) == 0 {
		return nil, nil
	}

	cats, err := s.repo.GetCategoriesBySlugs(ctx, categorySlugs)
	if err != nil {
		return nil, fmt.Errorf("fetch categories: %w", err)
	}

	var created []domain.Workspace
	now := time.Now()

	for _, cat := range cats {
		slug := fmt.Sprintf("%s-%s", userID.String()[:8], cat.Slug)
		w := &domain.Workspace{
			ID:        uuid.New(),
			Name:      cat.Name,
			Slug:      slug,
			Type:      domain.WorkspaceTypePersonal,
			OwnerID:   userID,
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := s.repo.CreateWorkspace(ctx, w); err != nil {
			return nil, fmt.Errorf("create personal workspace for %s: %w", cat.Slug, err)
		}
		if err := s.repo.AddWorkspaceCategory(ctx, w.ID, cat.ID); err != nil {
			return nil, fmt.Errorf("link category to workspace: %w", err)
		}
		w.Categories = []domain.Category{cat}
		created = append(created, *w)
	}

	return created, nil
}

func (s *workspaceService) CreateOrgWorkspace(ctx context.Context, ownerID uuid.UUID, name, description string, categorySlugs []string) (*domain.Workspace, error) {
	baseSlug := repository.GenerateSlug(name)
	slug := baseSlug
	// Deduplicate slug
	for i := 2; ; i++ {
		exists, err := s.repo.SlugExists(ctx, slug)
		if err != nil {
			return nil, err
		}
		if !exists {
			break
		}
		slug = fmt.Sprintf("%s-%d", baseSlug, i)
	}

	desc := &description
	now := time.Now()
	w := &domain.Workspace{
		ID:          uuid.New(),
		Name:        name,
		Slug:        slug,
		Type:        domain.WorkspaceTypeOrg,
		OwnerID:     ownerID,
		Description: desc,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if err := s.repo.CreateWorkspace(ctx, w); err != nil {
		return nil, err
	}

	// Add owner as member
	ownerMember := &domain.WorkspaceMember{
		ID:          uuid.New(),
		WorkspaceID: w.ID,
		UserID:      ownerID,
		Role:        domain.MemberRoleOwner,
		JoinedAt:    now,
		CreatedAt:   now,
	}
	if err := s.repo.AddMember(ctx, ownerMember); err != nil {
		return nil, fmt.Errorf("add owner as member: %w", err)
	}

	// Attach categories
	if len(categorySlugs) > 0 {
		cats, err := s.repo.GetCategoriesBySlugs(ctx, categorySlugs)
		if err != nil {
			return nil, err
		}
		for _, cat := range cats {
			if err := s.repo.AddWorkspaceCategory(ctx, w.ID, cat.ID); err != nil {
				return nil, err
			}
		}
		w.Categories = cats
	}

	return w, nil
}

func (s *workspaceService) GetWorkspace(ctx context.Context, workspaceID uuid.UUID) (*domain.Workspace, error) {
	return s.repo.GetWorkspaceByID(ctx, workspaceID)
}

func (s *workspaceService) ListUserWorkspaces(ctx context.Context, userID uuid.UUID) ([]domain.Workspace, []domain.Workspace, error) {
	personal, err := s.repo.GetWorkspacesByOwner(ctx, userID)
	if err != nil {
		return nil, nil, err
	}

	// Filter to only personal type owned by user
	var personalOnly []domain.Workspace
	var ownedOrg []domain.Workspace
	for _, w := range personal {
		if w.Type == domain.WorkspaceTypePersonal {
			personalOnly = append(personalOnly, w)
		} else {
			ownedOrg = append(ownedOrg, w)
		}
	}

	// Also get org workspaces where user is a member but not owner
	memberOrg, err := s.repo.GetOrgWorkspacesByMember(ctx, userID)
	if err != nil {
		return nil, nil, err
	}

	// Deduplicate owned org + member org
	seen := make(map[uuid.UUID]bool)
	for _, w := range ownedOrg {
		seen[w.ID] = true
	}
	for _, w := range memberOrg {
		if !seen[w.ID] {
			ownedOrg = append(ownedOrg, w)
		}
	}

	return personalOnly, ownedOrg, nil
}

func (s *workspaceService) UpdateWorkspace(ctx context.Context, workspaceID uuid.UUID, name, description, avatarURL string) (*domain.Workspace, error) {
	w, err := s.repo.GetWorkspaceByID(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	if name != "" {
		w.Name = name
	}
	if description != "" {
		w.Description = &description
	}
	if avatarURL != "" {
		w.AvatarURL = &avatarURL
	}
	if err := s.repo.UpdateWorkspace(ctx, w); err != nil {
		return nil, err
	}
	return w, nil
}

func (s *workspaceService) DeleteWorkspace(ctx context.Context, workspaceID, userID uuid.UUID) error {
	w, err := s.repo.GetWorkspaceByID(ctx, workspaceID)
	if err != nil {
		return err
	}
	if w.OwnerID != userID {
		return domain.ErrNotOwner
	}
	return s.repo.DeleteWorkspace(ctx, workspaceID)
}

// ─── Workspace categories ─────────────────────────────────────────────────────

func (s *workspaceService) EnableCategory(ctx context.Context, workspaceID uuid.UUID, categorySlug string) (*domain.Workspace, error) {
	cat, err := s.repo.GetCategoryBySlug(ctx, categorySlug)
	if err != nil {
		return nil, err
	}
	if err := s.repo.AddWorkspaceCategory(ctx, workspaceID, cat.ID); err != nil {
		return nil, err
	}
	return s.repo.GetWorkspaceByID(ctx, workspaceID)
}

func (s *workspaceService) DisableCategory(ctx context.Context, workspaceID uuid.UUID, categorySlug string) (*domain.Workspace, error) {
	cat, err := s.repo.GetCategoryBySlug(ctx, categorySlug)
	if err != nil {
		return nil, err
	}
	if err := s.repo.RemoveWorkspaceCategory(ctx, workspaceID, cat.ID); err != nil {
		return nil, err
	}
	return s.repo.GetWorkspaceByID(ctx, workspaceID)
}

// ─── Members ─────────────────────────────────────────────────────────────────

func (s *workspaceService) AddMember(ctx context.Context, workspaceID, userID, invitedBy uuid.UUID, role domain.MemberRole) (*domain.WorkspaceMember, error) {
	now := time.Now()
	m := &domain.WorkspaceMember{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		UserID:      userID,
		Role:        role,
		InvitedBy:   &invitedBy,
		JoinedAt:    now,
		CreatedAt:   now,
	}
	if err := s.repo.AddMember(ctx, m); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *workspaceService) RemoveMember(ctx context.Context, workspaceID, userID uuid.UUID) error {
	w, err := s.repo.GetWorkspaceByID(ctx, workspaceID)
	if err != nil {
		return err
	}
	if w.OwnerID == userID {
		return domain.ErrCannotRemoveOwner
	}
	return s.repo.RemoveMember(ctx, workspaceID, userID)
}

func (s *workspaceService) UpdateMemberRole(ctx context.Context, workspaceID, userID uuid.UUID, role domain.MemberRole) (*domain.WorkspaceMember, error) {
	if err := s.repo.UpdateMemberRole(ctx, workspaceID, userID, role); err != nil {
		return nil, err
	}
	return s.repo.GetMember(ctx, workspaceID, userID)
}

func (s *workspaceService) ListMembers(ctx context.Context, workspaceID uuid.UUID) ([]domain.WorkspaceMember, error) {
	return s.repo.ListMembers(ctx, workspaceID)
}

func (s *workspaceService) CountOwnerSeats(ctx context.Context, ownerID uuid.UUID) (int, error) {
	return s.repo.CountOwnerOrgSeats(ctx, ownerID)
}

// ─── Invites ─────────────────────────────────────────────────────────────────

func (s *workspaceService) InviteMember(ctx context.Context, workspaceID uuid.UUID, email string, role domain.InviteRole, invitedBy uuid.UUID) (string, error) {
	token, err := generateToken()
	if err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}

	now := time.Now()
	inv := &domain.WorkspaceInvite{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		Email:       email,
		Role:        role,
		Token:       token,
		InvitedBy:   invitedBy,
		ExpiresAt:   now.Add(7 * 24 * time.Hour), // 7 days
		CreatedAt:   now,
	}
	if err := s.repo.CreateInvite(ctx, inv); err != nil {
		return "", err
	}
	return token, nil
}

func (s *workspaceService) AcceptInvite(ctx context.Context, token string, userID uuid.UUID) (*domain.Workspace, error) {
	inv, err := s.repo.GetInviteByToken(ctx, token)
	if err != nil {
		return nil, err
	}
	if inv.AcceptedAt != nil || inv.DeclinedAt != nil {
		return nil, domain.ErrInviteAlreadyUsed
	}
	if time.Now().After(inv.ExpiresAt) {
		return nil, domain.ErrInviteExpired
	}

	if _, err := s.AddMember(ctx, inv.WorkspaceID, userID, inv.InvitedBy, domain.MemberRole(inv.Role)); err != nil {
		if err != domain.ErrMemberAlreadyExists {
			return nil, err
		}
	}

	if err := s.repo.MarkInviteAccepted(ctx, token); err != nil {
		return nil, err
	}

	return s.repo.GetWorkspaceByID(ctx, inv.WorkspaceID)
}

func (s *workspaceService) DeclineInvite(ctx context.Context, token string) error {
	inv, err := s.repo.GetInviteByToken(ctx, token)
	if err != nil {
		return err
	}
	if inv.AcceptedAt != nil || inv.DeclinedAt != nil {
		return domain.ErrInviteAlreadyUsed
	}
	return s.repo.MarkInviteDeclined(ctx, token)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
