package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"inkwell/server/internal/collab/domain"
	"inkwell/server/internal/collab/repository"
	"inkwell/server/pkg/events"
	"inkwell/server/pkg/outbox"

	"github.com/google/uuid"
)

// CollaborationService handles business logic for collaboration.
type CollaborationService struct {
	db        *sql.DB
	repo      repository.CollaborationRepository
	publisher events.Publisher
	outbox    outbox.Store
}

// NewCollaborationService creates a CollaborationService.
//
// The service commits collaborator additions together with a matching
// `collab.added` outbox event in a single transaction so no event can
// be lost if the process crashes between the row insert and the inline
// Publish call. db opens transactions; store is the event store
// (typically outbox.NewPostgresStore(db, "collab_outbox")); publisher
// is the best-effort Kafka emitter the background poller falls back to.
//
// In tests, pass an in-memory outbox.Store and events.NoopPublisher{}.
func NewCollaborationService(db *sql.DB, repo repository.CollaborationRepository, publisher events.Publisher, store outbox.Store) *CollaborationService {
	return &CollaborationService{
		db:        db,
		repo:      repo,
		publisher: publisher,
		outbox:    store,
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
	if errors.Is(err, domain.ErrUnauthorized) {
		// User is not a collaborator — they might be the project owner, whose
		// access the gateway has already verified via the scripts service. Defer
		// to that check rather than denying. (Owners aren't always added as
		// collaborator rows.)
		slog.Debug("CheckPermission: user not found as collaborator, assuming verified by gateway", "user_id", userID, "project_id", projectID)
		return nil
	}
	if err != nil {
		// A real lookup failure must fail closed — never grant on error.
		return fmt.Errorf("check permission: %w", err)
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

	payload, err := json.Marshal(map[string]string{
		"project_id": projectID.String(),
		"user_id":    userID.String(),
		"role":       role,
		"invited_by": invitedBy.String(),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal collab.added payload: %w", err)
	}

	// Atomic commit: collaborator row + outbox event in one transaction.
	// The inline Publish below is a best-effort fast path; the
	// background outbox poller is the reliable channel.
	err = outbox.RunInTx(ctx, s.db, func(tx *sql.Tx) error {
		if err := s.repo.CreateCollaboratorTx(ctx, tx, collaborator); err != nil {
			return err
		}
		return s.outbox.EnqueueTx(ctx, tx, outbox.Event{
			Type:    events.EventTypeCollabAdded,
			Payload: payload,
		})
	})
	if err != nil {
		return nil, err
	}

	_ = s.publisher.Publish(ctx, events.EventTypeCollabAdded, payload)

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

	// Best-effort invitation.sent event so the notifications service emails the
	// invitee an accept link. The invitation row is already persisted, so a
	// missed email still leaves the invite visible in the invitee's inbox once
	// they sign in; we don't pay for the transactional outbox here.
	invitePayload, err := json.Marshal(map[string]string{
		"project_id": projectID.String(),
		"email":      email,
		"role":       role,
		"invited_by": invitedBy.String(),
		"token":      invitation.Token,
	})
	if err == nil {
		if perr := s.publisher.Publish(ctx, events.EventTypeCollabInvited, invitePayload); perr != nil {
			slog.Warn("collaboration.invited: publish failed (email skipped)", "error", perr)
		}
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
	if err := s.CheckPermission(ctx, userID, projectID, "viewer"); err != nil {
		return nil, err
	}

	return s.repo.GetProjectCollaborators(ctx, projectID)
}

// GetProjectSeatUsage reports how many collaborator seats a project is consuming:
// non-owner collaborator rows that have not been removed (active or pending
// direct-adds), plus outstanding email invitations. It performs no permission
// check — the result is an aggregate count with no per-user detail, and the
// gateway, which is the sole caller, authorizes the surrounding operation and
// supplies the billing limit. Returns (activeCollaborators, pendingInvitations).
func (s *CollaborationService) GetProjectSeatUsage(ctx context.Context, projectID uuid.UUID) (active int, pending int, err error) {
	collaborators, err := s.repo.GetProjectCollaborators(ctx, projectID)
	if err != nil {
		return 0, 0, err
	}
	for _, c := range collaborators {
		if c.Role == "owner" || c.Status == "removed" {
			continue
		}
		active++
	}

	pending, err = s.repo.CountPendingProjectInvitations(ctx, projectID)
	if err != nil {
		return 0, 0, err
	}
	return active, pending, nil
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

	s.publishCommentAdded(ctx, comment)
	return comment, nil
}

// publishCommentAdded emits a best-effort comment.added event naming the
// project's collaborators (minus the author) as recipients, so the
// notifications service can fan out in-app + email notifications. Best-effort:
// the comment row is already persisted, and a missed notification is low-stakes,
// so we don't pay for the transactional outbox here.
//
// Known limitation: recipients are drawn from the collaborators table only. A
// project owner who has no collaborator row (owners aren't always added as one)
// won't be notified.
func (s *CollaborationService) publishCommentAdded(ctx context.Context, c *domain.Comment) {
	collaborators, err := s.repo.GetProjectCollaborators(ctx, c.ProjectID)
	if err != nil {
		slog.Warn("comment.added: could not load collaborators for notification", "project_id", c.ProjectID, "error", err)
		return
	}

	var recipients []string
	for _, collab := range collaborators {
		if collab.UserID == uuid.Nil || collab.UserID == c.UserID {
			continue // pending email-invite, or the comment author
		}
		if collab.Status != "active" {
			continue
		}
		recipients = append(recipients, collab.UserID.String())
	}
	if len(recipients) == 0 {
		return // no one to notify
	}

	snippet := c.Content
	if len(snippet) > 120 {
		snippet = snippet[:120] + "…"
	}
	payload, err := json.Marshal(map[string]any{
		"project_id": c.ProjectID.String(),
		"comment_id": c.ID.String(),
		"author_id":  c.UserID.String(),
		"recipients": recipients,
		"snippet":    snippet,
	})
	if err != nil {
		slog.Warn("comment.added: marshal payload", "error", err)
		return
	}
	if err := s.publisher.Publish(ctx, events.EventTypeCommentAdded, payload); err != nil {
		slog.Warn("comment.added: publish failed (notification skipped)", "error", err)
	}
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

// editSessionStaleAfter is how long a session may go without a heartbeat before
// reads treat it as dead (and the sweep closes it). It tolerates two missed 30s
// heartbeats plus slack, matching the ephemeral presence store's 90s TTL.
const editSessionStaleAfter = 90 * time.Second

// Edit session operations (durable advisory locks).

// RecordEditFocus upserts the caller's durable edit session for a project and
// records the element they are currently focused on. It is the single entry
// point the realtime gateway calls on join (elementID invalid = no focus yet),
// on focus change, and on the keep-alive heartbeat — creating the session on the
// first call and refreshing its focus + activity thereafter.
//
// Authorization is the caller's responsibility: the realtime gateway has already
// run ResolveProjectAccess before opening the socket, so this does not re-check
// permissions (doing so would wrongly drop a project owner who holds no
// collaborator row).
func (s *CollaborationService) RecordEditFocus(ctx context.Context, projectID, userID uuid.UUID, elementID uuid.NullUUID) (*domain.EditSession, error) {
	existing, err := s.repo.GetActiveEditSessionForUser(ctx, projectID, userID)
	if err == nil {
		if uerr := s.repo.UpdateEditSessionFocus(ctx, existing.ID, elementID); uerr != nil {
			return nil, uerr
		}
		existing.ElementID = elementID
		// last_activity_at was bumped to NOW() by UpdateEditSessionFocus; the
		// gateway ignores the returned timestamp and the REST path re-reads from
		// the DB, so an approximate value here is fine.
		existing.LastActivity = time.Now()
		return existing, nil
	}
	if !errors.Is(err, domain.ErrEditSessionNotFound) {
		return nil, err
	}

	// started_at / last_activity_at are stamped by the DB (NOW()) inside
	// CreateEditSession and read back onto the struct.
	session := &domain.EditSession{
		ID:        uuid.New(),
		ProjectID: projectID,
		UserID:    userID,
		ElementID: elementID,
	}
	if err := s.repo.CreateEditSession(ctx, session); err != nil {
		return nil, err
	}
	return session, nil
}

// EndEditSession closes a session by id. It is idempotent (ending an already
// ended or missing session is a no-op), matching the best-effort disconnect
// path — the gateway holds the session id it was handed at join, so no
// ownership re-check is needed.
func (s *CollaborationService) EndEditSession(ctx context.Context, sessionID uuid.UUID) error {
	return s.repo.EndEditSession(ctx, sessionID)
}

// SweepStaleEditSessions closes sessions abandoned without a clean disconnect.
// Reads already ignore stale rows; this keeps the active set from growing
// unbounded. Returns the number of sessions closed.
func (s *CollaborationService) SweepStaleEditSessions(ctx context.Context) (int64, error) {
	return s.repo.SweepStaleEditSessions(ctx, editSessionStaleAfter)
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

// ListActiveEditSessions returns the currently active, non-stale edit sessions
// for a project. Stale rows (no heartbeat within editSessionStaleAfter) are
// filtered out so a crashed client doesn't show as a phantom lock.
func (s *CollaborationService) ListActiveEditSessions(ctx context.Context, projectID uuid.UUID) ([]*domain.EditSession, error) {
	return s.repo.ListActiveProjectEditSessions(ctx, projectID, editSessionStaleAfter)
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
