// Package domain holds the notification service's core types and error
// sentinels. The service owns two concerns: per-user delivery preferences
// (this file) and, in later phases, the in-app notification feed.
package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// ─── Errors ───────────────────────────────────────────────────────────────────

var (
	// ErrPreferencesNotFound is returned by the repository when a user has no
	// saved preferences row. The service translates this into the all-on
	// defaults rather than surfacing it to callers.
	ErrPreferencesNotFound = errors.New("notification preferences not found")
)

// ─── Preferences ────────────────────────────────────────────────────────────

// Preferences captures a user's notification delivery choices. Each boolean
// gates one decision the delivery worker makes when consuming a domain event.
// The zero value is intentionally not the default — use DefaultPreferences.
type Preferences struct {
	UserID                 uuid.UUID `db:"user_id"`
	EmailComments          bool      `db:"email_comments"`
	EmailMentions          bool      `db:"email_mentions"`
	EmailProjectUpdates    bool      `db:"email_project_updates"`
	EmailCollaboratorJoins bool      `db:"email_collaborator_joins"`
	InAppNotifications     bool      `db:"in_app_notifications"`
	MarketingEmails        bool      `db:"marketing_emails"`
	ProductUpdates         bool      `db:"product_updates"`
	CreatedAt              time.Time `db:"created_at"`
	UpdatedAt              time.Time `db:"updated_at"`
}

// DefaultPreferences returns the preferences a user has before they ever save
// any: everything on except marketing emails. This mirrors the client's
// DEFAULTS object so a brand-new user sees the same toggles whether or not a
// row exists yet.
func DefaultPreferences(userID uuid.UUID) Preferences {
	return Preferences{
		UserID:                 userID,
		EmailComments:          true,
		EmailMentions:          true,
		EmailProjectUpdates:    true,
		EmailCollaboratorJoins: true,
		InAppNotifications:     true,
		MarketingEmails:        false,
		ProductUpdates:         true,
	}
}

// ─── In-app notifications ─────────────────────────────────────────────────────

// Notification is one row in a user's in-app notification feed. Type carries
// the source domain event so the client can branch on it; Title/Body are the
// rendered copy and Link is an optional in-app navigation target.
type Notification struct {
	ID        uuid.UUID  `db:"id"`
	UserID    uuid.UUID  `db:"user_id"`
	Type      string     `db:"type"`
	Title     string     `db:"title"`
	Body      string     `db:"body"`
	Link      string     `db:"link"`
	ReadAt    *time.Time `db:"read_at"`
	CreatedAt time.Time  `db:"created_at"`
}

// Read reports whether the notification has been marked read.
func (n *Notification) Read() bool { return n.ReadAt != nil }
