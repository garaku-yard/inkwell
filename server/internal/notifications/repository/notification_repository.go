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

	// CreateNotificationIfNew records a delivery under dedupKey and inserts the
	// notification in one transaction. It reports created=false (and inserts
	// nothing) when dedupKey was already recorded, making redelivery a no-op.
	CreateNotificationIfNew(ctx context.Context, n *domain.Notification, dedupKey string) (created bool, err error)
	// ListNotifications returns a page of a user's feed, newest first.
	ListNotifications(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.Notification, error)
	// CountUnread returns the number of unread notifications for a user.
	CountUnread(ctx context.Context, userID uuid.UUID) (int, error)
	// MarkRead marks one notification read, scoped to its owner.
	MarkRead(ctx context.Context, userID, id uuid.UUID) error
	// MarkAllRead marks every unread notification read for a user.
	MarkAllRead(ctx context.Context, userID uuid.UUID) error
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

// ─── In-app feed ───────────────────────────────────────────────────────────

func (r *postgresNotificationRepository) CreateNotificationIfNew(ctx context.Context, n *domain.Notification, dedupKey string) (bool, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return false, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck // no-op after a successful Commit

	// Claim the dedup key first. ON CONFLICT DO NOTHING means a second copy of
	// the same logical event (inline + outbox publish, or Kafka redelivery)
	// affects zero rows and we skip the insert entirely.
	res, err := tx.ExecContext(ctx,
		`INSERT INTO delivery_log (dedup_key) VALUES ($1) ON CONFLICT (dedup_key) DO NOTHING`,
		dedupKey,
	)
	if err != nil {
		return false, fmt.Errorf("claim dedup key: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("dedup rows affected: %w", err)
	}
	if affected == 0 {
		return false, nil // already delivered
	}

	if n.ID == uuid.Nil {
		n.ID = uuid.New()
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO notifications (id, user_id, type, title, body, link)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		n.ID, n.UserID, n.Type, n.Title, n.Body, n.Link,
	)
	if err != nil {
		return false, fmt.Errorf("insert notification: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return false, fmt.Errorf("commit notification: %w", err)
	}
	return true, nil
}

func (r *postgresNotificationRepository) ListNotifications(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.Notification, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, user_id, type, title, body, COALESCE(link, ''), read_at, created_at
		FROM notifications
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`,
		userID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("list notifications: %w", err)
	}
	defer rows.Close()

	var out []domain.Notification
	for rows.Next() {
		var n domain.Notification
		if err := rows.Scan(&n.ID, &n.UserID, &n.Type, &n.Title, &n.Body, &n.Link, &n.ReadAt, &n.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan notification: %w", err)
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (r *postgresNotificationRepository) CountUnread(ctx context.Context, userID uuid.UUID) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL`, userID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count unread: %w", err)
	}
	return count, nil
}

func (r *postgresNotificationRepository) MarkRead(ctx context.Context, userID, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
		id, userID,
	)
	if err != nil {
		return fmt.Errorf("mark read: %w", err)
	}
	return nil
}

func (r *postgresNotificationRepository) MarkAllRead(ctx context.Context, userID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`, userID,
	)
	if err != nil {
		return fmt.Errorf("mark all read: %w", err)
	}
	return nil
}
