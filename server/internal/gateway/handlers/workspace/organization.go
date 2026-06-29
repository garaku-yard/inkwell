package workspace

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"

	"inkwell/server/internal/gateway/apierror"
	"inkwell/server/internal/gateway/handlers"
	workspacepb "inkwell/server/pkg/grpc/workspace"
)

// Organization roles, mirrored from the workspace member vocabulary. Management
// actions (invite / change role / remove / update / delete) require owner or
// admin; reads require any membership.
const (
	roleOwner = "owner"
	roleAdmin = "admin"
)

// requireOrgRole resolves the caller's role in the org and authorizes the
// request against the allowed roles, returning 403 when the caller is not a
// member or lacks a permitted role. This is the authorization the legacy
// workspace member endpoints never had: every org member mutation is gated on
// the caller's real, server-resolved role — never a client-supplied value.
func (h *WorkspaceHandler) requireOrgRole(ctx context.Context, orgID, userID string, allowed ...string) error {
	resp, err := h.client.GetOrgMember(ctx, &workspacepb.GetOrgMemberRequest{OrgId: orgID, UserId: userID})
	if err != nil {
		return apierror.New(apierror.CodePermissionDenied, http.StatusForbidden, "you are not a member of this organization")
	}
	role := resp.GetMember().GetRole()
	for _, a := range allowed {
		if role == a {
			return nil
		}
	}
	return apierror.New(apierror.CodePermissionDenied, http.StatusForbidden, "you do not have permission to perform this action in this organization")
}

// CreateOrganization provisions a new organization owned by the authenticated
// user. Gated behind the Business billing tier (orgs are the Business feature);
// the owner becomes the first member.
func (h *WorkspaceHandler) CreateOrganization(w http.ResponseWriter, r *http.Request) {
	type createOrgBody struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	handlers.Endpoint[createOrgBody, workspacepb.Organization]{
		Method:        http.MethodPost,
		Auth:          true,
		Decode:        jsonBodyOrInvalid[createOrgBody],
		SuccessStatus: http.StatusCreated,
		Handle: func(r *http.Request, userID string, body *createOrgBody) (*workspacepb.Organization, error) {
			if body.Name == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "name is required")
			}
			if err := h.checkBusinessWorkspaceEntitlement(r.Context(), userID); err != nil {
				return nil, err
			}
			resp, err := h.client.CreateOrganization(r.Context(), &workspacepb.CreateOrganizationRequest{
				OwnerId:     userID,
				Name:        body.Name,
				Description: body.Description,
			})
			if err != nil {
				return nil, err
			}
			return resp.Organization, nil
		},
	}.ServeHTTP(w, r)
}

// ListOrganizations returns every organization the authenticated user belongs to.
func (h *WorkspaceHandler) ListOrganizations(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, []*workspacepb.Organization]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*[]*workspacepb.Organization, error) {
			resp, err := h.client.ListOrganizationsForUser(r.Context(), &workspacepb.ListOrganizationsForUserRequest{UserId: userID})
			if err != nil {
				return nil, err
			}
			return &resp.Organizations, nil
		},
	}.ServeHTTP(w, r)
}

// GetOrganization returns an organization by id. Requires the caller to be a
// member; the caller's role is echoed back in member_role.
func (h *WorkspaceHandler) GetOrganization(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, workspacepb.Organization]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*workspacepb.Organization, error) {
			orgID := chi.URLParam(r, "orgId")
			if err := h.requireOrgRole(r.Context(), orgID, userID, roleOwner, roleAdmin, "editor", "viewer"); err != nil {
				return nil, err
			}
			resp, err := h.client.GetOrganization(r.Context(), &workspacepb.GetOrganizationRequest{OrgId: orgID, UserId: userID})
			if err != nil {
				return nil, err
			}
			return resp.Organization, nil
		},
	}.ServeHTTP(w, r)
}

// UpdateOrganization applies partial updates. Requires owner or admin.
func (h *WorkspaceHandler) UpdateOrganization(w http.ResponseWriter, r *http.Request) {
	type updateOrgBody struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		AvatarURL   string `json:"avatar_url"`
	}
	handlers.Endpoint[updateOrgBody, workspacepb.Organization]{
		Auth:   true,
		Decode: jsonBodyOrInvalid[updateOrgBody],
		Handle: func(r *http.Request, userID string, body *updateOrgBody) (*workspacepb.Organization, error) {
			orgID := chi.URLParam(r, "orgId")
			if err := h.requireOrgRole(r.Context(), orgID, userID, roleOwner, roleAdmin); err != nil {
				return nil, err
			}
			resp, err := h.client.UpdateOrganization(r.Context(), &workspacepb.UpdateOrganizationRequest{
				OrgId:       orgID,
				Name:        body.Name,
				Description: body.Description,
				AvatarUrl:   body.AvatarURL,
			})
			if err != nil {
				return nil, err
			}
			return resp.Organization, nil
		},
	}.ServeHTTP(w, r)
}

// DeleteOrganization permanently removes an organization. Owner only (the
// service re-checks ownership defensively).
func (h *WorkspaceHandler) DeleteOrganization(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, struct{}]{
		Method:        http.MethodDelete,
		Auth:          true,
		Decode:        handlers.NoBody[struct{}],
		SuccessStatus: http.StatusNoContent,
		Handle: func(r *http.Request, userID string, _ *struct{}) (*struct{}, error) {
			orgID := chi.URLParam(r, "orgId")
			if err := h.requireOrgRole(r.Context(), orgID, userID, roleOwner); err != nil {
				return nil, err
			}
			if _, err := h.client.DeleteOrganization(r.Context(), &workspacepb.DeleteOrganizationRequest{
				OrgId:  orgID,
				UserId: userID,
			}); err != nil {
				return nil, err
			}
			return nil, nil
		},
	}.ServeHTTP(w, r)
}

// ListOrgMembers returns the org's members. Requires membership.
func (h *WorkspaceHandler) ListOrgMembers(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, []*workspacepb.OrgMember]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*[]*workspacepb.OrgMember, error) {
			orgID := chi.URLParam(r, "orgId")
			if err := h.requireOrgRole(r.Context(), orgID, userID, roleOwner, roleAdmin, "editor", "viewer"); err != nil {
				return nil, err
			}
			resp, err := h.client.ListOrgMembers(r.Context(), &workspacepb.ListOrgMembersRequest{OrgId: orgID})
			if err != nil {
				return nil, err
			}
			return &resp.Members, nil
		},
	}.ServeHTTP(w, r)
}

// InviteOrgMember generates an invitation token. Requires owner or admin. The
// target accepts a plain email, an `@username`, or a `username#tag`.
func (h *WorkspaceHandler) InviteOrgMember(w http.ResponseWriter, r *http.Request) {
	type inviteBody struct {
		Target string `json:"target"`
		Email  string `json:"email"` // legacy alias for Target
		Role   string `json:"role"`
	}
	handlers.Endpoint[inviteBody, map[string]string]{
		Method:        http.MethodPost,
		Auth:          true,
		Decode:        jsonBodyOrInvalid[inviteBody],
		SuccessStatus: http.StatusCreated,
		Handle: func(r *http.Request, invitedBy string, body *inviteBody) (*map[string]string, error) {
			orgID := chi.URLParam(r, "orgId")
			if err := h.requireOrgRole(r.Context(), orgID, invitedBy, roleOwner, roleAdmin); err != nil {
				return nil, err
			}
			target := body.Target
			if target == "" {
				target = body.Email
			}
			if target == "" || body.Role == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "target (email or @username or username#tag) and role are required")
			}
			resolvedEmail, err := ResolveEmailOrTag(r.Context(), h.identityClient, target)
			if err != nil {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, err.Error())
			}
			resp, err := h.client.InviteOrgMember(r.Context(), &workspacepb.InviteOrgMemberRequest{
				OrgId:     orgID,
				Email:     resolvedEmail,
				Role:      body.Role,
				InvitedBy: invitedBy,
			})
			if err != nil {
				return nil, err
			}
			return &map[string]string{"invite_token": resp.InviteToken}, nil
		},
	}.ServeHTTP(w, r)
}

// UpdateOrgMemberRole changes a member's role. Requires owner or admin.
func (h *WorkspaceHandler) UpdateOrgMemberRole(w http.ResponseWriter, r *http.Request) {
	type updateRoleBody struct {
		Role string `json:"role"`
	}
	handlers.Endpoint[updateRoleBody, workspacepb.OrgMember]{
		Auth:   true,
		Decode: jsonBodyOrInvalid[updateRoleBody],
		Handle: func(r *http.Request, userID string, body *updateRoleBody) (*workspacepb.OrgMember, error) {
			orgID := chi.URLParam(r, "orgId")
			if err := h.requireOrgRole(r.Context(), orgID, userID, roleOwner, roleAdmin); err != nil {
				return nil, err
			}
			resp, err := h.client.UpdateOrgMemberRole(r.Context(), &workspacepb.UpdateOrgMemberRoleRequest{
				OrgId:  orgID,
				UserId: chi.URLParam(r, "userId"),
				Role:   body.Role,
			})
			if err != nil {
				return nil, err
			}
			return resp.Member, nil
		},
	}.ServeHTTP(w, r)
}

// RemoveOrgMember removes a member. Requires owner or admin.
func (h *WorkspaceHandler) RemoveOrgMember(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, struct{}]{
		Method:        http.MethodDelete,
		Auth:          true,
		Decode:        handlers.NoBody[struct{}],
		SuccessStatus: http.StatusNoContent,
		Handle: func(r *http.Request, userID string, _ *struct{}) (*struct{}, error) {
			orgID := chi.URLParam(r, "orgId")
			if err := h.requireOrgRole(r.Context(), orgID, userID, roleOwner, roleAdmin); err != nil {
				return nil, err
			}
			if _, err := h.client.RemoveOrgMember(r.Context(), &workspacepb.RemoveOrgMemberRequest{
				OrgId:  orgID,
				UserId: chi.URLParam(r, "userId"),
			}); err != nil {
				return nil, err
			}
			return nil, nil
		},
	}.ServeHTTP(w, r)
}

// OrgSeats returns the org's current seat count. Requires membership.
func (h *WorkspaceHandler) OrgSeats(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, map[string]int32]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*map[string]int32, error) {
			orgID := chi.URLParam(r, "orgId")
			if err := h.requireOrgRole(r.Context(), orgID, userID, roleOwner, roleAdmin, "editor", "viewer"); err != nil {
				return nil, err
			}
			resp, err := h.client.CountOrgSeats(r.Context(), &workspacepb.CountOrgSeatsRequest{OrgId: orgID})
			if err != nil {
				return nil, err
			}
			return &map[string]int32{"seats": resp.Seats}, nil
		},
	}.ServeHTTP(w, r)
}

// AcceptOrgInvite redeems an invitation token for the authenticated user.
func (h *WorkspaceHandler) AcceptOrgInvite(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, workspacepb.Organization]{
		Method: http.MethodPost,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*workspacepb.Organization, error) {
			resp, err := h.client.AcceptOrgInvite(r.Context(), &workspacepb.AcceptOrgInviteRequest{
				Token:  chi.URLParam(r, "token"),
				UserId: userID,
			})
			if err != nil {
				return nil, err
			}
			return resp.Organization, nil
		},
	}.ServeHTTP(w, r)
}

// DeclineOrgInvite invalidates an invitation token.
func (h *WorkspaceHandler) DeclineOrgInvite(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, map[string]bool]{
		Method: http.MethodPost,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, _ string, _ *struct{}) (*map[string]bool, error) {
			if _, err := h.client.DeclineOrgInvite(r.Context(), &workspacepb.DeclineOrgInviteRequest{
				Token: chi.URLParam(r, "token"),
			}); err != nil {
				return nil, err
			}
			return &map[string]bool{"success": true}, nil
		},
	}.ServeHTTP(w, r)
}
