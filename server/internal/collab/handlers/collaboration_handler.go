package handlers

import (
	"context"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"scriptlith/server/internal/collab/domain"
	"scriptlith/server/internal/collab/service"
	collab_pb "scriptlith/server/pkg/grpc/collab"
	"scriptlith/server/pkg/grpc/common"
)

type CollaborationHandler struct {
	service *service.CollaborationService
	collab_pb.UnimplementedCollaborationServiceServer
}

func NewCollaborationHandler(service *service.CollaborationService) *CollaborationHandler {
	return &CollaborationHandler{
		service: service,
	}
}

// Helper functions
func parseUUID(s string) (uuid.UUID, error) {
	if s == "" {
		return uuid.UUID{}, nil
	}
	return uuid.Parse(s)
}

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

func parseOptionalInt32(value int32) *int32 {
	if value == 0 {
		return nil
	}
	return &value
}

// AddCollaborator adds a new collaborator to a project
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

// AddCollaboratorDirect adds a collaborator directly by user ID (bypasses invitation system)
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

// GetProjectCollaborators retrieves all collaborators for a project
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

// UpdateCollaboratorRole updates a collaborator's role
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

// RemoveCollaborator removes a collaborator from a project
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

// AddComment adds a comment to a project
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

// GetComments retrieves comments for a screenplay
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

// UpdateComment updates a comment
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

// DeleteComment deletes a comment
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

// StartEditSession starts a new editing session
func (h *CollaborationHandler) StartEditSession(ctx context.Context, req *collab_pb.StartEditSessionRequest) (*collab_pb.StartEditSessionResponse, error) {
	projectID, err := parseUUID(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project ID: %v", err)
	}

	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	screenplayID, err := parseUUID(req.ScreenplayId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid screenplay ID: %v", err)
	}

	session, err := h.service.StartEditSession(ctx, userID, projectID, screenplayID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to start edit session: %v", err)
	}

	return &collab_pb.StartEditSessionResponse{
		Session: &collab_pb.EditSession{
			Id:           session.ID.String(),
			ProjectId:    session.ProjectID.String(),
			ScreenplayId: session.ScreenplayID.String(),
			UserId:       session.UserID.String(),
			StartedAt: &common.Timestamp{
				Seconds: session.StartedAt.Unix(),
				Nanos:   int32(session.StartedAt.Nanosecond()),
			},
			LastActivity: &common.Timestamp{
				Seconds: session.LastActivity.Unix(),
				Nanos:   int32(session.LastActivity.Nanosecond()),
			},
			IsActive: session.IsActive,
		},
	}, nil
}

// EndEditSession ends an editing session
func (h *CollaborationHandler) EndEditSession(ctx context.Context, req *collab_pb.EndEditSessionRequest) (*collab_pb.EndEditSessionResponse, error) {
	sessionID, err := parseUUID(req.SessionId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid session ID: %v", err)
	}

	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	err = h.service.EndEditSession(ctx, userID, sessionID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to end edit session: %v", err)
	}

	return &collab_pb.EndEditSessionResponse{
		Success: true,
	}, nil
}

// SendEditOperation handles real-time edit operations
func (h *CollaborationHandler) SendEditOperation(ctx context.Context, req *collab_pb.SendEditOperationRequest) (*collab_pb.SendEditOperationResponse, error) {
	// This would be implemented for real-time collaboration
	// For now, just return success
	return &collab_pb.SendEditOperationResponse{
		Success: true,
	}, nil
}

// GetActiveSessions retrieves active editing sessions for a screenplay
func (h *CollaborationHandler) GetActiveSessions(ctx context.Context, req *collab_pb.GetActiveSessionsRequest) (*collab_pb.GetActiveSessionsResponse, error) {
	screenplayID, err := parseUUID(req.ScreenplayId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid screenplay ID: %v", err)
	}

	sessions, err := h.service.GetActiveEditSessions(ctx, screenplayID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get active sessions: %v", err)
	}

	pbSessions := make([]*collab_pb.EditSession, len(sessions))
	for i, session := range sessions {
		pbSessions[i] = &collab_pb.EditSession{
			Id:           session.ID.String(),
			ProjectId:    session.ProjectID.String(),
			ScreenplayId: session.ScreenplayID.String(),
			UserId:       session.UserID.String(),
			StartedAt: &common.Timestamp{
				Seconds: session.StartedAt.Unix(),
				Nanos:   int32(session.StartedAt.Nanosecond()),
			},
			LastActivity: &common.Timestamp{
				Seconds: session.LastActivity.Unix(),
				Nanos:   int32(session.LastActivity.Nanosecond()),
			},
			IsActive: session.IsActive,
		}
	}

	return &collab_pb.GetActiveSessionsResponse{
		Sessions: pbSessions,
	}, nil
}

// UpdatePresence updates a user's presence in a project
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

// GetPresence retrieves user presence for a screenplay
func (h *CollaborationHandler) GetPresence(ctx context.Context, req *collab_pb.GetPresenceRequest) (*collab_pb.GetPresenceResponse, error) {
	_, err := parseUUID(req.ScreenplayId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid screenplay ID: %v", err)
	}

	userID, err := parseUUID(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	// For this simplified version, we'll get presence for the project
	// In a real implementation, you'd determine the project ID from the screenplay
	projectID := uuid.New() // This should be looked up from the screenplay

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

// GetUserInvitations retrieves pending invitations for a user
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

// AcceptInvitation accepts a pending collaboration invitation
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

// DeclineInvitation declines a pending collaboration invitation
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

// Helper functions for conversion
func timestampPtrToCommon(t *time.Time) *common.Timestamp {
	if t == nil {
		return nil
	}
	return &common.Timestamp{
		Seconds: t.Unix(),
		Nanos:   int32(t.Nanosecond()),
	}
}

func uuidPtrToString(id *uuid.UUID) string {
	if id == nil {
		return ""
	}
	return id.String()
}

func int32PtrToInt32(i *int32) int32 {
	if i == nil {
		return 0
	}
	return *i
}
