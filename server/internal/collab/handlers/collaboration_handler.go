package handlers

import (
	"context"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/collab/domain"
	"inkwell/server/internal/collab/service"
	collab_pb "inkwell/server/pkg/grpc/collab"
	"inkwell/server/pkg/grpc/common"
)

// CollaborationHandler implements the gRPC CollaborationServiceServer. It translates
// proto messages to domain objects, delegates to CollaborationService, and converts
// domain errors to gRPC status codes.
type CollaborationHandler struct {
	service *service.CollaborationService
	collab_pb.UnimplementedCollaborationServiceServer
}

// NewCollaborationHandler creates a CollaborationHandler backed by the provided
// CollaborationService.
func NewCollaborationHandler(service *service.CollaborationService) *CollaborationHandler {
	return &CollaborationHandler{
		service: service,
	}
}

// parseUUID parses s as a UUID. An empty string returns uuid.Nil without error,
// which callers use as a sentinel for optional UUID fields.
func parseUUID(s string) (uuid.UUID, error) {
	if s == "" {
		return uuid.UUID{}, nil
	}
	return uuid.Parse(s)
}

// parseOptionalUUID parses s as a UUID pointer. An empty string returns (nil, nil),
// making it safe for optional proto string fields.
func parseOptionalUUID(s string) (*uuid.UUID, error) {
	if s == "" {
		return nil, nil
	}
	id, err := uuid.Parse(s)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

// parseOptionalStringPtr parses a UUID from a string pointer. A nil or empty
// pointer returns (nil, nil).
func parseOptionalStringPtr(s *string) (*uuid.UUID, error) {
	if s == nil || *s == "" {
		return nil, nil
	}
	id, err := uuid.Parse(*s)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

// parseOptionalInt32 converts a zero int32 to nil, mapping the proto default
// value to the domain's "not provided" sentinel.
func parseOptionalInt32(value int32) *int32 {
	if value == 0 {
		return nil
	}
	return &value
}

// AddCollaborator sends a project invitation by email address. Returns AlreadyExists
// if a pending invitation or active collaborator record already exists for the given
// email and project combination.
func (h *CollaborationHandler) AddCollaborator(ctx context.Context, req *collab_pb.AddCollaboratorRequest) (*collab_pb.AddCollaboratorResponse, error) {
	projectID, err := parseUUID(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project ID: %v", err)
	}

	inviterID, err := parseUUID(req.InviterId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid inviter ID: %v", err)
	}

	// Use the new email-based collaborator addition
	collaborator, err := h.service.AddCollaboratorByEmail(ctx, projectID, req.Email, inviterID, req.Role)
	if err != nil {
		if err == domain.ErrInvitationExists || err == domain.ErrCollaboratorExists {
			return nil, status.Errorf(codes.AlreadyExists, "%v", err)
		}
		return nil, status.Errorf(codes.Internal, "failed to add collaborator: %v", err)
	}

	return &collab_pb.AddCollaboratorResponse{
		Collaborator: &collab_pb.Collaborator{
			Id:        collaborator.ID.String(),
			ProjectId: collaborator.ProjectID.String(),
			UserId:    collaborator.UserID.String(),
			Role:      collaborator.Role,
			Status:    collaborator.Status,
			InvitedAt: &common.Timestamp{
				Seconds: collaborator.InvitedAt.Unix(),
				Nanos:   int32(collaborator.InvitedAt.Nanosecond()),
			},
			JoinedAt: timestampPtrToCommon(collaborator.JoinedAt),
		},
	}, nil
}

// AddCollaboratorDirect registers a collaborator by user ID without the invitation flow.
// Used internally by the scripts gateway handler immediately after project creation
// to record the creator as the "owner" collaborator.
func (h *CollaborationHandler) AddCollaboratorDirect(ctx context.Context, req *collab_pb.AddCollaboratorDirectRequest) (*collab_pb.AddCollaboratorDirectResponse, error) {
	projectID, err := parseUUID(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project ID: %v", err)
	}

	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	inviterID, err := parseUUID(req.InviterId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid inviter ID: %v", err)
	}

	// Use the direct collaborator addition (bypasses invitation system)
	collaborator, err := h.service.AddCollaborator(ctx, projectID, userID, inviterID, req.Role)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to add collaborator: %v", err)
	}

	return &collab_pb.AddCollaboratorDirectResponse{
		Collaborator: &collab_pb.Collaborator{
			Id:        collaborator.ID.String(),
			ProjectId: collaborator.ProjectID.String(),
			UserId:    collaborator.UserID.String(),
			Role:      collaborator.Role,
			Status:    collaborator.Status,
			InvitedAt: &common.Timestamp{
				Seconds: collaborator.InvitedAt.Unix(),
				Nanos:   int32(collaborator.InvitedAt.Nanosecond()),
			},
			JoinedAt: timestampPtrToCommon(collaborator.JoinedAt),
		},
	}, nil
}

// GetProjectCollaborators returns all collaborator records for a project, including
// both active members and pending invitations.
func (h *CollaborationHandler) GetProjectCollaborators(ctx context.Context, req *collab_pb.GetProjectCollaboratorsRequest) (*collab_pb.GetProjectCollaboratorsResponse, error) {
	projectID, err := parseUUID(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project ID: %v", err)
	}

	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	collaborators, err := h.service.GetProjectCollaborators(ctx, userID, projectID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get collaborators: %v", err)
	}

	pbCollaborators := make([]*collab_pb.Collaborator, len(collaborators))
	for i, collab := range collaborators {
		pbCollaborators[i] = &collab_pb.Collaborator{
			Id:        collab.ID.String(),
			ProjectId: collab.ProjectID.String(),
			UserId:    collab.UserID.String(),
			Role:      collab.Role,
			Status:    collab.Status,
			InvitedAt: &common.Timestamp{
				Seconds: collab.InvitedAt.Unix(),
				Nanos:   int32(collab.InvitedAt.Nanosecond()),
			},
			JoinedAt: timestampPtrToCommon(collab.JoinedAt),
		}
	}

	return &collab_pb.GetProjectCollaboratorsResponse{
		Collaborators: pbCollaborators,
	}, nil
}

// GetProjectSeatUsage returns the project's collaborator seat usage — non-owner
// collaborators plus outstanding invitations — for the gateway's per-project
// quota check.
func (h *CollaborationHandler) GetProjectSeatUsage(ctx context.Context, req *collab_pb.GetProjectSeatUsageRequest) (*collab_pb.GetProjectSeatUsageResponse, error) {
	projectID, err := parseUUID(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project ID: %v", err)
	}

	active, pending, err := h.service.GetProjectSeatUsage(ctx, projectID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get seat usage: %v", err)
	}

	return &collab_pb.GetProjectSeatUsageResponse{
		ActiveCollaborators: int32(active),
		PendingInvitations:  int32(pending),
	}, nil
}

// UpdateCollaboratorRole changes a collaborator's role. It re-fetches the updated
// record after applying the change to return the current state.
func (h *CollaborationHandler) UpdateCollaboratorRole(ctx context.Context, req *collab_pb.UpdateCollaboratorRoleRequest) (*collab_pb.UpdateCollaboratorRoleResponse, error) {
	collaboratorID, err := parseUUID(req.CollaboratorId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid collaborator ID: %v", err)
	}

	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	err = h.service.UpdateCollaboratorRole(ctx, userID, collaboratorID, req.NewRole)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update collaborator role: %v", err)
	}

	// Get the updated collaborator to return
	collaborator, err := h.service.GetCollaboratorByID(ctx, collaboratorID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get updated collaborator: %v", err)
	}

	return &collab_pb.UpdateCollaboratorRoleResponse{
		Collaborator: &collab_pb.Collaborator{
			Id:        collaborator.ID.String(),
			ProjectId: collaborator.ProjectID.String(),
			UserId:    collaborator.UserID.String(),
			Role:      collaborator.Role,
			Status:    collaborator.Status,
			InvitedAt: &common.Timestamp{
				Seconds: collaborator.InvitedAt.Unix(),
				Nanos:   int32(collaborator.InvitedAt.Nanosecond()),
			},
			JoinedAt: timestampPtrToCommon(collaborator.JoinedAt),
		},
	}, nil
}

// RemoveCollaborator removes a collaborator from a project.
func (h *CollaborationHandler) RemoveCollaborator(ctx context.Context, req *collab_pb.RemoveCollaboratorRequest) (*collab_pb.RemoveCollaboratorResponse, error) {
	collaboratorID, err := parseUUID(req.CollaboratorId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid collaborator ID: %v", err)
	}

	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	err = h.service.RemoveCollaborator(ctx, userID, collaboratorID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to remove collaborator: %v", err)
	}

	return &collab_pb.RemoveCollaboratorResponse{
		Success: true,
	}, nil
}

// AddComment attaches a comment to a project. Supports optional anchoring to a
// specific scene or script element, line number, and character position. Supports
// threaded replies via the optional parent_id field.
func (h *CollaborationHandler) AddComment(ctx context.Context, req *collab_pb.AddCommentRequest) (*collab_pb.AddCommentResponse, error) {
	projectID, err := parseUUID(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project ID: %v", err)
	}

	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	_, err = parseOptionalUUID(req.ScreenplayId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid screenplay ID: %v", err)
	}

	elementID, err := parseOptionalStringPtr(req.ScriptElementId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid element ID: %v", err)
	}

	sceneID, err := parseOptionalStringPtr(req.SceneId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid scene ID: %v", err)
	}

	var parentID *uuid.UUID
	if req.ParentId != nil {
		parentID, err = parseOptionalUUID(*req.ParentId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid parent ID: %v", err)
		}
	}

	lineNumber := parseOptionalInt32(req.LineNumber)
	charPosition := parseOptionalInt32(req.CharPosition)

	comment, err := h.service.AddComment(ctx, userID, projectID, req.Content, elementID, sceneID, parentID, lineNumber, charPosition)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to add comment: %v", err)
	}

	return &collab_pb.AddCommentResponse{
		Comment: &collab_pb.Comment{
			Id:              comment.ID.String(),
			ProjectId:       comment.ProjectID.String(),
			ScreenplayId:    uuidPtrToString(comment.ScreenplayID),
			ScriptElementId: uuidPtrToString(comment.ScriptElementID),
			SceneId:         uuidPtrToString(comment.SceneID),
			UserId:          comment.UserID.String(),
			Username:        "", // Will be set by gateway
			Content:         comment.Content,
			LineNumber:      int32PtrToInt32(comment.LineNumber),
			CharPosition:    int32PtrToInt32(comment.CharPosition),
			ParentId:        uuidPtrToString(comment.ParentID),
			IsResolved:      comment.IsResolved,
			CreatedAt: &common.Timestamp{
				Seconds: comment.CreatedAt.Unix(),
				Nanos:   int32(comment.CreatedAt.Nanosecond()),
			},
			UpdatedAt: &common.Timestamp{
				Seconds: comment.UpdatedAt.Unix(),
				Nanos:   int32(comment.UpdatedAt.Nanosecond()),
			},
		},
	}, nil
}

// GetComments retrieves comments for a project. screenplay_id is treated as project_id
// in the current data model. Returns up to 100 comments starting from offset 0.
func (h *CollaborationHandler) GetComments(ctx context.Context, req *collab_pb.GetCommentsRequest) (*collab_pb.GetCommentsResponse, error) {
	screenplayID, err := parseUUID(req.ScreenplayId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid screenplay ID: %v", err)
	}

	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	// For this simplified version, we'll get all comments for the project
	// Since we're using project ID as screenplay ID, treat screenplay ID as project ID
	comments, err := h.service.GetComments(ctx, userID, screenplayID, nil, nil, 0, 100)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get comments: %v", err)
	}

	pbComments := make([]*collab_pb.Comment, len(comments))
	for i, comment := range comments {
		pbComments[i] = &collab_pb.Comment{
			Id:              comment.ID.String(),
			ProjectId:       comment.ProjectID.String(),
			ScreenplayId:    uuidPtrToString(comment.ScreenplayID),
			ScriptElementId: uuidPtrToString(comment.ScriptElementID),
			SceneId:         uuidPtrToString(comment.SceneID),
			UserId:          comment.UserID.String(),
			Username:        "", // Will be set by gateway
			Content:         comment.Content,
			LineNumber:      int32PtrToInt32(comment.LineNumber),
			CharPosition:    int32PtrToInt32(comment.CharPosition),
			ParentId:        uuidPtrToString(comment.ParentID),
			IsResolved:      comment.IsResolved,
			CreatedAt: &common.Timestamp{
				Seconds: comment.CreatedAt.Unix(),
				Nanos:   int32(comment.CreatedAt.Nanosecond()),
			},
			UpdatedAt: &common.Timestamp{
				Seconds: comment.UpdatedAt.Unix(),
				Nanos:   int32(comment.UpdatedAt.Nanosecond()),
			},
		}
	}

	return &collab_pb.GetCommentsResponse{
		Comments: pbComments,
	}, nil
}

// UpdateComment applies partial updates to a comment. If content is non-nil the
// body text is replaced; if is_resolved is true the thread is marked resolved.
// Both operations can be applied in a single call.
func (h *CollaborationHandler) UpdateComment(ctx context.Context, req *collab_pb.UpdateCommentRequest) (*collab_pb.UpdateCommentResponse, error) {
	commentID, err := parseUUID(req.CommentId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid comment ID: %v", err)
	}

	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	if req.Content != nil {
		err = h.service.UpdateComment(ctx, userID, commentID, *req.Content)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to update comment: %v", err)
		}
	}

	if req.IsResolved != nil && *req.IsResolved {
		err = h.service.ResolveComment(ctx, userID, commentID)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to resolve comment: %v", err)
		}
	}

	// Get the updated comment to return
	comment, err := h.service.GetCommentByID(ctx, commentID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get updated comment: %v", err)
	}

	return &collab_pb.UpdateCommentResponse{
		Comment: &collab_pb.Comment{
			Id:              comment.ID.String(),
			ProjectId:       comment.ProjectID.String(),
			ScreenplayId:    uuidPtrToString(comment.ScreenplayID),
			ScriptElementId: uuidPtrToString(comment.ScriptElementID),
			UserId:          comment.UserID.String(),
			Content:         comment.Content,
			LineNumber:      int32PtrToInt32(comment.LineNumber),
			CharPosition:    int32PtrToInt32(comment.CharPosition),
			ParentId:        uuidPtrToString(comment.ParentID),
			IsResolved:      comment.IsResolved,
			CreatedAt: &common.Timestamp{
				Seconds: comment.CreatedAt.Unix(),
				Nanos:   int32(comment.CreatedAt.Nanosecond()),
			},
			UpdatedAt: &common.Timestamp{
				Seconds: comment.UpdatedAt.Unix(),
				Nanos:   int32(comment.UpdatedAt.Nanosecond()),
			},
		},
	}, nil
}

// DeleteComment permanently removes a comment by ID.
func (h *CollaborationHandler) DeleteComment(ctx context.Context, req *collab_pb.DeleteCommentRequest) (*collab_pb.DeleteCommentResponse, error) {
	commentID, err := parseUUID(req.CommentId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid comment ID: %v", err)
	}

	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	err = h.service.DeleteComment(ctx, userID, commentID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete comment: %v", err)
	}

	return &collab_pb.DeleteCommentResponse{
		Success: true,
	}, nil
}

// toPBEditSession maps a durable edit session to its protobuf form. The legacy
// screenplay_id is left empty; is_active is always true because only active
// sessions are ever returned.
func toPBEditSession(session *domain.EditSession) *collab_pb.EditSession {
	elementID := ""
	if session.ElementID.Valid {
		elementID = session.ElementID.UUID.String()
	}
	return &collab_pb.EditSession{
		Id:        session.ID.String(),
		ProjectId: session.ProjectID.String(),
		UserId:    session.UserID.String(),
		ElementId: elementID,
		StartedAt: &common.Timestamp{
			Seconds: session.StartedAt.Unix(),
			Nanos:   int32(session.StartedAt.Nanosecond()),
		},
		LastActivity: &common.Timestamp{
			Seconds: session.LastActivity.Unix(),
			Nanos:   int32(session.LastActivity.Nanosecond()),
		},
		IsActive: true,
	}
}

// StartEditSession upserts the caller's durable edit session for a project and
// records the element they are focused on. Despite the name it is idempotent —
// the realtime gateway calls it on join, on focus change, and on the heartbeat,
// always passing the current element_id (empty when idle). Authorization is
// enforced by the gateway before the socket opens, so this trusts the caller.
func (h *CollaborationHandler) StartEditSession(ctx context.Context, req *collab_pb.StartEditSessionRequest) (*collab_pb.StartEditSessionResponse, error) {
	projectID, err := parseUUID(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project ID: %v", err)
	}

	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	// element_id is optional (empty = no current focus).
	var elementID uuid.NullUUID
	if req.ElementId != "" {
		parsed, perr := parseUUID(req.ElementId)
		if perr != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid element ID: %v", perr)
		}
		elementID = uuid.NullUUID{UUID: parsed, Valid: true}
	}

	session, err := h.service.RecordEditFocus(ctx, projectID, userID, elementID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to record edit session: %v", err)
	}

	return &collab_pb.StartEditSessionResponse{Session: toPBEditSession(session)}, nil
}

// EndEditSession closes an active editing session, stamping ended_at. It is
// idempotent — closing an already-ended or missing session succeeds.
func (h *CollaborationHandler) EndEditSession(ctx context.Context, req *collab_pb.EndEditSessionRequest) (*collab_pb.EndEditSessionResponse, error) {
	sessionID, err := parseUUID(req.SessionId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid session ID: %v", err)
	}

	if err := h.service.EndEditSession(ctx, sessionID); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to end edit session: %v", err)
	}

	return &collab_pb.EndEditSessionResponse{
		Success: true,
	}, nil
}

// SendEditOperation is a stub for real-time operational transforms. Not yet
// implemented; always returns success.
func (h *CollaborationHandler) SendEditOperation(ctx context.Context, req *collab_pb.SendEditOperationRequest) (*collab_pb.SendEditOperationResponse, error) {
	// This would be implemented for real-time collaboration
	// For now, just return success
	return &collab_pb.SendEditOperationResponse{
		Success: true,
	}, nil
}

// GetActiveSessions returns the currently active, non-stale edit sessions for a
// project (the durable advisory locks). The request's project_id is authoritative;
// the legacy screenplay_id is ignored.
func (h *CollaborationHandler) GetActiveSessions(ctx context.Context, req *collab_pb.GetActiveSessionsRequest) (*collab_pb.GetActiveSessionsResponse, error) {
	projectID, err := parseUUID(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project ID: %v", err)
	}

	sessions, err := h.service.ListActiveEditSessions(ctx, projectID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get active sessions: %v", err)
	}

	pbSessions := make([]*collab_pb.EditSession, len(sessions))
	for i, session := range sessions {
		pbSessions[i] = toPBEditSession(session)
	}

	return &collab_pb.GetActiveSessionsResponse{
		Sessions: pbSessions,
	}, nil
}

// UpdatePresence records a user's current cursor position within a project,
// keeping their online status and last-seen timestamp up to date.
func (h *CollaborationHandler) UpdatePresence(ctx context.Context, req *collab_pb.UpdatePresenceRequest) (*collab_pb.UpdatePresenceResponse, error) {
	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	projectID, err := parseUUID(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project ID: %v", err)
	}

	screenplayID, err := parseOptionalUUID(req.ScreenplayId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid screenplay ID: %v", err)
	}

	presence, err := h.service.UpdateUserPresence(ctx, userID, projectID, screenplayID, req.CursorPosition, nil, nil)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update user presence: %v", err)
	}

	return &collab_pb.UpdatePresenceResponse{
		Presence: &collab_pb.UserPresence{
			UserId:         presence.UserID.String(),
			ProjectId:      presence.ProjectID.String(),
			ScreenplayId:   uuidPtrToString(presence.ScreenplayID),
			CursorPosition: presence.CursorPosition,
			LastSeen: &common.Timestamp{
				Seconds: presence.LastSeen.Unix(),
				Nanos:   int32(presence.LastSeen.Nanosecond()),
			},
			IsOnline: presence.IsOnline,
		},
	}, nil
}

// GetPresence retrieves active presence records for a collaborative editing session.
// The request carries a screenplay ID, which in this schema is equivalent to the
// project ID (same convention used by GetComments above). The gRPC request name is
// kept for backwards compatibility with existing clients.
func (h *CollaborationHandler) GetPresence(ctx context.Context, req *collab_pb.GetPresenceRequest) (*collab_pb.GetPresenceResponse, error) {
	projectID, err := parseUUID(req.ScreenplayId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid screenplay ID: %v", err)
	}

	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	presences, err := h.service.GetProjectUserPresence(ctx, userID, projectID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get project user presence: %v", err)
	}

	pbPresences := make([]*collab_pb.UserPresence, len(presences))
	for i, presence := range presences {
		pbPresences[i] = &collab_pb.UserPresence{
			UserId:         presence.UserID.String(),
			ProjectId:      presence.ProjectID.String(),
			ScreenplayId:   uuidPtrToString(presence.ScreenplayID),
			CursorPosition: presence.CursorPosition,
			LastSeen: &common.Timestamp{
				Seconds: presence.LastSeen.Unix(),
				Nanos:   int32(presence.LastSeen.Nanosecond()),
			},
			IsOnline: presence.IsOnline,
		}
	}

	return &collab_pb.GetPresenceResponse{
		Presences: pbPresences,
	}, nil
}

// GetUserInvitations returns all pending invitations for the given email address.
func (h *CollaborationHandler) GetUserInvitations(ctx context.Context, req *collab_pb.GetUserInvitationsRequest) (*collab_pb.GetUserInvitationsResponse, error) {
	if req.Email == "" {
		return nil, status.Errorf(codes.InvalidArgument, "email is required")
	}

	invitations, err := h.service.GetUserInvitations(ctx, req.Email)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get user invitations: %v", err)
	}

	pbInvitations := make([]*collab_pb.Collaborator, len(invitations))
	for i, invitation := range invitations {
		pbInvitations[i] = &collab_pb.Collaborator{
			Id:        invitation.ID.String(),
			ProjectId: invitation.ProjectID.String(),
			UserId:    invitation.UserID.String(),
			Role:      invitation.Role,
			Status:    invitation.Status,
			InvitedBy: invitation.InvitedBy.String(),
			InvitedAt: &common.Timestamp{
				Seconds: invitation.InvitedAt.Unix(),
				Nanos:   int32(invitation.InvitedAt.Nanosecond()),
			},
			JoinedAt: timestampPtrToCommon(invitation.JoinedAt),
		}
	}

	return &collab_pb.GetUserInvitationsResponse{
		Invitations: pbInvitations,
	}, nil
}

// GetUserCollaborations returns all active collaboration records for a user,
// representing every project they have accepted membership in.
func (h *CollaborationHandler) GetUserCollaborations(ctx context.Context, req *collab_pb.GetUserCollaborationsRequest) (*collab_pb.GetUserCollaborationsResponse, error) {
	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
	}

	collaborations, err := h.service.GetUserCollaborations(ctx, userID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get user collaborations: %v", err)
	}

	pbCollabs := make([]*collab_pb.Collaborator, len(collaborations))
	for i, c := range collaborations {
		pbCollabs[i] = &collab_pb.Collaborator{
			Id:        c.ID.String(),
			ProjectId: c.ProjectID.String(),
			UserId:    c.UserID.String(),
			Role:      c.Role,
			Status:    c.Status,
			InvitedBy: c.InvitedBy.String(),
			InvitedAt: &common.Timestamp{
				Seconds: c.InvitedAt.Unix(),
				Nanos:   int32(c.InvitedAt.Nanosecond()),
			},
			JoinedAt: timestampPtrToCommon(c.JoinedAt),
		}
	}

	return &collab_pb.GetUserCollaborationsResponse{
		Collaborations: pbCollabs,
	}, nil
}

// AcceptInvitation transitions a pending invitation to active, granting the user
// collaborator access to the project.
func (h *CollaborationHandler) AcceptInvitation(ctx context.Context, req *collab_pb.AcceptInvitationRequest) (*collab_pb.AcceptInvitationResponse, error) {
	collaboratorID, err := parseUUID(req.CollaboratorId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid collaborator ID: %v", err)
	}

	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	collaborator, err := h.service.AcceptInvitation(ctx, userID, collaboratorID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to accept invitation: %v", err)
	}

	return &collab_pb.AcceptInvitationResponse{
		Collaborator: &collab_pb.Collaborator{
			Id:        collaborator.ID.String(),
			ProjectId: collaborator.ProjectID.String(),
			UserId:    collaborator.UserID.String(),
			Role:      collaborator.Role,
			Status:    collaborator.Status,
			InvitedAt: &common.Timestamp{
				Seconds: collaborator.InvitedAt.Unix(),
				Nanos:   int32(collaborator.InvitedAt.Nanosecond()),
			},
			JoinedAt: timestampPtrToCommon(collaborator.JoinedAt),
		},
	}, nil
}

// DeclineInvitation rejects a pending invitation without granting project access.
func (h *CollaborationHandler) DeclineInvitation(ctx context.Context, req *collab_pb.DeclineInvitationRequest) (*collab_pb.DeclineInvitationResponse, error) {
	collaboratorID, err := parseUUID(req.CollaboratorId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid collaborator ID: %v", err)
	}

	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	err = h.service.DeclineInvitation(ctx, userID, collaboratorID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to decline invitation: %v", err)
	}

	return &collab_pb.DeclineInvitationResponse{
		Success: true,
	}, nil
}

// timestampPtrToCommon converts a *time.Time to the shared protobuf Timestamp type.
// Returns nil for nil input.
func timestampPtrToCommon(t *time.Time) *common.Timestamp {
	if t == nil {
		return nil
	}
	return &common.Timestamp{
		Seconds: t.Unix(),
		Nanos:   int32(t.Nanosecond()),
	}
}

// uuidPtrToString converts a *uuid.UUID to its string representation.
// Returns "" for nil input.
func uuidPtrToString(id *uuid.UUID) string {
	if id == nil {
		return ""
	}
	return id.String()
}

// int32PtrToInt32 dereferences an int32 pointer, returning 0 for nil.
func int32PtrToInt32(i *int32) int32 {
	if i == nil {
		return 0
	}
	return *i
}
