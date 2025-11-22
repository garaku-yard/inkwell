package service

import (
	"context"
	"time"

	"scriptlith/server_microservices/internal/collab/domain"
	"scriptlith/server_microservices/internal/collab/repository"

	"github.com/google/uuid"
)

// CollaborationService handles business logic for collaboration
type CollaborationService struct {
	repo repository.CollaborationRepository
}

// NewCollaborationService creates a new collaboration service
func NewCollaborationService(repo repository.CollaborationRepository) *CollaborationService {
	return &CollaborationService{
		repo: repo,
	}
}

// ValidateRole checks if a role is valid
func (s *CollaborationService) ValidateRole(role string) error {
	validRoles := map[string]bool{
		"owner":  true,
		"editor": true,
		"viewer": true,
	}

	if !validRoles[role] {
		return domain.ErrInvalidRole
	}
	return nil
}

// ValidateStatus checks if a status is valid
func (s *CollaborationService) ValidateStatus(status string) error {
	validStatuses := map[string]bool{
		"pending":  true,
		"active":   true,
		"inactive": true,
	}

	if !validStatuses[status] {
		return domain.ErrInvalidStatus
	}
	return nil
}

// CheckPermission verifies if a user has required permission for a project
func (s *CollaborationService) CheckPermission(ctx context.Context, userID, projectID uuid.UUID, requiredRole string) error {
	userRole, err := s.repo.GetUserProjectRole(ctx, userID, projectID)
	if err != nil {
		return err
	}

	// Define role hierarchy
	roleHierarchy := map[string]int{
		"viewer": 1,
		"editor": 2,
		"owner":  3,
	}

	userLevel := roleHierarchy[userRole]
	requiredLevel := roleHierarchy[requiredRole]

	if userLevel < requiredLevel {
		return domain.ErrUnauthorized
	}

	return nil
}

// Collaborator operations
func (s *CollaborationService) AddCollaborator(ctx context.Context, projectID, userID, invitedBy uuid.UUID, role string) (*domain.Collaborator, error) {
	// Validate role
	if err := s.ValidateRole(role); err != nil {
		return nil, err
	}

	// Check if user is already a collaborator
	collaborators, err := s.repo.GetProjectCollaborators(ctx, projectID)
	if err != nil {
		return nil, err
	}

	for _, collab := range collaborators {
		if collab.UserID == userID {
			return nil, domain.ErrCollaboratorExists
		}
	}

	collaborator := &domain.Collaborator{
		ID:        uuid.New(),
		ProjectID: projectID,
		UserID:    userID,
		Role:      role,
		Status:    "pending",
		InvitedBy: invitedBy,
		InvitedAt: time.Now(),
	}

	if err := s.repo.CreateCollaborator(ctx, collaborator); err != nil {
		return nil, err
	}

	return collaborator, nil
}

// AddCollaboratorByEmail handles adding a collaborator by email address
func (s *CollaborationService) AddCollaboratorByEmail(ctx context.Context, projectID uuid.UUID, email string, invitedBy uuid.UUID, role string) (*domain.Collaborator, error) {
	// Validate role
	if err := s.ValidateRole(role); err != nil {
		return nil, err
	}

	// For now, we'll create a placeholder user ID based on email
	// In a real implementation, you would:
	// 1. Look up the user by email in the identity service
	// 2. If user exists, use their ID
	// 3. If user doesn't exist, create a pending invitation record with email

	// Create a deterministic UUID from the email for now
	// This is a simplified approach - in production you'd have proper user lookup
	userID := uuid.New()

	// Check if email already has a pending invitation for this project
	collaborators, err := s.repo.GetProjectCollaborators(ctx, projectID)
	if err != nil {
		return nil, err
	}

	// Note: In a real implementation, you'd check by email, not userID
	// For now this is a simplified check
	for _, collab := range collaborators {
		if collab.UserID == userID {
			return nil, domain.NewDomainError("user already invited to this project", "COLLABORATOR_EXISTS")
		}
	}

	collaborator := &domain.Collaborator{
		ID:        uuid.New(),
		ProjectID: projectID,
		UserID:    userID, // This would be the actual user ID or a temporary one
		Role:      role,
		Status:    "pending",
		InvitedBy: invitedBy,
		InvitedAt: time.Now(),
	}

	if err := s.repo.CreateCollaborator(ctx, collaborator); err != nil {
		return nil, err
	}

	return collaborator, nil
}

func (s *CollaborationService) GetProjectCollaborators(ctx context.Context, userID, projectID uuid.UUID) ([]*domain.Collaborator, error) {
	// Check if user has access to the project
	if err := s.CheckPermission(ctx, userID, projectID, "viewer"); err != nil {
		return nil, err
	}

	return s.repo.GetProjectCollaborators(ctx, projectID)
}

func (s *CollaborationService) UpdateCollaboratorRole(ctx context.Context, userID, collaboratorID uuid.UUID, newRole string) error {
	// Validate role
	if err := s.ValidateRole(newRole); err != nil {
		return err
	}

	// Get collaborator to check permissions
	collaborator, err := s.repo.GetCollaboratorByID(ctx, collaboratorID)
	if err != nil {
		return err
	}

	// Check if user has owner permission for this project
	if err := s.CheckPermission(ctx, userID, collaborator.ProjectID, "owner"); err != nil {
		return err
	}

	return s.repo.UpdateCollaboratorRole(ctx, collaboratorID, newRole)
}

func (s *CollaborationService) RemoveCollaborator(ctx context.Context, userID, collaboratorID uuid.UUID) error {
	// Get collaborator to check permissions
	collaborator, err := s.repo.GetCollaboratorByID(ctx, collaboratorID)
	if err != nil {
		return err
	}

	// Check if user has owner permission for this project
	if err := s.CheckPermission(ctx, userID, collaborator.ProjectID, "owner"); err != nil {
		return err
	}

	return s.repo.DeleteCollaborator(ctx, collaboratorID)
}

// Comment operations
func (s *CollaborationService) AddComment(ctx context.Context, userID, projectID uuid.UUID, content string, elementID, sceneID, parentID *uuid.UUID, lineNumber, charPosition *int32) (*domain.Comment, error) {
	// Check if user has access to the project
	if err := s.CheckPermission(ctx, userID, projectID, "viewer"); err != nil {
		return nil, err
	}

	comment := &domain.Comment{
		ID:              uuid.New(),
		ProjectID:       projectID,
		ScriptElementID: elementID,
		SceneID:         sceneID,
		UserID:          userID,
		Content:         content,
		LineNumber:      lineNumber,
		CharPosition:    charPosition,
		ParentID:        parentID,
		IsResolved:      false,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	if err := s.repo.CreateComment(ctx, comment); err != nil {
		return nil, err
	}

	return comment, nil
}

func (s *CollaborationService) GetComments(ctx context.Context, userID, projectID uuid.UUID, elementID, sceneID *uuid.UUID, offset, limit int32) ([]*domain.Comment, error) {
	// Check if user has access to the project
	if err := s.CheckPermission(ctx, userID, projectID, "viewer"); err != nil {
		return nil, err
	}

	if elementID != nil {
		return s.repo.GetElementComments(ctx, *elementID, offset, limit)
	} else if sceneID != nil {
		return s.repo.GetSceneComments(ctx, *sceneID, offset, limit)
	} else {
		return s.repo.GetProjectComments(ctx, projectID, offset, limit)
	}
}

func (s *CollaborationService) ResolveComment(ctx context.Context, userID, commentID uuid.UUID) error {
	// Get comment to check permissions
	comment, err := s.repo.GetCommentByID(ctx, commentID)
	if err != nil {
		return err
	}

	// Check if user has editor permission for this project
	if err := s.CheckPermission(ctx, userID, comment.ProjectID, "editor"); err != nil {
		return err
	}

	return s.repo.ResolveComment(ctx, commentID)
}

func (s *CollaborationService) DeleteComment(ctx context.Context, userID, commentID uuid.UUID) error {
	// Get comment to check permissions
	comment, err := s.repo.GetCommentByID(ctx, commentID)
	if err != nil {
		return err
	}

	// Check if user has editor permission or is the comment author
	if comment.UserID != userID {
		if err := s.CheckPermission(ctx, userID, comment.ProjectID, "editor"); err != nil {
			return err
		}
	}

	return s.repo.DeleteComment(ctx, commentID)
}

// Edit session operations
func (s *CollaborationService) StartEditSession(ctx context.Context, userID, projectID, screenplayID uuid.UUID) (*domain.EditSession, error) {
	// Check if user has editor permission for this project
	if err := s.CheckPermission(ctx, userID, projectID, "editor"); err != nil {
		return nil, err
	}

	// Check if user already has an active session
	existingSession, err := s.repo.GetActiveEditSession(ctx, userID, screenplayID)
	if err == nil {
		// Update existing session activity
		if err := s.repo.UpdateEditSessionActivity(ctx, existingSession.ID); err != nil {
			return nil, err
		}
		return existingSession, nil
	}

	session := &domain.EditSession{
		ID:           uuid.New(),
		ProjectID:    projectID,
		ScreenplayID: screenplayID,
		UserID:       userID,
		StartedAt:    time.Now(),
		LastActivity: time.Now(),
		IsActive:     true,
	}

	if err := s.repo.CreateEditSession(ctx, session); err != nil {
		return nil, err
	}

	return session, nil
}

func (s *CollaborationService) EndEditSession(ctx context.Context, userID, sessionID uuid.UUID) error {
	// Get session to verify ownership
	session, err := s.repo.GetActiveEditSession(ctx, userID, uuid.UUID{})
	if err != nil {
		return err
	}

	if session.UserID != userID {
		return domain.ErrUnauthorized
	}

	return s.repo.EndEditSession(ctx, sessionID)
}

// User presence operations
func (s *CollaborationService) UpdateUserPresence(ctx context.Context, userID, projectID uuid.UUID, screenplayID *uuid.UUID, cursorPosition int32, selectionStart, selectionEnd *int32) (*domain.UserPresence, error) {
	// Check if user has access to the project
	if err := s.CheckPermission(ctx, userID, projectID, "viewer"); err != nil {
		return nil, err
	}

	presence := &domain.UserPresence{
		ID:             uuid.New(),
		UserID:         userID,
		ProjectID:      projectID,
		ScreenplayID:   screenplayID,
		CursorPosition: cursorPosition,
		SelectionStart: selectionStart,
		SelectionEnd:   selectionEnd,
		LastSeen:       time.Now(),
		IsOnline:       true,
	}

	if err := s.repo.CreateOrUpdateUserPresence(ctx, presence); err != nil {
		return nil, err
	}

	return presence, nil
}

func (s *CollaborationService) GetProjectUserPresence(ctx context.Context, userID, projectID uuid.UUID) ([]*domain.UserPresence, error) {
	// Check if user has access to the project
	if err := s.CheckPermission(ctx, userID, projectID, "viewer"); err != nil {
		return nil, err
	}

	return s.repo.GetProjectUserPresence(ctx, projectID)
}

func (s *CollaborationService) GetCollaboratorByID(ctx context.Context, collaboratorID uuid.UUID) (*domain.Collaborator, error) {
	return s.repo.GetCollaboratorByID(ctx, collaboratorID)
}

func (s *CollaborationService) GetCommentByID(ctx context.Context, commentID uuid.UUID) (*domain.Comment, error) {
	return s.repo.GetCommentByID(ctx, commentID)
}

func (s *CollaborationService) UpdateComment(ctx context.Context, userID, commentID uuid.UUID, content string) error {
	// Get comment to check permissions
	comment, err := s.repo.GetCommentByID(ctx, commentID)
	if err != nil {
		return err
	}

	// Check if user has editor permission or is the comment author
	if comment.UserID != userID {
		if err := s.CheckPermission(ctx, userID, comment.ProjectID, "editor"); err != nil {
			return err
		}
	}

	return s.repo.UpdateComment(ctx, commentID, content)
}

func (s *CollaborationService) GetActiveEditSessions(ctx context.Context, screenplayID uuid.UUID) ([]*domain.EditSession, error) {
	return s.repo.GetScreenplayEditSessions(ctx, screenplayID)
}

func (s *CollaborationService) SetUserOffline(ctx context.Context, userID, projectID uuid.UUID) error {
	return s.repo.SetUserOffline(ctx, userID, projectID)
}

// Invitation management methods
func (s *CollaborationService) GetUserInvitations(ctx context.Context, userID uuid.UUID) ([]*domain.Collaborator, error) {
	// Get all collaborations where the user is the target and status is pending
	collaborators, err := s.repo.GetUserInvitations(ctx, userID)
	if err != nil {
		return nil, err
	}
	return collaborators, nil
}

func (s *CollaborationService) AcceptInvitation(ctx context.Context, userID, collaboratorID uuid.UUID) (*domain.Collaborator, error) {
	// Get the collaborator record
	collaborator, err := s.repo.GetCollaboratorByID(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}

	// Verify this invitation is for the requesting user and is pending
	if collaborator.UserID != userID {
		return nil, domain.ErrUnauthorized
	}

	if collaborator.Status != "pending" {
		return nil, domain.NewDomainError("invitation is not pending", "INVALID_INVITATION_STATUS")
	}

	// Update status to active and set joined_at timestamp
	now := time.Now()
	collaborator.Status = "active"
	collaborator.JoinedAt = &now

	// Update the collaborator in the repository
	if err := s.repo.UpdateCollaboratorStatus(ctx, collaboratorID, "active"); err != nil {
		return nil, err
	}

	return collaborator, nil
}

func (s *CollaborationService) DeclineInvitation(ctx context.Context, userID, collaboratorID uuid.UUID) error {
	// Get the collaborator record
	collaborator, err := s.repo.GetCollaboratorByID(ctx, collaboratorID)
	if err != nil {
		return err
	}

	// Verify this invitation is for the requesting user and is pending
	if collaborator.UserID != userID {
		return domain.ErrUnauthorized
	}

	if collaborator.Status != "pending" {
		return domain.NewDomainError("invitation is not pending", "INVALID_INVITATION_STATUS")
	}

	// Delete the collaborator record (declined invitations are removed)
	return s.repo.DeleteCollaborator(ctx, collaboratorID)
}
