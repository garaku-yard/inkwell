package handler

import (
	"context"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/workspace/domain"
	"inkwell/server/internal/workspace/service"
	workspacepb "inkwell/server/pkg/grpc/workspace"
)

// WorkspaceHandler implements the WorkspaceService gRPC server. It translates
// inbound proto messages to domain types, delegates to WorkspaceService, and maps
// domain error sentinels back to precise gRPC status codes.
type WorkspaceHandler struct {
	workspacepb.UnimplementedWorkspaceServiceServer
	svc service.WorkspaceService
}

// NewWorkspaceHandler creates a WorkspaceHandler backed by the provided service.
func NewWorkspaceHandler(svc service.WorkspaceService) *WorkspaceHandler {
	return &WorkspaceHandler{svc: svc}
}

// ListCategories returns all available content categories (e.g. "screenplay",
// "prose", "lyrics"). Categories are global and not user-scoped.
func (h *WorkspaceHandler) ListCategories(ctx context.Context, _ *workspacepb.ListCategoriesRequest) (*workspacepb.ListCategoriesResponse, error) {
	cats, err := h.svc.ListCategories(ctx)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &workspacepb.ListCategoriesResponse{Categories: mapCategories(cats)}, nil
}

// CreatePersonalWorkspaces provisions one personal workspace per category slug
// provided. This is typically called during onboarding to seed the user's initial
// workspace set.
func (h *WorkspaceHandler) CreatePersonalWorkspaces(ctx context.Context, req *workspacepb.CreatePersonalWorkspacesRequest) (*workspacepb.CreatePersonalWorkspacesResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}
	workspaces, err := h.svc.CreatePersonalWorkspaces(ctx, userID, req.CategorySlugs)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &workspacepb.CreatePersonalWorkspacesResponse{Workspaces: mapWorkspaces(workspaces)}, nil
}

// CreateOrgWorkspace creates a new organisation workspace. Returns AlreadyExists
// if the name conflicts with an existing workspace slug for that owner.
func (h *WorkspaceHandler) CreateOrgWorkspace(ctx context.Context, req *workspacepb.CreateOrgWorkspaceRequest) (*workspacepb.CreateOrgWorkspaceResponse, error) {
	ownerID, err := uuid.Parse(req.OwnerId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid owner_id")
	}
	w, err := h.svc.CreateOrgWorkspace(ctx, ownerID, req.Name, req.Description, req.CategorySlugs)
	if err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.CreateOrgWorkspaceResponse{Workspace: mapWorkspace(w)}, nil
}

// GetWorkspace retrieves a single workspace by its UUID. Returns NotFound if no
// matching workspace exists.
func (h *WorkspaceHandler) GetWorkspace(ctx context.Context, req *workspacepb.GetWorkspaceRequest) (*workspacepb.GetWorkspaceResponse, error) {
	id, err := uuid.Parse(req.WorkspaceId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid workspace_id")
	}
	w, err := h.svc.GetWorkspace(ctx, id)
	if err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.GetWorkspaceResponse{Workspace: mapWorkspace(w)}, nil
}

// ListUserWorkspaces returns the user's personal workspaces and organisation
// workspaces as two separate lists.
func (h *WorkspaceHandler) ListUserWorkspaces(ctx context.Context, req *workspacepb.ListUserWorkspacesRequest) (*workspacepb.ListUserWorkspacesResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}
	personal, org, err := h.svc.ListUserWorkspaces(ctx, userID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &workspacepb.ListUserWorkspacesResponse{
		Personal: mapWorkspaces(personal),
		Org:      mapWorkspaces(org),
	}, nil
}

// UpdateWorkspace applies changes to a workspace's name, description, or avatar URL.
// Empty strings are forwarded as-is; callers should only send fields they intend
// to change.
func (h *WorkspaceHandler) UpdateWorkspace(ctx context.Context, req *workspacepb.UpdateWorkspaceRequest) (*workspacepb.UpdateWorkspaceResponse, error) {
	id, err := uuid.Parse(req.WorkspaceId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid workspace_id")
	}
	w, err := h.svc.UpdateWorkspace(ctx, id, req.Name, req.Description, req.AvatarUrl)
	if err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.UpdateWorkspaceResponse{Workspace: mapWorkspace(w)}, nil
}

// DeleteWorkspace permanently removes a workspace. Returns PermissionDenied if
// the caller is not the workspace owner.
func (h *WorkspaceHandler) DeleteWorkspace(ctx context.Context, req *workspacepb.DeleteWorkspaceRequest) (*workspacepb.DeleteWorkspaceResponse, error) {
	workspaceID, err := uuid.Parse(req.WorkspaceId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid workspace_id")
	}
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}
	if err := h.svc.DeleteWorkspace(ctx, workspaceID, userID); err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.DeleteWorkspaceResponse{Success: true}, nil
}

// EnableCategory adds a content category to a workspace by slug, making it
// available for organising projects within that workspace.
func (h *WorkspaceHandler) EnableCategory(ctx context.Context, req *workspacepb.EnableCategoryRequest) (*workspacepb.EnableCategoryResponse, error) {
	id, err := uuid.Parse(req.WorkspaceId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid workspace_id")
	}
	w, err := h.svc.EnableCategory(ctx, id, req.CategorySlug)
	if err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.EnableCategoryResponse{Workspace: mapWorkspace(w)}, nil
}

// DisableCategory removes a content category from a workspace by slug.
func (h *WorkspaceHandler) DisableCategory(ctx context.Context, req *workspacepb.DisableCategoryRequest) (*workspacepb.DisableCategoryResponse, error) {
	id, err := uuid.Parse(req.WorkspaceId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid workspace_id")
	}
	w, err := h.svc.DisableCategory(ctx, id, req.CategorySlug)
	if err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.DisableCategoryResponse{Workspace: mapWorkspace(w)}, nil
}

// AddMember adds a user to a workspace with the given role. Invalid UUID fields
// are silently treated as uuid.Nil; callers should pre-validate IDs before
// calling this RPC.
func (h *WorkspaceHandler) AddMember(ctx context.Context, req *workspacepb.AddMemberRequest) (*workspacepb.AddMemberResponse, error) {
	workspaceID, _ := uuid.Parse(req.WorkspaceId)
	userID, _ := uuid.Parse(req.UserId)
	invitedBy, _ := uuid.Parse(req.InvitedBy)
	m, err := h.svc.AddMember(ctx, workspaceID, userID, invitedBy, domain.MemberRole(req.Role))
	if err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.AddMemberResponse{Member: mapMember(m)}, nil
}

// RemoveMember removes a user from a workspace. Returns FailedPrecondition if
// the target user is the workspace owner.
func (h *WorkspaceHandler) RemoveMember(ctx context.Context, req *workspacepb.RemoveMemberRequest) (*workspacepb.RemoveMemberResponse, error) {
	workspaceID, _ := uuid.Parse(req.WorkspaceId)
	userID, _ := uuid.Parse(req.UserId)
	if err := h.svc.RemoveMember(ctx, workspaceID, userID); err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.RemoveMemberResponse{Success: true}, nil
}

// UpdateMemberRole changes the role of an existing workspace member.
func (h *WorkspaceHandler) UpdateMemberRole(ctx context.Context, req *workspacepb.UpdateMemberRoleRequest) (*workspacepb.UpdateMemberRoleResponse, error) {
	workspaceID, _ := uuid.Parse(req.WorkspaceId)
	userID, _ := uuid.Parse(req.UserId)
	m, err := h.svc.UpdateMemberRole(ctx, workspaceID, userID, domain.MemberRole(req.Role))
	if err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.UpdateMemberRoleResponse{Member: mapMember(m)}, nil
}

// ListMembers returns all current members of a workspace.
func (h *WorkspaceHandler) ListMembers(ctx context.Context, req *workspacepb.ListMembersRequest) (*workspacepb.ListMembersResponse, error) {
	workspaceID, _ := uuid.Parse(req.WorkspaceId)
	members, err := h.svc.ListMembers(ctx, workspaceID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	var pbMembers []*workspacepb.WorkspaceMember
	for _, m := range members {
		m := m
		pbMembers = append(pbMembers, mapMember(&m))
	}
	return &workspacepb.ListMembersResponse{Members: pbMembers}, nil
}

// InviteMember generates a time-limited invitation token for the given email
// address. The token is returned to the caller and should be delivered to the
// invitee out-of-band (e.g. by email).
func (h *WorkspaceHandler) InviteMember(ctx context.Context, req *workspacepb.InviteMemberRequest) (*workspacepb.InviteMemberResponse, error) {
	workspaceID, _ := uuid.Parse(req.WorkspaceId)
	invitedBy, _ := uuid.Parse(req.InvitedBy)
	token, err := h.svc.InviteMember(ctx, workspaceID, req.Email, domain.InviteRole(req.Role), invitedBy)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &workspacepb.InviteMemberResponse{InviteToken: token}, nil
}

// AcceptInvite redeems an invitation token, adding the user to the workspace.
// Returns FailedPrecondition if the token has expired or been used already.
func (h *WorkspaceHandler) AcceptInvite(ctx context.Context, req *workspacepb.AcceptInviteRequest) (*workspacepb.AcceptInviteResponse, error) {
	userID, _ := uuid.Parse(req.UserId)
	w, err := h.svc.AcceptInvite(ctx, req.Token, userID)
	if err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.AcceptInviteResponse{Workspace: mapWorkspace(w)}, nil
}

// DeclineInvite invalidates an invitation token without adding the user to the workspace.
func (h *WorkspaceHandler) DeclineInvite(ctx context.Context, req *workspacepb.DeclineInviteRequest) (*workspacepb.DeclineInviteResponse, error) {
	if err := h.svc.DeclineInvite(ctx, req.Token); err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.DeclineInviteResponse{Success: true}, nil
}

// handleError maps domain error sentinels to gRPC status codes so callers
// receive precise error types rather than a blanket codes.Internal.
func (h *WorkspaceHandler) handleError(err error) error {
	switch err {
	case domain.ErrWorkspaceNotFound:
		return status.Error(codes.NotFound, "workspace not found")
	case domain.ErrWorkspaceSlugTaken:
		return status.Error(codes.AlreadyExists, "workspace name already taken")
	case domain.ErrCategoryNotFound:
		return status.Error(codes.NotFound, "category not found")
	case domain.ErrMemberNotFound:
		return status.Error(codes.NotFound, "member not found")
	case domain.ErrMemberAlreadyExists:
		return status.Error(codes.AlreadyExists, "user is already a member")
	case domain.ErrInviteNotFound:
		return status.Error(codes.NotFound, "invite not found")
	case domain.ErrInviteExpired:
		return status.Error(codes.FailedPrecondition, "invite has expired")
	case domain.ErrInviteAlreadyUsed:
		return status.Error(codes.FailedPrecondition, "invite has already been used")
	case domain.ErrNotOwner:
		return status.Error(codes.PermissionDenied, "only the owner can perform this action")
	case domain.ErrCannotRemoveOwner:
		return status.Error(codes.FailedPrecondition, "cannot remove the workspace owner")
	default:
		return status.Error(codes.Internal, "internal server error")
	}
}

// mapCategory converts a domain Category to the workspace proto Category message.
func mapCategory(c domain.Category) *workspacepb.Category {
	return &workspacepb.Category{
		Id:          c.ID.String(),
		Slug:        c.Slug,
		Name:        c.Name,
		Description: c.Description,
		Icon:        c.Icon,
	}
}

// mapCategories converts a slice of domain Categories to a proto slice.
func mapCategories(cats []domain.Category) []*workspacepb.Category {
	var out []*workspacepb.Category
	for _, c := range cats {
		c := c
		out = append(out, mapCategory(c))
	}
	return out
}

// mapWorkspace converts a domain Workspace to the workspace proto Workspace
// message. Optional pointer fields (AvatarURL, Description) are only set when
// non-nil.
func mapWorkspace(w *domain.Workspace) *workspacepb.Workspace {
	pw := &workspacepb.Workspace{
		Id:         w.ID.String(),
		Name:       w.Name,
		Slug:       w.Slug,
		Type:       string(w.Type),
		OwnerId:    w.OwnerID.String(),
		Categories: mapCategories(w.Categories),
	}
	if w.AvatarURL != nil {
		pw.AvatarUrl = *w.AvatarURL
	}
	if w.Description != nil {
		pw.Description = *w.Description
	}
	return pw
}

// mapWorkspaces converts a slice of domain Workspaces to a proto slice.
func mapWorkspaces(ws []domain.Workspace) []*workspacepb.Workspace {
	var out []*workspacepb.Workspace
	for _, w := range ws {
		w := w
		out = append(out, mapWorkspace(&w))
	}
	return out
}

// mapMember converts a domain WorkspaceMember to the workspace proto
// WorkspaceMember message. InvitedBy is only set when the member was added via
// invitation rather than direct assignment.
func mapMember(m *domain.WorkspaceMember) *workspacepb.WorkspaceMember {
	pm := &workspacepb.WorkspaceMember{
		Id:          m.ID.String(),
		WorkspaceId: m.WorkspaceID.String(),
		UserId:      m.UserID.String(),
		Role:        string(m.Role),
	}
	if m.InvitedBy != nil {
		pm.InvitedBy = m.InvitedBy.String()
	}
	return pm
}
