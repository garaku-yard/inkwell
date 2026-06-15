package workspace

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"inkwell/server/internal/gateway/apierror"
	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/internal/gateway/handlers"
	"inkwell/server/pkg/grpc/identity"
	workspacepb "inkwell/server/pkg/grpc/workspace"
)

// WorkspaceHandler routes workspace and category HTTP requests to the workspace
// gRPC service. URL parameters are extracted using chi's routing context. The
// identity client is held so InviteMember can accept `@username` and
// `username#tag` targets alongside plain emails.
type WorkspaceHandler struct {
	client         workspacepb.WorkspaceServiceClient
	identityClient identity.IdentityServiceClient
}

// NewWorkspaceHandler creates a WorkspaceHandler using the workspace + identity
// gRPC clients from the provided registry.
func NewWorkspaceHandler(clients *grpcclient.Registry) *WorkspaceHandler {
	return &WorkspaceHandler{
		client:         clients.Workspace,
		identityClient: clients.Identity,
	}
}

// ListCategories returns all available workspace content categories (e.g. "screenplay",
// "prose", "lyrics"). Categories are global and not user-scoped.
func (h *WorkspaceHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	resp, err := h.client.ListCategories(r.Context(), &workspacepb.ListCategoriesRequest{})
	if err != nil {
		handlers.HandleGRPCError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.Categories)
}

// listUserWorkspacesResponse partitions workspace listings by ownership type.
type listUserWorkspacesResponse struct {
	Personal any `json:"personal"`
	Org      any `json:"org"`
}

// ListUserWorkspaces returns the authenticated user's personal and organisation
// workspaces as two separate lists. Requires a userID from the request context.
func (h *WorkspaceHandler) ListUserWorkspaces(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, listUserWorkspacesResponse]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*listUserWorkspacesResponse, error) {
			resp, err := h.client.ListUserWorkspaces(r.Context(), &workspacepb.ListUserWorkspacesRequest{UserId: userID})
			if err != nil {
				return nil, err
			}
			return &listUserWorkspacesResponse{Personal: resp.Personal, Org: resp.Org}, nil
		},
	}.ServeHTTP(w, r)
}

// createPersonalWorkspacesBody is the JSON body for CreatePersonalWorkspaces.
type createPersonalWorkspacesBody struct {
	CategorySlugs []string `json:"category_slugs"`
}

// workspacesResponse wraps a list of workspaces.
type workspacesResponse struct {
	Workspaces any `json:"workspaces"`
}

// CreatePersonalWorkspaces provisions one personal workspace per category slug
// provided. Typically called during onboarding to seed the user's initial workspace set.
func (h *WorkspaceHandler) CreatePersonalWorkspaces(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[createPersonalWorkspacesBody, workspacesResponse]{
		Method:        http.MethodPost,
		Auth:          true,
		Decode:        handlers.JSONBody[createPersonalWorkspacesBody],
		SuccessStatus: http.StatusCreated,
		Handle: func(r *http.Request, userID string, body *createPersonalWorkspacesBody) (*workspacesResponse, error) {
			resp, err := h.client.CreatePersonalWorkspaces(r.Context(), &workspacepb.CreatePersonalWorkspacesRequest{
				UserId:        userID,
				CategorySlugs: body.CategorySlugs,
			})
			if err != nil {
				return nil, err
			}
			return &workspacesResponse{Workspaces: resp.Workspaces}, nil
		},
	}.ServeHTTP(w, r)
}

// CreateOrgWorkspace creates a new organisation workspace owned by the authenticated
// user. The name field is required; description and category_slugs are optional.
func (h *WorkspaceHandler) CreateOrgWorkspace(w http.ResponseWriter, r *http.Request) {
	userID := handlers.GetUserIDFromContext(r)
	if userID == "" {
		handlers.WriteError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		Name          string   `json:"name"`
		Description   string   `json:"description"`
		CategorySlugs []string `json:"category_slugs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		handlers.WriteError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if body.Name == "" {
		handlers.WriteError(w, "name is required", http.StatusBadRequest)
		return
	}

	resp, err := h.client.CreateOrgWorkspace(r.Context(), &workspacepb.CreateOrgWorkspaceRequest{
		OwnerId:       userID,
		Name:          body.Name,
		Description:   body.Description,
		CategorySlugs: body.CategorySlugs,
	})
	if err != nil {
		handlers.HandleGRPCError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp.Workspace)
}

// GetWorkspace returns a workspace by its ID, extracted from the "workspaceId"
// chi URL parameter.
func (h *WorkspaceHandler) GetWorkspace(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	resp, err := h.client.GetWorkspace(r.Context(), &workspacepb.GetWorkspaceRequest{WorkspaceId: workspaceID})
	if err != nil {
		handlers.HandleGRPCError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.Workspace)
}

// UpdateWorkspace applies partial updates to a workspace's name, description, or
// avatar URL. The workspace ID is extracted from the "workspaceId" chi URL parameter.
func (h *WorkspaceHandler) UpdateWorkspace(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")

	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		AvatarURL   string `json:"avatar_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		handlers.WriteError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	resp, err := h.client.UpdateWorkspace(r.Context(), &workspacepb.UpdateWorkspaceRequest{
		WorkspaceId: workspaceID,
		Name:        body.Name,
		Description: body.Description,
		AvatarUrl:   body.AvatarURL,
	})
	if err != nil {
		handlers.HandleGRPCError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.Workspace)
}

// DeleteWorkspace permanently removes a workspace. Requires a userID from the
// request context; the workspace service enforces that only the owner may delete.
func (h *WorkspaceHandler) DeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, struct{}]{
		Method:        http.MethodDelete,
		Auth:          true,
		Decode:        handlers.NoBody[struct{}],
		SuccessStatus: http.StatusNoContent,
		Handle: func(r *http.Request, userID string, _ *struct{}) (*struct{}, error) {
			workspaceID := chi.URLParam(r, "workspaceId")
			if workspaceID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "workspace ID is required")
			}
			if _, err := h.client.DeleteWorkspace(r.Context(), &workspacepb.DeleteWorkspaceRequest{
				WorkspaceId: workspaceID,
				UserId:      userID,
			}); err != nil {
				return nil, err
			}
			return nil, nil
		},
	}.ServeHTTP(w, r)
}

// workspaceEnvelope wraps a single workspace as the response body. Used by
// the category enable/disable endpoints which return the updated workspace.
type workspaceEnvelope struct{ Workspace any }

func (e workspaceEnvelope) MarshalJSON() ([]byte, error) {
	// EnableCategory / DisableCategory historically returned the bare
	// workspace object (not wrapped in a `{ "workspace": … }` envelope).
	// Keep that wire format so existing clients keep working.
	return json.Marshal(e.Workspace)
}

// EnableCategory adds a content category to a workspace by slug, making it
// available for organising projects within that workspace.
func (h *WorkspaceHandler) EnableCategory(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, workspaceEnvelope]{
		Method: http.MethodPost,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, _ string, _ *struct{}) (*workspaceEnvelope, error) {
			resp, err := h.client.EnableCategory(r.Context(), &workspacepb.EnableCategoryRequest{
				WorkspaceId:  chi.URLParam(r, "workspaceId"),
				CategorySlug: chi.URLParam(r, "slug"),
			})
			if err != nil {
				return nil, err
			}
			return &workspaceEnvelope{Workspace: resp.Workspace}, nil
		},
	}.ServeHTTP(w, r)
}

// DisableCategory removes a content category from a workspace by slug.
func (h *WorkspaceHandler) DisableCategory(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, workspaceEnvelope]{
		Method: http.MethodDelete,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, _ string, _ *struct{}) (*workspaceEnvelope, error) {
			resp, err := h.client.DisableCategory(r.Context(), &workspacepb.DisableCategoryRequest{
				WorkspaceId:  chi.URLParam(r, "workspaceId"),
				CategorySlug: chi.URLParam(r, "slug"),
			})
			if err != nil {
				return nil, err
			}
			return &workspaceEnvelope{Workspace: resp.Workspace}, nil
		},
	}.ServeHTTP(w, r)
}

// ListMembers returns all current members of a workspace.
func (h *WorkspaceHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	resp, err := h.client.ListMembers(r.Context(), &workspacepb.ListMembersRequest{WorkspaceId: workspaceID})
	if err != nil {
		handlers.HandleGRPCError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.Members)
}

// InviteMember generates a workspace invitation token for the given target and
// role. The `target` field accepts a plain email, an `@username` handle, or a
// `username#tag` discriminator — mirroring project-collaborator invites.
// Non-email targets are resolved to an email via the identity service before
// being handed to the workspace service. The token is returned to the caller
// and should be delivered to the invitee out-of-band. Requires a userID from
// the request context as the inviter.
//
// For backwards compatibility, callers may still send a plain `email` field
// and it's treated as the target.
func (h *WorkspaceHandler) InviteMember(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	invitedBy := handlers.GetUserIDFromContext(r)
	if invitedBy == "" {
		handlers.WriteError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		Target string `json:"target"`
		Email  string `json:"email"` // legacy alias for Target
		Role   string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		handlers.WriteError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	target := body.Target
	if target == "" {
		target = body.Email
	}
	if target == "" || body.Role == "" {
		handlers.WriteError(w, "target (email or @username or username#tag) and role are required", http.StatusBadRequest)
		return
	}

	// Resolve @username / username#tag to an email. Plain emails pass through
	// unchanged. A resolution failure means the user doesn't exist — surface
	// that as 400 so the UI can hint the inviter checked the handle.
	resolvedEmail, err := ResolveEmailOrTag(r.Context(), h.identityClient, target)
	if err != nil {
		handlers.WriteError(w, err.Error(), http.StatusBadRequest)
		return
	}

	resp, err := h.client.InviteMember(r.Context(), &workspacepb.InviteMemberRequest{
		WorkspaceId: workspaceID,
		Email:       resolvedEmail,
		Role:        body.Role,
		InvitedBy:   invitedBy,
	})
	if err != nil {
		handlers.HandleGRPCError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"invite_token": resp.InviteToken})
}

// AcceptInvite redeems an invitation token for the authenticated user, adding them
// to the workspace. The token is extracted from the "token" chi URL parameter.
func (h *WorkspaceHandler) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	userID := handlers.GetUserIDFromContext(r)
	if userID == "" {
		handlers.WriteError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	resp, err := h.client.AcceptInvite(r.Context(), &workspacepb.AcceptInviteRequest{
		Token:  token,
		UserId: userID,
	})
	if err != nil {
		handlers.HandleGRPCError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.Workspace)
}

// DeclineInvite invalidates an invitation token without adding the user to the workspace.
func (h *WorkspaceHandler) DeclineInvite(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	_, err := h.client.DeclineInvite(r.Context(), &workspacepb.DeclineInviteRequest{Token: token})
	if err != nil {
		handlers.HandleGRPCError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// UpdateMemberRole changes the role of a workspace member identified by the
// "userId" chi URL parameter.
func (h *WorkspaceHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	targetUserID := chi.URLParam(r, "userId")

	var body struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		handlers.WriteError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	resp, err := h.client.UpdateMemberRole(r.Context(), &workspacepb.UpdateMemberRoleRequest{
		WorkspaceId: workspaceID,
		UserId:      targetUserID,
		Role:        body.Role,
	})
	if err != nil {
		handlers.HandleGRPCError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.Member)
}

// RemoveMember removes a member from a workspace. The target user ID is extracted
// from the "userId" chi URL parameter.
func (h *WorkspaceHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	targetUserID := chi.URLParam(r, "userId")

	_, err := h.client.RemoveMember(r.Context(), &workspacepb.RemoveMemberRequest{
		WorkspaceId: workspaceID,
		UserId:      targetUserID,
	})
	if err != nil {
		handlers.HandleGRPCError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
