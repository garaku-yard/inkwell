package repository

import (
	"context"
	"database/sql"
	"time"

	"inkwell/server/internal/collab/domain"

	"github.com/google/uuid"
)

// CollaborationRepository defines the interface for collaboration data access
type CollaborationRepository interface {
	// Collaborator operations
	CreateCollaborator(ctx context.Context, collaborator *domain.Collaborator) error
	// CreateCollaboratorTx inserts a collaborator inside the given
	// transaction, used by the service layer to atomically commit the
	// row and its `collab.added` outbox event.
	CreateCollaboratorTx(ctx context.Context, tx *sql.Tx, collaborator *domain.Collaborator) error
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
	CountPendingProjectInvitations(ctx context.Context, projectID uuid.UUID) (int, error)
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

	// Edit session operations (durable advisory locks). A session is active
	// while its ended_at is NULL; reads filter out sessions whose last activity
	// is older than a caller-supplied staleness window so a crashed client that
	// never wrote ended_at doesn't linger as a phantom lock. All timestamps use
	// the database clock (NOW()) so comparisons never mix Go-local and DB time.
	CreateEditSession(ctx context.Context, session *domain.EditSession) error
	GetActiveEditSessionForUser(ctx context.Context, projectID, userID uuid.UUID) (*domain.EditSession, error)
	ListActiveProjectEditSessions(ctx context.Context, projectID uuid.UUID, staleAfter time.Duration) ([]*domain.EditSession, error)
	UpdateEditSessionFocus(ctx context.Context, sessionID uuid.UUID, elementID uuid.NullUUID) error
	EndEditSession(ctx context.Context, sessionID uuid.UUID) error
	SweepStaleEditSessions(ctx context.Context, staleAfter time.Duration) (int64, error)

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
