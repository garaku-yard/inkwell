package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"inkwell/server/internal/workspace/domain"
	"inkwell/server/internal/workspace/repository"
)

// ─── Organizations ─────────────────────────────────────────────────────────────

func (s *workspaceService) CreateOrganization(ctx context.Context, ownerID uuid.UUID, name, description string) (*domain.Organization, error) {
	baseSlug := repository.GenerateSlug(name)
	slug := baseSlug
	for i := 2; ; i++ {
		exists, err := s.repo.OrgSlugExists(ctx, slug)
		if err != nil {
			return nil, err
		}
		if !exists {
			break
		}
		slug = fmt.Sprintf("%s-%d", baseSlug, i)
	}

	now := time.Now()
	o := &domain.Organization{
		ID:        uuid.New(),
		Name:      name,
		Slug:      slug,
		OwnerID:   ownerID,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if description != "" {
		o.Description = &description
	}
	if err := s.repo.CreateOrganization(ctx, o); err != nil {
		return nil, err
	}

	// The owner is also a member row (role owner) so membership lookups and
	// seat counts include them uniformly.
	owner := &domain.OrgMember{
		ID:        uuid.New(),
		OrgID:     o.ID,
		UserID:    ownerID,
		Role:      domain.MemberRoleOwner,
		JoinedAt:  now,
		CreatedAt: now,
	}
	if err := s.repo.AddOrgMember(ctx, owner); err != nil {
		return nil, fmt.Errorf("add owner as member: %w", err)
	}
	o.MemberRole = domain.MemberRoleOwner

	return o, nil
}

// GetOrganization fetches an org; when userID is non-nil it fills MemberRole
// with that user's role (empty if they are not a member).
func (s *workspaceService) GetOrganization(ctx context.Context, orgID, userID uuid.UUID) (*domain.Organization, error) {
	o, err := s.repo.GetOrganizationByID(ctx, orgID)
	if err != nil {
		return nil, err
	}
	if userID != uuid.Nil {
		if m, err := s.repo.GetOrgMember(ctx, orgID, userID); err == nil {
			o.MemberRole = m.Role
		}
	}
	return o, nil
}

func (s *workspaceService) ListOrganizationsForUser(ctx context.Context, userID uuid.UUID) ([]domain.Organization, error) {
	return s.repo.GetOrganizationsForUser(ctx, userID)
}

func (s *workspaceService) UpdateOrganization(ctx context.Context, orgID uuid.UUID, name, description, avatarURL string) (*domain.Organization, error) {
	o, err := s.repo.GetOrganizationByID(ctx, orgID)
	if err != nil {
		return nil, err
	}
	if name != "" {
		o.Name = name
	}
	if description != "" {
		o.Description = &description
	}
	if avatarURL != "" {
		o.AvatarURL = &avatarURL
	}
	if err := s.repo.UpdateOrganization(ctx, o); err != nil {
		return nil, err
	}
	return o, nil
}

func (s *workspaceService) DeleteOrganization(ctx context.Context, orgID, userID uuid.UUID) error {
	o, err := s.repo.GetOrganizationByID(ctx, orgID)
	if err != nil {
		return err
	}
	if o.OwnerID != userID {
		return domain.ErrNotOwner
	}
	return s.repo.DeleteOrganization(ctx, orgID)
}

// ─── Organization members ──────────────────────────────────────────────────────

func (s *workspaceService) AddOrgMember(ctx context.Context, orgID, userID, invitedBy uuid.UUID, role domain.MemberRole) (*domain.OrgMember, error) {
	now := time.Now()
	m := &domain.OrgMember{
		ID:        uuid.New(),
		OrgID:     orgID,
		UserID:    userID,
		Role:      role,
		InvitedBy: &invitedBy,
		JoinedAt:  now,
		CreatedAt: now,
	}
	if err := s.repo.AddOrgMember(ctx, m); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *workspaceService) GetOrgMember(ctx context.Context, orgID, userID uuid.UUID) (*domain.OrgMember, error) {
	return s.repo.GetOrgMember(ctx, orgID, userID)
}

func (s *workspaceService) RemoveOrgMember(ctx context.Context, orgID, userID uuid.UUID) error {
	o, err := s.repo.GetOrganizationByID(ctx, orgID)
	if err != nil {
		return err
	}
	if o.OwnerID == userID {
		return domain.ErrCannotRemoveOwner
	}
	return s.repo.RemoveOrgMember(ctx, orgID, userID)
}

func (s *workspaceService) UpdateOrgMemberRole(ctx context.Context, orgID, userID uuid.UUID, role domain.MemberRole) (*domain.OrgMember, error) {
	if err := s.repo.UpdateOrgMemberRole(ctx, orgID, userID, role); err != nil {
		return nil, err
	}
	return s.repo.GetOrgMember(ctx, orgID, userID)
}

func (s *workspaceService) ListOrgMembers(ctx context.Context, orgID uuid.UUID) ([]domain.OrgMember, error) {
	return s.repo.ListOrgMembers(ctx, orgID)
}

func (s *workspaceService) CountOrgSeats(ctx context.Context, orgID uuid.UUID) (int, error) {
	return s.repo.CountOrgSeats(ctx, orgID)
}

// ─── Organization invites ──────────────────────────────────────────────────────

func (s *workspaceService) InviteOrgMember(ctx context.Context, orgID uuid.UUID, email string, role domain.InviteRole, invitedBy uuid.UUID) (string, error) {
	token, err := generateToken()
	if err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}

	now := time.Now()
	inv := &domain.OrgInvite{
		ID:        uuid.New(),
		OrgID:     orgID,
		Email:     email,
		Role:      role,
		Token:     token,
		InvitedBy: invitedBy,
		ExpiresAt: now.Add(7 * 24 * time.Hour), // 7 days
		CreatedAt: now,
	}
	if err := s.repo.CreateOrgInvite(ctx, inv); err != nil {
		return "", err
	}
	return token, nil
}

func (s *workspaceService) AcceptOrgInvite(ctx context.Context, token string, userID uuid.UUID) (*domain.Organization, error) {
	inv, err := s.repo.GetOrgInviteByToken(ctx, token)
	if err != nil {
		return nil, err
	}
	if inv.AcceptedAt != nil || inv.DeclinedAt != nil {
		return nil, domain.ErrInviteAlreadyUsed
	}
	if time.Now().After(inv.ExpiresAt) {
		return nil, domain.ErrInviteExpired
	}

	if _, err := s.AddOrgMember(ctx, inv.OrgID, userID, inv.InvitedBy, domain.MemberRole(inv.Role)); err != nil {
		if err != domain.ErrMemberAlreadyExists {
			return nil, err
		}
	}

	if err := s.repo.MarkOrgInviteAccepted(ctx, token); err != nil {
		return nil, err
	}

	return s.GetOrganization(ctx, inv.OrgID, userID)
}

func (s *workspaceService) DeclineOrgInvite(ctx context.Context, token string) error {
	return s.repo.MarkOrgInviteDeclined(ctx, token)
}
