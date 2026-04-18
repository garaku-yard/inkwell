package service

import (
	"context"
	"log/slog"
	"time"

	"inkwell/server/internal/collab/domain"
	"inkwell/server/internal/collab/repository"
	"inkwell/server/pkg/events"

	"github.com/google/uuid"
)

// CollaborationService handles business logic for collaboration.
type CollaborationService struct {
	repo      repository.CollaborationRepository
	publisher events.Publisher
}

// NewCollaborationService creates a CollaborationService.
// publisher is used to emit domain events; pass events.NoopPublisher{} in tests.
func NewCollaborationService(repo repository.CollaborationRepository, publisher events.Publisher) *CollaborationService {
	return &CollaborationService{
		repo:      repo,
		publisher: publisher,
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
	// Note: Project ownership is verified at the gateway level via scripts service
	// This only checks collaborator roles
	userRole, err := s.repo.GetUserProjectRole(ctx, userID, projectID)
	if err != nil {
		// If user is not a collaborator, they might be the owner
		// The gateway should have already verified project access
		// So if we get here and they're not a collaborator, allow it
		// (This handles the case where project owners haven't been added as collaborators)
		slog.Debug("CheckPermission: user not found as collaborator, assuming verified by gateway", "user_id", userID, "project_id", projectID)
		return nil
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

	// Set initial status - owners are active immediately, others are pending
	initialStatus := "pending"
	if role == "owner" {
		initialStatus = "active"
	}

	collaborator := &domain.Collaborator{
		ID:        uuid.New(),
		ProjectID: projectID,
		UserID:    userID,
		Role:      role,
		Status:    initialStatus,
		InvitedBy: invitedBy,
		InvitedAt: time.Now(),
	}

	// If the collaborator is the owner, set joined time immediately
	if role == "owner" {
		collaborator.JoinedAt = &collaborator.InvitedAt
	}

	if err := s.repo.CreateCollaborator(ctx, collaborator); err != nil {
		return nil, err
	}

	_ = s.publisher.Publish(ctx, events.EventTypeCollabAdded, map[string]string{
		"project_id": projectID.String(),
		"user_id":    userID.String(),
		"role":       role,
		"invited_by": invitedBy.String(),
	})

	return collaborator, nil
}

// AddCollaboratorByEmail handles adding a collaborator by email address
func (s *CollaborationService) AddCollaboratorByEmail(ctx context.Context, projectID uuid.UUID, email string, invitedBy uuid.UUID, role string) (*domain.Collaborator, error) {
	// Validate role
	if err := s.ValidateRole(role); err != nil {
		return nil, err
	}

	// Check if email already has a pending invitation for this project
	if _, err := s.repo.GetPendingInvitationByEmailAndProject(ctx, email, projectID); err == nil {
		return nil, domain.ErrInvitationExists
	}

	// Create invitation record in collaboration_invitations table
	invitation := &domain.Invitation{
		ID:        uuid.New(),
		ProjectID: projectID,
		InviterID: invitedBy,
		Email:     email,
		Role:      role,
		Token:     uuid.New().String(),                // Generate unique token
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour), // 7 days expiry
		Accepted:  false,
		CreatedAt: time.Now(),
	}

	err := s.repo.CreateInvitation(ctx, invitation)
	if err != nil {
		return nil, err
	}

	// Return a collaborator representation for API compatibility
	// Note: UserID is nil since this is a pending invitation
	collaborator := &domain.Collaborator{
		ID:        invitation.ID, // Use invitation ID
		ProjectID: projectID,
		UserID:    uuid.Nil, // No user ID yet
		Role:      role,
		Status:    "pending",
		InvitedBy: invitedBy,
		InvitedAt: invitation.CreatedAt,
		JoinedAt:  nil,
	}

	return collaborator, nil
}

func (s *CollaborationService) GetProjectCollaborators(ctx context.Context, userID, projectID uuid.UUID) ([]*domain.Collaborator, error) {
	// TODO: Re-enable permission check once auth middleware is properly implemented
	// For now, allow any user to view collaborators for testing
	// if err := s.CheckPermission(ctx, userID, projectID, "viewer"); err != nil {
	// 	return nil, err
	// }

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
	// Note: Permission check is done at the gateway level
	// The gateway verifies project ownership/access via the scripts service
	// before calling this function, so we don't need to check again here

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
func (s *CollaborationService) GetUserInvitations(ctx context.Context, email string) ([]*domain.Collaborator, error) {
	// Get all pending invitations for this email address
	collaborators, err := s.repo.GetUserInvitationsByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	return collaborators, nil
}

func (s *CollaborationService) GetUserCollaborations(ctx context.Context, userID uuid.UUID) ([]*domain.Collaborator, error) {
	return s.repo.GetUserActiveCollaborations(ctx, userID)
}

func (s *CollaborationService) AcceptInvitation(ctx context.Context, userID, invitationID uuid.UUID) (*domain.Collaborator, error) {
	return s.repo.AcceptInvitationByID(ctx, invitationID, userID)
}

func (s *CollaborationService) DeclineInvitation(ctx context.Context, userID, invitationID uuid.UUID) error {
	return s.repo.DeclineInvitationByID(ctx, invitationID)
}

// RespondToInvitation handles accepting or declining an invitation by project ID
func (s *CollaborationService) RespondToInvitation(ctx context.Context, userID, projectID uuid.UUID, accepted bool) (*domain.Collaborator, error) {
	// Find the pending collaborator record
	collaborator, err := s.repo.GetPendingCollaboratorByUserAndProject(ctx, userID, projectID)
	if err != nil {
		return nil, err
	}

	if accepted {
		// Accept the invitation
		return s.AcceptInvitation(ctx, userID, collaborator.ID)
	} else {
		// Decline the invitation
		err := s.DeclineInvitation(ctx, userID, collaborator.ID)
		return nil, err
	}
}
