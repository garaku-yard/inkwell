package service

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"inkwell/server/internal/notifications/domain"
	"inkwell/server/internal/notifications/repository"
	"inkwell/server/pkg/events"
)

// DefaultListLimit / MaxListLimit bound a ListNotifications page.
const (
	DefaultListLimit = 50
	MaxListLimit     = 100
)

// NotificationService is the business layer for the notifications service.
type NotificationService interface {
	// GetPreferences returns a user's saved preferences, or the all-on
	// defaults when none are stored. It never returns ErrPreferencesNotFound.
	GetPreferences(ctx context.Context, userID uuid.UUID) (*domain.Preferences, error)
	// UpdatePreferences upserts the full preference set and returns the stored row.
	UpdatePreferences(ctx context.Context, p *domain.Preferences) (*domain.Preferences, error)

	// ListNotifications returns a page of the user's feed (newest first) plus
	// the total unread count. limit is clamped to [1, MaxListLimit].
	ListNotifications(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.Notification, int, error)
	// MarkRead marks one notification read (scoped to the owner).
	MarkRead(ctx context.Context, userID, id uuid.UUID) error
	// MarkAllRead marks every unread notification read for the user.
	MarkAllRead(ctx context.Context, userID uuid.UUID) error
	// UnreadCount returns the user's unread total.
	UnreadCount(ctx context.Context, userID uuid.UUID) (int, error)

	// Process turns a consumed domain event into deliveries (currently in-app
	// notifications, respecting the recipient's preferences). It is idempotent:
	// a repeat of the same logical event is a no-op. Unknown event types are
	// ignored. This is the Kafka consumer's entry point.
	Process(ctx context.Context, evt events.Event) error
}

type notificationService struct {
	repo repository.NotificationRepository
}

// NewNotificationService builds a NotificationService over the given repository.
func NewNotificationService(repo repository.NotificationRepository) NotificationService {
	return &notificationService{repo: repo}
}

func (s *notificationService) GetPreferences(ctx context.Context, userID uuid.UUID) (*domain.Preferences, error) {
	p, err := s.repo.GetPreferences(ctx, userID)
	if err != nil {
		if errors.Is(err, domain.ErrPreferencesNotFound) {
			def := domain.DefaultPreferences(userID)
			return &def, nil
		}
		return nil, err
	}
	return p, nil
}

func (s *notificationService) UpdatePreferences(ctx context.Context, p *domain.Preferences) (*domain.Preferences, error) {
	if err := s.repo.UpsertPreferences(ctx, p); err != nil {
		return nil, err
	}
	return s.repo.GetPreferences(ctx, p.UserID)
}

func (s *notificationService) ListNotifications(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.Notification, int, error) {
	if limit <= 0 {
		limit = DefaultListLimit
	}
	if limit > MaxListLimit {
		limit = MaxListLimit
	}
	if offset < 0 {
		offset = 0
	}
	items, err := s.repo.ListNotifications(ctx, userID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	unread, err := s.repo.CountUnread(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	return items, unread, nil
}

func (s *notificationService) MarkRead(ctx context.Context, userID, id uuid.UUID) error {
	return s.repo.MarkRead(ctx, userID, id)
}

func (s *notificationService) MarkAllRead(ctx context.Context, userID uuid.UUID) error {
	return s.repo.MarkAllRead(ctx, userID)
}

func (s *notificationService) UnreadCount(ctx context.Context, userID uuid.UUID) (int, error) {
	return s.repo.CountUnread(ctx, userID)
}
