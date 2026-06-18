package service

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"inkwell/server/internal/notifications/domain"
	"inkwell/server/internal/notifications/repository"
)

// NotificationService is the business layer for the notifications service.
type NotificationService interface {
	// GetPreferences returns a user's saved preferences, or the all-on
	// defaults when none are stored. It never returns ErrPreferencesNotFound.
	GetPreferences(ctx context.Context, userID uuid.UUID) (*domain.Preferences, error)
	// UpdatePreferences upserts the full preference set and returns the stored row.
	UpdatePreferences(ctx context.Context, p *domain.Preferences) (*domain.Preferences, error)
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
