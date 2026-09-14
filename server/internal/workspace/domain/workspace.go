package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// ─── Errors ───────────────────────────────────────────────────────────────────

var (
	ErrWorkspaceNotFound   = errors.New("workspace not found")
	ErrWorkspaceSlugTaken  = errors.New("workspace slug already taken")
	ErrCategoryNotFound    = errors.New("category not found")
	ErrMemberNotFound      = errors.New("member not found")
	ErrMemberAlreadyExists = errors.New("member already exists in workspace")
	ErrInviteNotFound      = errors.New("invite not found")
	ErrInviteExpired       = errors.New("invite has expired")
	ErrInviteAlreadyUsed   = errors.New("invite has already been used")
	ErrNotOwner            = errors.New("only the owner can perform this action")
	ErrCannotRemoveOwner   = errors.New("cannot remove the workspace owner")
	ErrInvalidInput        = errors.New("invalid workspace input")
)

// ─── Enums ────────────────────────────────────────────────────────────────────

type WorkspaceType string

const (
	WorkspaceTypePersonal WorkspaceType = "personal"
	WorkspaceTypeOrg      WorkspaceType = "org"
)

type MemberRole string

const (
	MemberRoleOwner  MemberRole = "owner"
	MemberRoleAdmin  MemberRole = "admin"
	MemberRoleEditor MemberRole = "editor"
	MemberRoleViewer MemberRole = "viewer"
)

type InviteRole string

const (
	InviteRoleAdmin  InviteRole = "admin"
	InviteRoleEditor InviteRole = "editor"
	InviteRoleViewer InviteRole = "viewer"
)

// ─── Domain Models ────────────────────────────────────────────────────────────

type Category struct {
	ID          uuid.UUID `db:"id"`
	Slug        string    `db:"slug"`
	Name        string    `db:"name"`
	Description string    `db:"description"`
	Icon        string    `db:"icon"`
	CreatedAt   time.Time `db:"created_at"`
}

type Workspace struct {
	ID          uuid.UUID     `db:"id"`
	Name        string        `db:"name"`
	Slug        string        `db:"slug"`
	Type        WorkspaceType `db:"type"`
	OwnerID     uuid.UUID     `db:"owner_id"`
	AvatarURL   *string       `db:"avatar_url"`
	Description *string       `db:"description"`
	Categories  []Category
	CreatedAt   time.Time `db:"created_at"`
	UpdatedAt   time.Time `db:"updated_at"`
}

type WorkspaceMember struct {
	ID          uuid.UUID  `db:"id"`
	WorkspaceID uuid.UUID  `db:"workspace_id"`
	UserID      uuid.UUID  `db:"user_id"`
	Role        MemberRole `db:"role"`
	InvitedBy   *uuid.UUID `db:"invited_by"`
	JoinedAt    time.Time  `db:"joined_at"`
	CreatedAt   time.Time  `db:"created_at"`
}

type WorkspaceInvite struct {
	ID          uuid.UUID  `db:"id"`
	WorkspaceID uuid.UUID  `db:"workspace_id"`
	Email       string     `db:"email"`
	Role        InviteRole `db:"role"`
	Token       string     `db:"token"`
	InvitedBy   uuid.UUID  `db:"invited_by"`
	ExpiresAt   time.Time  `db:"expires_at"`
	AcceptedAt  *time.Time `db:"accepted_at"`
	DeclinedAt  *time.Time `db:"declined_at"`
	CreatedAt   time.Time  `db:"created_at"`
}
