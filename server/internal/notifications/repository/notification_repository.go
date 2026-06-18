package repository

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"

	"inkwell/server/internal/notifications/domain"
)

// NotificationRepository is the persistence boundary for the notifications
// service. Phase 1 covers preferences only; the in-app feed lands in a later
// migration and extends this interface.
type NotificationRepository interface {
	// GetPreferences returns the saved preferences for a user, or
	// domain.ErrPreferencesNotFound when no row exists.
	GetPreferences(ctx context.Context, userID uuid.UUID) (*domain.Preferences, error)
	// UpsertPreferences inserts or replaces a user's preference row.
	UpsertPreferences(ctx context.Context, p *domain.Preferences) error
}

type postgresNotificationRepository struct {
	db *sql.DB
}

// NewNotificationRepository builds a Postgres-backed NotificationRepository.
func NewNotificationRepository(db *sql.DB) NotificationRepository {
	return &postgresNotificationRepository{db: db}
}

func (r *postgresNotificationRepository) GetPreferences(ctx context.Context, userID uuid.UUID) (*domain.Preferences, error) {
	var p domain.Preferences
	err := r.db.QueryRowContext(ctx, `
		SELECT user_id, email_comments, email_mentions, email_project_updates,
		       email_collaborator_joins, in_app_notifications, marketing_emails,
		       product_updates, created_at, updated_at
		FROM notification_preferences WHERE user_id = $1`, userID,
	).Scan(
		&p.UserID, &p.EmailComments, &p.EmailMentions, &p.EmailProjectUpdates,
		&p.EmailCollaboratorJoins, &p.InAppNotifications, &p.MarketingEmails,
		&p.ProductUpdates, &p.CreatedAt, &p.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, domain.ErrPreferencesNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get preferences: %w", err)
	}
	return &p, nil
}

func (r *postgresNotificationRepository) UpsertPreferences(ctx context.Context, p *domain.Preferences) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO notification_preferences (
			user_id, email_comments, email_mentions, email_project_updates,
			email_collaborator_joins, in_app_notifications, marketing_emails,
			product_updates, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			email_comments           = EXCLUDED.email_comments,
			email_mentions           = EXCLUDED.email_mentions,
			email_project_updates    = EXCLUDED.email_project_updates,
			email_collaborator_joins = EXCLUDED.email_collaborator_joins,
			in_app_notifications     = EXCLUDED.in_app_notifications,
			marketing_emails         = EXCLUDED.marketing_emails,
			product_updates          = EXCLUDED.product_updates,
			updated_at               = NOW()`,
		p.UserID, p.EmailComments, p.EmailMentions, p.EmailProjectUpdates,
		p.EmailCollaboratorJoins, p.InAppNotifications, p.MarketingEmails,
		p.ProductUpdates,
	)
	if err != nil {
		return fmt.Errorf("upsert preferences: %w", err)
	}
	return nil
}
