package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"google.golang.org/grpc/codes"
	grpcstatus "google.golang.org/grpc/status"

	"scriptlith/server/internal/gateway/grpcclient"
	workspacepb "scriptlith/server/pkg/grpc/workspace"
)

// WorkspaceHandler handles workspace and category HTTP endpoints.
type WorkspaceHandler struct {
	client workspacepb.WorkspaceServiceClient
}

// NewWorkspaceHandler creates a new WorkspaceHandler.
func NewWorkspaceHandler(clients *grpcclient.Registry) *WorkspaceHandler {
	return &WorkspaceHandler{client: clients.Workspace}
}

// GET /categories
func (h *WorkspaceHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	resp, err := h.client.ListCategories(r.Context(), &workspacepb.ListCategoriesRequest{})
	if err != nil {
		writeError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.Categories)
}

// GET /workspaces
func (h *WorkspaceHandler) ListUserWorkspaces(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	resp, err := h.client.ListUserWorkspaces(r.Context(), &workspacepb.ListUserWorkspacesRequest{UserId: userID})
	if err != nil {
		writeError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"personal": resp.Personal,
		"org":      resp.Org,
	})
}

// POST /workspaces/personal
func (h *WorkspaceHandler) CreatePersonalWorkspaces(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		CategorySlugs []string `json:"category_slugs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	resp, err := h.client.CreatePersonalWorkspaces(r.Context(), &workspacepb.CreatePersonalWorkspacesRequest{
		UserId:        userID,
		CategorySlugs: body.CategorySlugs,
	})
	if err != nil {
		writeError(w, err.Error(), grpcCodeToHTTP(err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"workspaces": resp.Workspaces,
	})
}

// POST /workspaces/org
func (h *WorkspaceHandler) CreateOrgWorkspace(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		Name          string   `json:"name"`
		Description   string   `json:"description"`
		CategorySlugs []string `json:"category_slugs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if body.Name == "" {
		writeError(w, "name is required", http.StatusBadRequest)
		return
	}

	resp, err := h.client.CreateOrgWorkspace(r.Context(), &workspacepb.CreateOrgWorkspaceRequest{
		OwnerId:       userID,
		Name:          body.Name,
		Description:   body.Description,
		CategorySlugs: body.CategorySlugs,
	})
	if err != nil {
		writeError(w, err.Error(), grpcCodeToHTTP(err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp.Workspace)
}

// GET /workspaces/{workspaceId}
func (h *WorkspaceHandler) GetWorkspace(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	resp, err := h.client.GetWorkspace(r.Context(), &workspacepb.GetWorkspaceRequest{WorkspaceId: workspaceID})
	if err != nil {
		writeError(w, err.Error(), grpcCodeToHTTP(err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.Workspace)
}

// PATCH /workspaces/{workspaceId}
func (h *WorkspaceHandler) UpdateWorkspace(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")

	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		AvatarURL   string `json:"avatar_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	resp, err := h.client.UpdateWorkspace(r.Context(), &workspacepb.UpdateWorkspaceRequest{
		WorkspaceId: workspaceID,
		Name:        body.Name,
		Description: body.Description,
		AvatarUrl:   body.AvatarURL,
	})
	if err != nil {
		writeError(w, err.Error(), grpcCodeToHTTP(err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.Workspace)
}

// DELETE /workspaces/{workspaceId}
func (h *WorkspaceHandler) DeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	_, err := h.client.DeleteWorkspace(r.Context(), &workspacepb.DeleteWorkspaceRequest{
		WorkspaceId: workspaceID,
		UserId:      userID,
	})
	if err != nil {
		writeError(w, err.Error(), grpcCodeToHTTP(err))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /workspaces/{workspaceId}/categories/{slug}
func (h *WorkspaceHandler) EnableCategory(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	slug := chi.URLParam(r, "slug")

	resp, err := h.client.EnableCategory(r.Context(), &workspacepb.EnableCategoryRequest{
		WorkspaceId:  workspaceID,
		CategorySlug: slug,
	})
	if err != nil {
		writeError(w, err.Error(), grpcCodeToHTTP(err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.Workspace)
}

// DELETE /workspaces/{workspaceId}/categories/{slug}
func (h *WorkspaceHandler) DisableCategory(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	slug := chi.URLParam(r, "slug")

	resp, err := h.client.DisableCategory(r.Context(), &workspacepb.DisableCategoryRequest{
		WorkspaceId:  workspaceID,
		CategorySlug: slug,
	})
	if err != nil {
		writeError(w, err.Error(), grpcCodeToHTTP(err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.Workspace)
}

// GET /workspaces/{workspaceId}/members
func (h *WorkspaceHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	resp, err := h.client.ListMembers(r.Context(), &workspacepb.ListMembersRequest{WorkspaceId: workspaceID})
	if err != nil {
		writeError(w, err.Error(), grpcCodeToHTTP(err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.Members)
}

// POST /workspaces/{workspaceId}/members/invite
func (h *WorkspaceHandler) InviteMember(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	invitedBy := getUserIDFromContext(r)
	if invitedBy == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if body.Email == "" || body.Role == "" {
		writeError(w, "email and role are required", http.StatusBadRequest)
		return
	}

	resp, err := h.client.InviteMember(r.Context(), &workspacepb.InviteMemberRequest{
		WorkspaceId: workspaceID,
		Email:       body.Email,
		Role:        body.Role,
		InvitedBy:   invitedBy,
	})
	if err != nil {
		writeError(w, err.Error(), grpcCodeToHTTP(err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"invite_token": resp.InviteToken})
}

// POST /workspaces/invites/{token}/accept
func (h *WorkspaceHandler) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	resp, err := h.client.AcceptInvite(r.Context(), &workspacepb.AcceptInviteRequest{
		Token:  token,
		UserId: userID,
	})
	if err != nil {
		writeError(w, err.Error(), grpcCodeToHTTP(err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.Workspace)
}

// POST /workspaces/invites/{token}/decline
func (h *WorkspaceHandler) DeclineInvite(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	_, err := h.client.DeclineInvite(r.Context(), &workspacepb.DeclineInviteRequest{Token: token})
	if err != nil {
		writeError(w, err.Error(), grpcCodeToHTTP(err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// PATCH /workspaces/{workspaceId}/members/{userId}/role
func (h *WorkspaceHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	targetUserID := chi.URLParam(r, "userId")

	var body struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	resp, err := h.client.UpdateMemberRole(r.Context(), &workspacepb.UpdateMemberRoleRequest{
		WorkspaceId: workspaceID,
		UserId:      targetUserID,
		Role:        body.Role,
	})
	if err != nil {
		writeError(w, err.Error(), grpcCodeToHTTP(err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp.Member)
}

// DELETE /workspaces/{workspaceId}/members/{userId}
func (h *WorkspaceHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	targetUserID := chi.URLParam(r, "userId")

	_, err := h.client.RemoveMember(r.Context(), &workspacepb.RemoveMemberRequest{
		WorkspaceId: workspaceID,
		UserId:      targetUserID,
	})
	if err != nil {
		writeError(w, err.Error(), grpcCodeToHTTP(err))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// grpcCodeToHTTP maps a gRPC error to an HTTP status code.
func grpcCodeToHTTP(err error) int {
	if st, ok := grpcstatus.FromError(err); ok {
		switch st.Code() {
		case codes.NotFound:
			return http.StatusNotFound
		case codes.AlreadyExists:
			return http.StatusConflict
		case codes.InvalidArgument:
			return http.StatusBadRequest
		case codes.PermissionDenied:
			return http.StatusForbidden
		case codes.Unauthenticated:
			return http.StatusUnauthorized
		case codes.FailedPrecondition:
			return http.StatusUnprocessableEntity
		}
	}
	return http.StatusInternalServerError
}
