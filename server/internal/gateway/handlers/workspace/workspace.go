package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"inkwell/server/internal/gateway/apierror"
	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/internal/gateway/handlers"
	billingpb "inkwell/server/pkg/grpc/billing"
	"inkwell/server/pkg/grpc/identity"
	workspacepb "inkwell/server/pkg/grpc/workspace"
)

// jsonBodyOrInvalid decodes a JSON request body, reproducing the legacy
// "Invalid JSON" 400 message that several workspace handlers emitted before the
// Endpoint migration. handlers.JSONBody returns "invalid JSON" / "request body
// is required" instead, so handlers needing the old wording use this closure.
// Endpoint's decode path emits the returned error's text verbatim as the 400
// message, so this returns a plain error to preserve the exact "Invalid JSON".
func jsonBodyOrInvalid[T any](r *http.Request) (*T, error) {
	var body T
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		return nil, errors.New("Invalid JSON")
	}
	return &body, nil
}

// WorkspaceHandler routes workspace and category HTTP requests to the workspace
// gRPC service. URL parameters are extracted using chi's routing context. The
// identity client is held so InviteMember can accept `@username` and
// `username#tag` targets alongside plain emails.
type WorkspaceHandler struct {
	client         workspacepb.WorkspaceServiceClient
	identityClient identity.IdentityServiceClient
	billingClient  billingpb.BillingServiceClient
}

// NewWorkspaceHandler creates a WorkspaceHandler using the workspace + identity
// + billing gRPC clients from the provided registry.
func NewWorkspaceHandler(clients *grpcclient.Registry) *WorkspaceHandler {
	return &WorkspaceHandler{
		client:         clients.Workspace,
		identityClient: clients.Identity,
		billingClient:  clients.Billing,
	}
}

// checkBusinessWorkspaceEntitlement gates org (business) workspace creation behind
// the user's effective billing tier. It mirrors the collaborator-quota gate's
// philosophy: only DENY on a definitive negative (a resolved tier that does not
// include business workspaces). Any billing lookup error fails OPEN so a billing
// blip never blocks a legitimate Business customer; a configured, reachable
// billing service enforces the paywall.
func (h *WorkspaceHandler) checkBusinessWorkspaceEntitlement(ctx context.Context, userID string) error {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	resp, err := h.billingClient.GetEffectiveTier(ctx, &billingpb.GetEffectiveTierRequest{UserId: userID})
	if err != nil || resp.GetPlan() == nil {
		return nil // fail open
	}
	if !resp.GetPlan().GetBusinessWorkspaces() {
		return apierror.New(
			apierror.CodeFailedPrecondition,
			http.StatusForbidden,
			"Organization workspaces require the Business plan. Upgrade to create one.",
		)
	}
	return nil
}

// syncOrgSeats keeps the org owner's per-seat subscription quantity in step with
// actual membership after a member joins or leaves. Best-effort: it runs for org
// workspaces only and never surfaces an error to the caller — a failed sync is
// logged and corrected by the next membership change or webhook.
func (h *WorkspaceHandler) syncOrgSeats(ctx context.Context, ws *workspacepb.Workspace) {
	if ws == nil || ws.GetType() != "org" {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	seatResp, err := h.client.CountOwnerSeats(ctx, &workspacepb.CountOwnerSeatsRequest{OwnerId: ws.GetOwnerId()})
	if err != nil {
		log.Printf("syncOrgSeats: count seats for owner %s: %v", ws.GetOwnerId(), err)
		return
	}
	if _, err := h.billingClient.SyncSeats(ctx, &billingpb.SyncSeatsRequest{
		UserId: ws.GetOwnerId(),
		Seats:  seatResp.GetSeats(),
	}); err != nil {
		log.Printf("syncOrgSeats: billing sync for owner %s: %v", ws.GetOwnerId(), err)
	}
}

// ListCategories returns all available workspace content categories (e.g. "screenplay",
// "prose", "lyrics"). Categories are global and not user-scoped.
func (h *WorkspaceHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, []*workspacepb.Category]{
		Method: http.MethodGet,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, _ string, _ *struct{}) (*[]*workspacepb.Category, error) {
			resp, err := h.client.ListCategories(r.Context(), &workspacepb.ListCategoriesRequest{})
			if err != nil {
				return nil, err
			}
			return &resp.Categories, nil
		},
	}.ServeHTTP(w, r)
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
	type createOrgWorkspaceBody struct {
		Name          string   `json:"name"`
		Description   string   `json:"description"`
		CategorySlugs []string `json:"category_slugs"`
	}
	handlers.Endpoint[createOrgWorkspaceBody, workspacepb.Workspace]{
		Method:        http.MethodPost,
		Auth:          true,
		Decode:        jsonBodyOrInvalid[createOrgWorkspaceBody],
		SuccessStatus: http.StatusCreated,
		Handle: func(r *http.Request, userID string, body *createOrgWorkspaceBody) (*workspacepb.Workspace, error) {
			if body.Name == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "name is required")
			}
			// Gate behind the owner's billing tier — org workspaces are a Business feature.
			if err := h.checkBusinessWorkspaceEntitlement(r.Context(), userID); err != nil {
				return nil, err
			}
			resp, err := h.client.CreateOrgWorkspace(r.Context(), &workspacepb.CreateOrgWorkspaceRequest{
				OwnerId:       userID,
				Name:          body.Name,
				Description:   body.Description,
				CategorySlugs: body.CategorySlugs,
			})
			if err != nil {
				return nil, err
			}
			// The owner is the workspace's first seat → reconcile per-seat billing.
			h.syncOrgSeats(r.Context(), resp.Workspace)
			return resp.Workspace, nil
		},
	}.ServeHTTP(w, r)
}

// GetWorkspace returns a workspace by its ID, extracted from the "workspaceId"
// chi URL parameter.
func (h *WorkspaceHandler) GetWorkspace(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, workspacepb.Workspace]{
		Method: http.MethodGet,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, _ string, _ *struct{}) (*workspacepb.Workspace, error) {
			workspaceID := chi.URLParam(r, "workspaceId")
			resp, err := h.client.GetWorkspace(r.Context(), &workspacepb.GetWorkspaceRequest{WorkspaceId: workspaceID})
			if err != nil {
				return nil, err
			}
			return resp.Workspace, nil
		},
	}.ServeHTTP(w, r)
}

// UpdateWorkspace applies partial updates to a workspace's name, description, or
// avatar URL. The workspace ID is extracted from the "workspaceId" chi URL parameter.
func (h *WorkspaceHandler) UpdateWorkspace(w http.ResponseWriter, r *http.Request) {
	type updateWorkspaceBody struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		AvatarURL   string `json:"avatar_url"`
	}
	// Router mounts this on both PUT and PATCH, so the endpoint accepts any verb.
	handlers.Endpoint[updateWorkspaceBody, workspacepb.Workspace]{
		Decode: jsonBodyOrInvalid[updateWorkspaceBody],
		Handle: func(r *http.Request, _ string, body *updateWorkspaceBody) (*workspacepb.Workspace, error) {
			workspaceID := chi.URLParam(r, "workspaceId")
			resp, err := h.client.UpdateWorkspace(r.Context(), &workspacepb.UpdateWorkspaceRequest{
				WorkspaceId: workspaceID,
				Name:        body.Name,
				Description: body.Description,
				AvatarUrl:   body.AvatarURL,
			})
			if err != nil {
				return nil, err
			}
			return resp.Workspace, nil
		},
	}.ServeHTTP(w, r)
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
	handlers.Endpoint[struct{}, []*workspacepb.WorkspaceMember]{
		Method: http.MethodGet,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, _ string, _ *struct{}) (*[]*workspacepb.WorkspaceMember, error) {
			workspaceID := chi.URLParam(r, "workspaceId")
			resp, err := h.client.ListMembers(r.Context(), &workspacepb.ListMembersRequest{WorkspaceId: workspaceID})
			if err != nil {
				return nil, err
			}
			return &resp.Members, nil
		},
	}.ServeHTTP(w, r)
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
	type inviteMemberBody struct {
		Target string `json:"target"`
		Email  string `json:"email"` // legacy alias for Target
		Role   string `json:"role"`
	}
	handlers.Endpoint[inviteMemberBody, map[string]string]{
		Method:        http.MethodPost,
		Auth:          true,
		Decode:        jsonBodyOrInvalid[inviteMemberBody],
		SuccessStatus: http.StatusCreated,
		Handle: func(r *http.Request, invitedBy string, body *inviteMemberBody) (*map[string]string, error) {
			workspaceID := chi.URLParam(r, "workspaceId")

			target := body.Target
			if target == "" {
				target = body.Email
			}
			if target == "" || body.Role == "" {
				return nil, apierror.New(handlers.CodeForHTTPStatus(http.StatusBadRequest), http.StatusBadRequest, "target (email or @username or username#tag) and role are required")
			}

			// Resolve @username / username#tag to an email. Plain emails pass
			// through unchanged. A resolution failure means the user doesn't
			// exist — surface that as 400 so the UI can hint the inviter
			// checked the handle.
			resolvedEmail, err := ResolveEmailOrTag(r.Context(), h.identityClient, target)
			if err != nil {
				return nil, apierror.New(handlers.CodeForHTTPStatus(http.StatusBadRequest), http.StatusBadRequest, err.Error())
			}

			resp, err := h.client.InviteMember(r.Context(), &workspacepb.InviteMemberRequest{
				WorkspaceId: workspaceID,
				Email:       resolvedEmail,
				Role:        body.Role,
				InvitedBy:   invitedBy,
			})
			if err != nil {
				return nil, err
			}
			return &map[string]string{"invite_token": resp.InviteToken}, nil
		},
	}.ServeHTTP(w, r)
}

// AcceptInvite redeems an invitation token for the authenticated user, adding them
// to the workspace. The token is extracted from the "token" chi URL parameter.
func (h *WorkspaceHandler) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, workspacepb.Workspace]{
		Method: http.MethodPost,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*workspacepb.Workspace, error) {
			token := chi.URLParam(r, "token")
			resp, err := h.client.AcceptInvite(r.Context(), &workspacepb.AcceptInviteRequest{
				Token:  token,
				UserId: userID,
			})
			if err != nil {
				return nil, err
			}
			// A new member joined → reconcile the owner's per-seat billing.
			h.syncOrgSeats(r.Context(), resp.Workspace)
			return resp.Workspace, nil
		},
	}.ServeHTTP(w, r)
}

// DeclineInvite invalidates an invitation token without adding the user to the workspace.
func (h *WorkspaceHandler) DeclineInvite(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, map[string]bool]{
		Method: http.MethodPost,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, _ string, _ *struct{}) (*map[string]bool, error) {
			token := chi.URLParam(r, "token")
			if _, err := h.client.DeclineInvite(r.Context(), &workspacepb.DeclineInviteRequest{Token: token}); err != nil {
				return nil, err
			}
			return &map[string]bool{"success": true}, nil
		},
	}.ServeHTTP(w, r)
}

// UpdateMemberRole changes the role of a workspace member identified by the
// "userId" chi URL parameter.
func (h *WorkspaceHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	type updateMemberRoleBody struct {
		Role string `json:"role"`
	}
	// Router mounts this on both PUT and PATCH, so the endpoint accepts any verb.
	handlers.Endpoint[updateMemberRoleBody, workspacepb.WorkspaceMember]{
		Decode: jsonBodyOrInvalid[updateMemberRoleBody],
		Handle: func(r *http.Request, _ string, body *updateMemberRoleBody) (*workspacepb.WorkspaceMember, error) {
			workspaceID := chi.URLParam(r, "workspaceId")
			targetUserID := chi.URLParam(r, "userId")
			resp, err := h.client.UpdateMemberRole(r.Context(), &workspacepb.UpdateMemberRoleRequest{
				WorkspaceId: workspaceID,
				UserId:      targetUserID,
				Role:        body.Role,
			})
			if err != nil {
				return nil, err
			}
			return resp.Member, nil
		},
	}.ServeHTTP(w, r)
}

// RemoveMember removes a member from a workspace. The target user ID is extracted
// from the "userId" chi URL parameter.
func (h *WorkspaceHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, struct{}]{
		Method:        http.MethodDelete,
		Decode:        handlers.NoBody[struct{}],
		SuccessStatus: http.StatusNoContent,
		Handle: func(r *http.Request, _ string, _ *struct{}) (*struct{}, error) {
			workspaceID := chi.URLParam(r, "workspaceId")
			targetUserID := chi.URLParam(r, "userId")
			if _, err := h.client.RemoveMember(r.Context(), &workspacepb.RemoveMemberRequest{
				WorkspaceId: workspaceID,
				UserId:      targetUserID,
			}); err != nil {
				return nil, err
			}
			// A member left → reconcile the owner's per-seat billing.
			if wsResp, err := h.client.GetWorkspace(r.Context(), &workspacepb.GetWorkspaceRequest{WorkspaceId: workspaceID}); err == nil {
				h.syncOrgSeats(r.Context(), wsResp.Workspace)
			}
			return nil, nil
		},
	}.ServeHTTP(w, r)
}
