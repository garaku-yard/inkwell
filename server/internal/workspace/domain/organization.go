package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// ─── Errors ───────────────────────────────────────────────────────────────────

var (
	ErrOrgNotFound  = errors.New("organization not found")
	ErrOrgSlugTaken = errors.New("organization slug already taken")
)

// ─── Domain Models ────────────────────────────────────────────────────────────

// Organization is a first-class team entity, distinct from a personal
// workspace. It owns projects directly and bills its own seats. Members are
// personal accounts linked through OrgMember rows (MemberRole / InviteRole are
// shared with the workspace member vocabulary).
type Organization struct {
	ID          uuid.UUID `db:"id"`
	Name        string    `db:"name"`
	Slug        string    `db:"slug"`
	OwnerID     uuid.UUID `db:"owner_id"`
	AvatarURL   *string   `db:"avatar_url"`
	Description *string   `db:"description"`
	// MemberRole is the requesting user's role in this org. It is contextual —
	// populated by user-scoped reads (list / get-for-user) — and never persisted
	// on the organizations row.
	MemberRole MemberRole
	CreatedAt  time.Time `db:"created_at"`
	UpdatedAt  time.Time `db:"updated_at"`
}

type OrgMember struct {
	ID        uuid.UUID  `db:"id"`
	OrgID     uuid.UUID  `db:"org_id"`
	UserID    uuid.UUID  `db:"user_id"`
	Role      MemberRole `db:"role"`
	InvitedBy *uuid.UUID `db:"invited_by"`
	JoinedAt  time.Time  `db:"joined_at"`
	CreatedAt time.Time  `db:"created_at"`
}

// IncomingOrgInvite is a pending invite addressed to a user, enriched with the
// org's name for display in the invitee's invitations inbox.
type IncomingOrgInvite struct {
	Token   string
	OrgID   uuid.UUID
	OrgName string
	Role    InviteRole
}

type OrgInvite struct {
	ID         uuid.UUID  `db:"id"`
	OrgID      uuid.UUID  `db:"org_id"`
	Email      string     `db:"email"`
	Role       InviteRole `db:"role"`
	Token      string     `db:"token"`
	InvitedBy  uuid.UUID  `db:"invited_by"`
	ExpiresAt  time.Time  `db:"expires_at"`
	AcceptedAt *time.Time `db:"accepted_at"`
	DeclinedAt *time.Time `db:"declined_at"`
	CreatedAt  time.Time  `db:"created_at"`
}
