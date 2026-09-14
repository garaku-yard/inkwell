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

// ─── Organizations ─────────────────────────────────────────────────────────────

// CreateOrganization provisions a new organization owned by the caller, who is
// recorded as its first member with the owner role.
func (h *WorkspaceHandler) CreateOrganization(ctx context.Context, req *workspacepb.CreateOrganizationRequest) (*workspacepb.CreateOrganizationResponse, error) {
	ownerID, err := uuid.Parse(req.OwnerId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid owner_id")
	}
	o, err := h.svc.CreateOrganization(ctx, ownerID, req.Name, req.Description)
	if err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.CreateOrganizationResponse{Organization: mapOrganization(o)}, nil
}

// GetOrganization retrieves an organization by id. When user_id is supplied, the
// caller's role is filled into Organization.member_role.
func (h *WorkspaceHandler) GetOrganization(ctx context.Context, req *workspacepb.GetOrganizationRequest) (*workspacepb.GetOrganizationResponse, error) {
	orgID, err := uuid.Parse(req.OrgId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid org_id")
	}
	userID, _ := uuid.Parse(req.UserId) // optional; uuid.Nil when absent
	o, err := h.svc.GetOrganization(ctx, orgID, userID)
	if err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.GetOrganizationResponse{Organization: mapOrganization(o)}, nil
}

// ListOrganizationsForUser returns every organization the user belongs to.
func (h *WorkspaceHandler) ListOrganizationsForUser(ctx context.Context, req *workspacepb.ListOrganizationsForUserRequest) (*workspacepb.ListOrganizationsForUserResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}
	orgs, err := h.svc.ListOrganizationsForUser(ctx, userID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &workspacepb.ListOrganizationsForUserResponse{Organizations: mapOrganizations(orgs)}, nil
}

// UpdateOrganization applies changes to an organization's name, description, or
// avatar URL. Empty strings are ignored.
func (h *WorkspaceHandler) UpdateOrganization(ctx context.Context, req *workspacepb.UpdateOrganizationRequest) (*workspacepb.UpdateOrganizationResponse, error) {
	orgID, err := uuid.Parse(req.OrgId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid org_id")
	}
	o, err := h.svc.UpdateOrganization(ctx, orgID, service.MetadataPatch{Name: req.Name, Description: req.Description, AvatarURL: req.AvatarUrl})
	if err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.UpdateOrganizationResponse{Organization: mapOrganization(o)}, nil
}

// DeleteOrganization permanently removes an organization. Returns PermissionDenied
// if the caller is not the owner.
func (h *WorkspaceHandler) DeleteOrganization(ctx context.Context, req *workspacepb.DeleteOrganizationRequest) (*workspacepb.DeleteOrganizationResponse, error) {
	orgID, err := uuid.Parse(req.OrgId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid org_id")
	}
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}
	if err := h.svc.DeleteOrganization(ctx, orgID, userID); err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.DeleteOrganizationResponse{Success: true}, nil
}

// ─── Organization members ──────────────────────────────────────────────────────

// AddOrgMember adds a user to an organization with the given role.
func (h *WorkspaceHandler) AddOrgMember(ctx context.Context, req *workspacepb.AddOrgMemberRequest) (*workspacepb.AddOrgMemberResponse, error) {
	orgID, _ := uuid.Parse(req.OrgId)
	userID, _ := uuid.Parse(req.UserId)
	invitedBy, _ := uuid.Parse(req.InvitedBy)
	m, err := h.svc.AddOrgMember(ctx, orgID, userID, invitedBy, domain.MemberRole(req.Role))
	if err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.AddOrgMemberResponse{Member: mapOrgMember(m)}, nil
}

// GetOrgMember returns a single membership row — used by the gateway to resolve
// the caller's role for authorization.
func (h *WorkspaceHandler) GetOrgMember(ctx context.Context, req *workspacepb.GetOrgMemberRequest) (*workspacepb.GetOrgMemberResponse, error) {
	orgID, _ := uuid.Parse(req.OrgId)
	userID, _ := uuid.Parse(req.UserId)
	m, err := h.svc.GetOrgMember(ctx, orgID, userID)
	if err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.GetOrgMemberResponse{Member: mapOrgMember(m)}, nil
}

// RemoveOrgMember removes a user from an organization. Returns FailedPrecondition
// if the target is the owner.
func (h *WorkspaceHandler) RemoveOrgMember(ctx context.Context, req *workspacepb.RemoveOrgMemberRequest) (*workspacepb.RemoveOrgMemberResponse, error) {
	orgID, _ := uuid.Parse(req.OrgId)
	userID, _ := uuid.Parse(req.UserId)
	if err := h.svc.RemoveOrgMember(ctx, orgID, userID); err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.RemoveOrgMemberResponse{Success: true}, nil
}

// UpdateOrgMemberRole changes the role of an existing organization member.
func (h *WorkspaceHandler) UpdateOrgMemberRole(ctx context.Context, req *workspacepb.UpdateOrgMemberRoleRequest) (*workspacepb.UpdateOrgMemberRoleResponse, error) {
	orgID, _ := uuid.Parse(req.OrgId)
	userID, _ := uuid.Parse(req.UserId)
	m, err := h.svc.UpdateOrgMemberRole(ctx, orgID, userID, domain.MemberRole(req.Role))
	if err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.UpdateOrgMemberRoleResponse{Member: mapOrgMember(m)}, nil
}

// ListOrgMembers returns all current members of an organization.
func (h *WorkspaceHandler) ListOrgMembers(ctx context.Context, req *workspacepb.ListOrgMembersRequest) (*workspacepb.ListOrgMembersResponse, error) {
	orgID, _ := uuid.Parse(req.OrgId)
	members, err := h.svc.ListOrgMembers(ctx, orgID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	var pbMembers []*workspacepb.OrgMember
	for _, m := range members {
		m := m
		pbMembers = append(pbMembers, mapOrgMember(&m))
	}
	return &workspacepb.ListOrgMembersResponse{Members: pbMembers}, nil
}

// CountOrgSeats returns the number of members in a single organization — the
// billable seat count for that org's per-seat subscription.
func (h *WorkspaceHandler) CountOrgSeats(ctx context.Context, req *workspacepb.CountOrgSeatsRequest) (*workspacepb.CountOrgSeatsResponse, error) {
	orgID, err := uuid.Parse(req.OrgId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid org_id")
	}
	seats, err := h.svc.CountOrgSeats(ctx, orgID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	pending, err := h.svc.CountPendingOrgInvites(ctx, orgID)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &workspacepb.CountOrgSeatsResponse{Seats: int32(seats), PendingInvites: int32(pending)}, nil
}

// ListIncomingOrgInvites returns the pending org invites addressed to an email.
func (h *WorkspaceHandler) ListIncomingOrgInvites(ctx context.Context, req *workspacepb.ListIncomingOrgInvitesRequest) (*workspacepb.ListIncomingOrgInvitesResponse, error) {
	if req.Email == "" {
		return nil, status.Error(codes.InvalidArgument, "email is required")
	}
	invites, err := h.svc.ListIncomingOrgInvites(ctx, req.Email)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	out := make([]*workspacepb.IncomingOrgInvite, 0, len(invites))
	for _, inv := range invites {
		out = append(out, &workspacepb.IncomingOrgInvite{
			Token:   inv.Token,
			OrgId:   inv.OrgID.String(),
			OrgName: inv.OrgName,
			Role:    string(inv.Role),
		})
	}
	return &workspacepb.ListIncomingOrgInvitesResponse{Invites: out}, nil
}

// ─── Organization invites ──────────────────────────────────────────────────────

// InviteOrgMember generates a time-limited invitation token for the given email.
func (h *WorkspaceHandler) InviteOrgMember(ctx context.Context, req *workspacepb.InviteOrgMemberRequest) (*workspacepb.InviteOrgMemberResponse, error) {
	orgID, _ := uuid.Parse(req.OrgId)
	invitedBy, _ := uuid.Parse(req.InvitedBy)
	token, err := h.svc.InviteOrgMember(ctx, orgID, req.Email, domain.InviteRole(req.Role), invitedBy)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &workspacepb.InviteOrgMemberResponse{InviteToken: token}, nil
}

// AcceptOrgInvite redeems an invitation token, adding the user to the organization.
func (h *WorkspaceHandler) AcceptOrgInvite(ctx context.Context, req *workspacepb.AcceptOrgInviteRequest) (*workspacepb.AcceptOrgInviteResponse, error) {
	userID, _ := uuid.Parse(req.UserId)
	o, err := h.svc.AcceptOrgInvite(ctx, req.Token, userID)
	if err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.AcceptOrgInviteResponse{Organization: mapOrganization(o)}, nil
}

// DeclineOrgInvite invalidates an invitation token without adding the user.
func (h *WorkspaceHandler) DeclineOrgInvite(ctx context.Context, req *workspacepb.DeclineOrgInviteRequest) (*workspacepb.DeclineOrgInviteResponse, error) {
	if err := h.svc.DeclineOrgInvite(ctx, req.Token); err != nil {
		return nil, h.handleError(err)
	}
	return &workspacepb.DeclineOrgInviteResponse{Success: true}, nil
}

// ─── Mappers ───────────────────────────────────────────────────────────────────

// mapOrganization converts a domain Organization to its proto message. Optional
// pointer fields are only set when non-nil; MemberRole is forwarded when present.
func mapOrganization(o *domain.Organization) *workspacepb.Organization {
	po := &workspacepb.Organization{
		Id:         o.ID.String(),
		Name:       o.Name,
		Slug:       o.Slug,
		OwnerId:    o.OwnerID.String(),
		MemberRole: string(o.MemberRole),
	}
	if o.AvatarURL != nil {
		po.AvatarUrl = *o.AvatarURL
	}
	if o.Description != nil {
		po.Description = *o.Description
	}
	return po
}

// mapOrganizations converts a slice of domain Organizations to a proto slice.
func mapOrganizations(orgs []domain.Organization) []*workspacepb.Organization {
	var out []*workspacepb.Organization
	for _, o := range orgs {
		o := o
		out = append(out, mapOrganization(&o))
	}
	return out
}

// mapOrgMember converts a domain OrgMember to its proto message.
func mapOrgMember(m *domain.OrgMember) *workspacepb.OrgMember {
	pm := &workspacepb.OrgMember{
		Id:     m.ID.String(),
		OrgId:  m.OrgID.String(),
		UserId: m.UserID.String(),
		Role:   string(m.Role),
	}
	if m.InvitedBy != nil {
		pm.InvitedBy = m.InvitedBy.String()
	}
	return pm
}
