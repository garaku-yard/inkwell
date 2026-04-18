package repository

import (
	"context"
	"inkwell/server/internal/collab/domain"

	"github.com/google/uuid"
)

// CollaborationRepository defines the interface for collaboration data access
type CollaborationRepository interface {
	// Collaborator operations
	CreateCollaborator(ctx context.Context, collaborator *domain.Collaborator) error
	GetCollaboratorByID(ctx context.Context, id uuid.UUID) (*domain.Collaborator, error)
	GetPendingCollaboratorByUserAndProject(ctx context.Context, userID, projectID uuid.UUID) (*domain.Collaborator, error)
	GetProjectCollaborators(ctx context.Context, projectID uuid.UUID) ([]*domain.Collaborator, error)
	GetUserInvitations(ctx context.Context, userID uuid.UUID) ([]*domain.Collaborator, error)
	GetUserInvitationsByEmail(ctx context.Context, email string) ([]*domain.Collaborator, error)
	GetUserActiveCollaborations(ctx context.Context, userID uuid.UUID) ([]*domain.Collaborator, error)
	UpdateCollaboratorStatus(ctx context.Context, id uuid.UUID, status string) error
	UpdateCollaboratorRole(ctx context.Context, id uuid.UUID, role string) error
	DeleteCollaborator(ctx context.Context, id uuid.UUID) error
	GetUserProjectRole(ctx context.Context, userID, projectID uuid.UUID) (string, error)
	IsProjectOwner(ctx context.Context, userID, projectID uuid.UUID) (bool, error)

	// Invitation operations
	CreateInvitation(ctx context.Context, invitation *domain.Invitation) error
	GetInvitationByID(ctx context.Context, id uuid.UUID) (*domain.Invitation, error)
	GetPendingInvitationByEmailAndProject(ctx context.Context, email string, projectID uuid.UUID) (*domain.Invitation, error)
	AcceptInvitationByID(ctx context.Context, invitationID uuid.UUID, userID uuid.UUID) (*domain.Collaborator, error)
	DeclineInvitationByID(ctx context.Context, invitationID uuid.UUID) error

	// Comment operations
	CreateComment(ctx context.Context, comment *domain.Comment) error
	GetCommentByID(ctx context.Context, id uuid.UUID) (*domain.Comment, error)
	GetProjectComments(ctx context.Context, projectID uuid.UUID, offset, limit int32) ([]*domain.Comment, error)
	GetElementComments(ctx context.Context, elementID uuid.UUID, offset, limit int32) ([]*domain.Comment, error)
	GetSceneComments(ctx context.Context, sceneID uuid.UUID, offset, limit int32) ([]*domain.Comment, error)
	UpdateComment(ctx context.Context, id uuid.UUID, content string) error
	ResolveComment(ctx context.Context, id uuid.UUID) error
	DeleteComment(ctx context.Context, id uuid.UUID) error

	// Edit session operations
	CreateEditSession(ctx context.Context, session *domain.EditSession) error
	GetActiveEditSession(ctx context.Context, userID, screenplayID uuid.UUID) (*domain.EditSession, error)
	GetScreenplayEditSessions(ctx context.Context, screenplayID uuid.UUID) ([]*domain.EditSession, error)
	UpdateEditSessionActivity(ctx context.Context, sessionID uuid.UUID) error
	EndEditSession(ctx context.Context, sessionID uuid.UUID) error

	// Edit operation operations
	CreateEditOperation(ctx context.Context, operation *domain.EditOperation) error
	GetSessionOperations(ctx context.Context, sessionID uuid.UUID, offset, limit int32) ([]*domain.EditOperation, error)

	// User presence operations
	CreateOrUpdateUserPresence(ctx context.Context, presence *domain.UserPresence) error
	GetProjectUserPresence(ctx context.Context, projectID uuid.UUID) ([]*domain.UserPresence, error)
	GetUserPresenceByID(ctx context.Context, userID, projectID uuid.UUID) (*domain.UserPresence, error)
	UpdateUserPresence(ctx context.Context, userID, projectID uuid.UUID, presence *domain.UserPresence) error
	SetUserOffline(ctx context.Context, userID, projectID uuid.UUID) error
}
