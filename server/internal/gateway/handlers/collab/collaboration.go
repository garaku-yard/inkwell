package collab

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"inkwell/server/internal/gateway/apierror"
	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/internal/gateway/handlers"
	billingpb "inkwell/server/pkg/grpc/billing"
	"inkwell/server/pkg/grpc/collab"
	"inkwell/server/pkg/grpc/identity"
	"inkwell/server/pkg/grpc/scripts"
	workspacepb "inkwell/server/pkg/grpc/workspace"
)

// InviteNotifier pushes a real-time "new invitation" hint to the invited user
// so it appears without a refresh. Satisfied by *notify.Hub; held here as an
// interface so the handler stays decoupled and nil-safe — a notification is a
// best-effort overlay and must never block (or fail) the actual invitation.
type InviteNotifier interface {
	NotifyInvite(userID string)
}

// CollaborationHandler routes collaboration HTTP requests to the collab gRPC
// service. It also reaches the identity service to resolve display names for
// collaborators and comment authors, and the scripts service to look up project
// titles when enriching invitation data.
type CollaborationHandler struct {
	client          collab.CollaborationServiceClient
	identityClient  identity.IdentityServiceClient
	scriptsClient   scripts.ScriptsServiceClient
	billingClient   billingpb.BillingServiceClient
	workspaceClient workspacepb.WorkspaceServiceClient
	notifier        InviteNotifier
}

// NewCollaborationHandler creates a CollaborationHandler using the gRPC clients
// in the provided registry. notifier may be nil (no real-time push).
func NewCollaborationHandler(clients *grpcclient.Registry, notifier InviteNotifier) *CollaborationHandler {
	return &CollaborationHandler{
		client:          clients.Collab,
		identityClient:  clients.Identity,
		scriptsClient:   clients.Scripts,
		billingClient:   clients.Billing,
		workspaceClient: clients.Workspace,
		notifier:        notifier,
	}
}

// authorizeCollabResource resolves the project that owns a collab-service
// sub-resource (a collaborator row or a comment — neither request carries a
// project_id of its own) via collab's GetResourceProject, and authorizes the
// caller against it for action, returning the effective downstream user id.
// The project is read from the resource itself, never supplied by the
// client. A non-nil error means the resource is missing or the caller may not
// perform action; in both cases the mutation must not proceed.
func (h *CollaborationHandler) authorizeCollabResource(ctx context.Context, userID string, resourceType collab.ResourceType, resourceID string, action handlers.ProjectAction) (string, error) {
	resp, err := h.client.GetResourceProject(ctx, &collab.GetResourceProjectRequest{
		ResourceType: resourceType,
		ResourceId:   resourceID,
	})
	if err != nil {
		return "", err
	}
	return handlers.RequireProjectAccess(ctx, userID, resp.ProjectId, action, h.scriptsClient, h.client, h.workspaceClient)
}

// addCollaboratorBody is the JSON request shape for AddCollaborator.
type addCollaboratorBody struct {
	ProjectID string `json:"project_id"`
	Email     string `json:"email"`
	Role      string `json:"role"`
}

// AddCollaborator sends a project invitation to a user identified by email address
// or user tag. The role must be "editor" or "viewer"; the "owner" role cannot be
// assigned through this endpoint. The input is resolved to a canonical email before
// being forwarded to the collab service.
func (h *CollaborationHandler) AddCollaborator(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[addCollaboratorBody, map[string]interface{}]{
		Method:        http.MethodPost,
		Auth:          true,
		Decode:        handlers.JSONBody[addCollaboratorBody],
		SuccessStatus: http.StatusCreated,
		Handle: func(r *http.Request, userID string, req *addCollaboratorBody) (*map[string]interface{}, error) {
			if req.ProjectID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "project_id is required")
			}

			// Validate role — owner cannot be assigned via invitation
			validRoles := map[string]bool{
				"editor": true,
				"viewer": true,
			}
			if !validRoles[req.Role] {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "Invalid role. Must be 'editor' or 'viewer'")
			}

			// Only the owner or an org admin may invite collaborators — not an
			// editor, and not a total stranger to the project (previously this
			// endpoint ran no project-access check at all: any authenticated
			// caller who knew a project_id could add themselves as its editor).
			if _, authErr := handlers.RequireProjectAccess(r.Context(), userID, req.ProjectID, handlers.ActionManageCollaborators, h.scriptsClient, h.client, h.workspaceClient); authErr != nil {
				return nil, authErr
			}

			// Resolve email or user tag to actual email address
			actualEmail, err := h.resolveEmailOrUserTag(r.Context(), req.Email)
			if err != nil {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "Failed to resolve user: "+err.Error())
			}

			// Enforce the per-project collaborator cap from the project owner's
			// billing tier. Best-effort / fail-open: only blocks when the project
			// is positively over its limit (see checkCollaboratorQuota).
			if err := h.checkCollaboratorQuota(r.Context(), req.ProjectID); err != nil {
				return nil, err
			}

			// Call collaboration service
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			resp, err := h.client.AddCollaborator(ctx, &collab.AddCollaboratorRequest{
				ProjectId: req.ProjectID,
				InviterId: userID,
				Email:     actualEmail, // Use resolved email
				Role:      req.Role,
			})
			if err != nil {
				return nil, err
			}

			// Convert response to JSON
			response := map[string]interface{}{
				"id":         resp.Collaborator.Id,
				"project_id": resp.Collaborator.ProjectId,
				"user_id":    resp.Collaborator.UserId,
				"email":      req.Email,
				"role":       resp.Collaborator.Role,
				"status":     resp.Collaborator.Status,
				"invited_at": handlers.TimestampToString(resp.Collaborator.InvitedAt),
				"message":    "Invitation sent successfully",
			}
			if joinedAt := handlers.TimestampToString(resp.Collaborator.JoinedAt); joinedAt != "" {
				response["joined_at"] = joinedAt
			}

			// Best-effort live nudge so an invited, registered user sees it
			// without a refresh. The pending collaborator row carries a nil user
			// id (it's keyed by email until accepted), so resolve the invitee's
			// account from the invite target (email or username#tag) instead. An
			// unknown user resolves to "" and is skipped — they get the email.
			if h.notifier != nil {
				h.notifier.NotifyInvite(h.resolveInviteeUserID(r.Context(), req.Email))
			}
			return &response, nil
		},
	}.ServeHTTP(w, r)
}

// checkCollaboratorQuota enforces the per-project collaborator limit defined by
// the project owner's effective billing tier. It is best-effort and fails OPEN:
// any lookup error, a missing project/plan, or an unlimited tier (limit <= 0)
// returns nil so collaboration is never blocked by a billing hiccup. It returns
// a 429 apierror only when the project is positively at or above its cap.
//
// The limit is read from the project OWNER's plan (not the inviter's), since the
// owner is who pays for the project. Pending invitations count toward the cap —
// they occupy a seat the moment they are issued.
func (h *CollaborationHandler) checkCollaboratorQuota(ctx context.Context, projectID string) error {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	// Resolve the project to find its real owner, via the same trusted
	// nil-user bypass ResolveProjectRole's org-metadata read uses — a
	// read-only lookup, not a grant. The caller here has already passed
	// ActionManageCollaborators (owner or org admin); using their own id for
	// this second, unrelated lookup would fail it for every org admin (only
	// the literal owner passes scripts' ownership check) and silently skip
	// the quota check entirely via the fail-open path below — exactly the
	// bypass this comment used to invite. Never trust a client-supplied
	// owner id either way; read it from the project record.
	projResp, err := h.scriptsClient.GetProject(ctx, &scripts.GetProjectRequest{
		ProjectId: projectID,
		UserId:    "",
	})
	if err != nil || projResp.GetProject() == nil {
		return nil // fail open
	}
	ownerID := projResp.GetProject().GetOwnerId()
	if ownerID == "" {
		return nil // fail open
	}

	// Look up the owner's effective tier (active/trialing subscription, else the
	// default Free tier). limit <= 0 means unlimited — tierToPlan only sets the
	// field when a positive cap exists.
	tierResp, err := h.billingClient.GetEffectiveTier(ctx, &billingpb.GetEffectiveTierRequest{
		UserId: ownerID,
	})
	if err != nil || tierResp.GetPlan() == nil {
		return nil // fail open
	}
	limit := int64(tierResp.GetPlan().GetMaxCollaboratorsPerProject())
	if limit <= 0 {
		return nil // unlimited
	}

	// Count the seats the project already consumes. A pending email invitation
	// occupies a seat the moment it is issued — collaborators added by email live
	// in the invitations table until accepted, so counting only active members
	// would let an owner invite past the cap. The collab service owns both tables
	// and returns the combined usage.
	usage, err := h.client.GetProjectSeatUsage(ctx, &collab.GetProjectSeatUsageRequest{
		ProjectId: projectID,
	})
	if err != nil {
		return nil // fail open
	}
	used := int64(usage.GetActiveCollaborators()) + int64(usage.GetPendingInvitations())

	// Block only when adding one more would exceed the cap.
	if used >= limit {
		return apierror.New(
			apierror.CodeResourceExhausted,
			http.StatusTooManyRequests,
			fmt.Sprintf("Collaborator limit reached (%d per project on the owner's plan). Upgrade to add more.", limit),
		)
	}
	return nil
}

// GetProjectCollaborators returns all collaborators for a project, both active and
// pending. Active records are enriched with user profile data from the identity
// service; pending records show the inviter's name instead of the invited user,
// whose account may not yet exist.
func (h *CollaborationHandler) GetProjectCollaborators(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, []map[string]interface{}]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*[]map[string]interface{}, error) {
			projectID := r.URL.Query().Get("project_id")
			if projectID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "project_id is required")
			}

			// Call collaboration service
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			if _, authErr := handlers.RequireProjectAccess(ctx, userID, projectID, handlers.ActionRead, h.scriptsClient, h.client, h.workspaceClient); authErr != nil {
				return nil, authErr
			}

			resp, err := h.client.GetProjectCollaborators(ctx, &collab.GetProjectCollaboratorsRequest{
				ProjectId: projectID,
				UserId:    userID,
			})
			if err != nil {
				return nil, apierror.New(apierror.CodeInternal, http.StatusInternalServerError, "Failed to get collaborators")
			}

			// Convert response to JSON and lookup user details
			// Initialize as empty slice to ensure JSON encodes as [] not null
			collaborators := make([]map[string]interface{}, 0)
			for _, collab := range resp.Collaborators {
				collaboratorData := map[string]interface{}{
					"id":         collab.Id,
					"project_id": collab.ProjectId,
					"user_id":    collab.UserId,
					"role":       collab.Role,
					"status":     collab.Status,
					"invited_at": handlers.TimestampToString(collab.InvitedAt),
					"joined_at":  handlers.TimestampToString(collab.JoinedAt),
				}

				// For pending invitations (status = "pending"), lookup inviter details
				// For active collaborators, lookup user details from identity service
				if collab.Status == "pending" {
					// This is a pending invitation - lookup the inviter's details
					// The invited_by field contains the inviter's user ID
					if collab.InvitedBy != "" && collab.InvitedBy != "00000000-0000-0000-0000-000000000000" {
						// Call identity service to get inviter details
						identityCtx, identityCancel := context.WithTimeout(r.Context(), 2*time.Second)
						defer identityCancel()

						inviterResp, err := h.identityClient.GetUser(identityCtx, &identity.GetUserRequest{
							UserId: collab.InvitedBy,
						})
						if err != nil {
							collaboratorData["name"] = fmt.Sprintf("Invited by User %s", collab.InvitedBy[:8])
							collaboratorData["email"] = "pending@invitation.com"
						} else if inviterResp.User != nil {
							// Show who invited them
							collaboratorData["name"] = fmt.Sprintf("Invited by %s %s", inviterResp.User.FirstName, inviterResp.User.LastName)
							collaboratorData["email"] = "pending@invitation.com" // Placeholder for pending
							collaboratorData["invited_by_name"] = inviterResp.User.FirstName + " " + inviterResp.User.LastName
						}
					} else {
						collaboratorData["name"] = "Pending invitation"
						collaboratorData["email"] = "pending@invitation.com"
					}
				} else {
					// This is an active collaborator - lookup user details
					if collab.UserId != "" && collab.UserId != "00000000-0000-0000-0000-000000000000" {
						// Call identity service to get user details
						identityCtx, identityCancel := context.WithTimeout(r.Context(), 2*time.Second)
						defer identityCancel()

						userResp, err := h.identityClient.GetUser(identityCtx, &identity.GetUserRequest{
							UserId: collab.UserId,
						})
						if err != nil {
							collaboratorData["name"] = fmt.Sprintf("User %s", collab.UserId[:8])
							collaboratorData["email"] = fmt.Sprintf("user-%s@example.com", collab.UserId[:8])
						} else if userResp.User != nil {
							fullName := strings.TrimSpace(userResp.User.FirstName + " " + userResp.User.LastName)
							if fullName == "" {
								fullName = userResp.User.Username
							}
							collaboratorData["name"] = fullName
							collaboratorData["email"] = userResp.User.Email
							collaboratorData["username_with_tag"] = userResp.User.Username
						}
					} else {
						// Empty user ID - fallback
						collaboratorData["name"] = "Unknown User"
						collaboratorData["email"] = "unknown@example.com"
					}
				}

				collaborators = append(collaborators, collaboratorData)
			}

			return &collaborators, nil
		},
	}.ServeHTTP(w, r)
}

// addCommentBody is the JSON request shape for AddComment.
type addCommentBody struct {
	ProjectID       string  `json:"project_id"`
	ScreenplayID    string  `json:"screenplay_id"`
	Content         string  `json:"content"`
	ScriptElementID *string `json:"script_element_id,omitempty"`
	SceneID         *string `json:"scene_id,omitempty"`
	LineNumber      int32   `json:"line_number,omitempty"`
	CharPosition    int32   `json:"char_position,omitempty"`
	ParentID        *string `json:"parent_id,omitempty"`
}

// AddComment attaches a comment to a project or a specific scene/element within it.
// Supports threaded replies via the optional parent_id field. Requires a userID from
// the request context. The response includes the commenter's username, resolved from
// the identity service.
func (h *CollaborationHandler) AddComment(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[addCommentBody, map[string]interface{}]{
		Method:        http.MethodPost,
		Auth:          true,
		Decode:        handlers.JSONBody[addCommentBody],
		SuccessStatus: http.StatusCreated,
		Handle: func(r *http.Request, userID string, req *addCommentBody) (*map[string]interface{}, error) {
			if req.ProjectID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "project_id is required")
			}

			// Call collaboration service
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			// Previously this endpoint ran no project-access check at all: any
			// authenticated caller who knew a project_id could comment on it.
			// ActionCommentAdd is granted to every real role, viewer included.
			if _, authErr := handlers.RequireProjectAccess(ctx, userID, req.ProjectID, handlers.ActionCommentAdd, h.scriptsClient, h.client, h.workspaceClient); authErr != nil {
				return nil, authErr
			}

			resp, err := h.client.AddComment(ctx, &collab.AddCommentRequest{
				ProjectId:       req.ProjectID,
				ScreenplayId:    req.ScreenplayID,
				UserId:          userID,
				Content:         req.Content,
				ScriptElementId: req.ScriptElementID,
				SceneId:         req.SceneID,
				LineNumber:      req.LineNumber,
				CharPosition:    req.CharPosition,
				ParentId:        req.ParentID,
			})
			if err != nil {
				return nil, apierror.New(apierror.CodeInternal, http.StatusInternalServerError, "Failed to add comment")
			}

			// Get username from identity service
			userResp, err := h.identityClient.GetUser(ctx, &identity.GetUserRequest{
				UserId: userID,
			})
			if err != nil {
				log.Printf("could not get username for user %s: %v", userID, err)
			}

			username := fmt.Sprintf("User %s", userID[:8]) // Default fallback
			if userResp != nil && userResp.User != nil && userResp.User.Username != "" {
				username = userResp.User.Username
			}

			// Convert response to JSON
			response := map[string]interface{}{
				"id":                resp.Comment.Id,
				"project_id":        resp.Comment.ProjectId,
				"screenplay_id":     resp.Comment.ScreenplayId,
				"script_element_id": resp.Comment.ScriptElementId,
				"user_id":           resp.Comment.UserId,
				"username":          username,
				"content":           resp.Comment.Content,
				"line_number":       resp.Comment.LineNumber,
				"char_position":     resp.Comment.CharPosition,
				"parent_id":         resp.Comment.ParentId,
				"is_resolved":       resp.Comment.IsResolved,
				"created_at":        handlers.TimestampToString(resp.Comment.CreatedAt),
				"updated_at":        handlers.TimestampToString(resp.Comment.UpdatedAt),
			}
			return &response, nil
		},
	}.ServeHTTP(w, r)
}

// GetComments returns all comments for a project, identified by screenplay_id.
// Verifies the caller has access via handlers.ResolveProjectAccess before fetching. Each
// comment is enriched with the author's username from the identity service.
func (h *CollaborationHandler) GetComments(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, []map[string]interface{}]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*[]map[string]interface{}, error) {
			screenplayID := r.URL.Query().Get("screenplay_id")
			if screenplayID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "screenplay_id is required")
			}

			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			if _, err := handlers.RequireProjectAccess(ctx, userID, screenplayID, handlers.ActionRead, h.scriptsClient, h.client, h.workspaceClient); err != nil {
				return nil, err
			}

			// Call collaboration service
			resp, err := h.client.GetComments(ctx, &collab.GetCommentsRequest{
				ScreenplayId: screenplayID,
				UserId:       userID,
			})
			if err != nil {
				return nil, apierror.New(apierror.CodeInternal, http.StatusInternalServerError, "Failed to get comments")
			}

			// Convert response to JSON and fetch usernames
			// Initialize as empty slice to ensure JSON encoding returns [] instead of null
			comments := make([]map[string]interface{}, 0)
			for _, comment := range resp.Comments {
				// Get username from identity service
				username := comment.UserId // fallback to user ID
				userResp, err := h.identityClient.GetUser(ctx, &identity.GetUserRequest{
					UserId: comment.UserId,
				})
				if err == nil && userResp.User != nil {
					username = userResp.User.Username
				}

				comments = append(comments, map[string]interface{}{
					"id":                comment.Id,
					"project_id":        comment.ProjectId,
					"screenplay_id":     comment.ScreenplayId,
					"script_element_id": comment.ScriptElementId,
					"scene_id":          comment.SceneId,
					"user_id":           comment.UserId,
					"username":          username,
					"content":           comment.Content,
					"line_number":       comment.LineNumber,
					"char_position":     comment.CharPosition,
					"parent_id":         comment.ParentId,
					"is_resolved":       comment.IsResolved,
					"created_at":        handlers.TimestampToString(comment.CreatedAt),
					"updated_at":        handlers.TimestampToString(comment.UpdatedAt),
				})
			}

			return &comments, nil
		},
	}.ServeHTTP(w, r)
}

// updatePresenceBody is the JSON request shape for UpdatePresence.
type updatePresenceBody struct {
	ProjectID      string `json:"project_id"`
	ScreenplayID   string `json:"screenplay_id"`
	CursorPosition int32  `json:"cursor_position"`
}

// UpdatePresence records the authenticated user's current cursor position within
// a project. Used by real-time collaboration features to show active editors.
func (h *CollaborationHandler) UpdatePresence(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[updatePresenceBody, map[string]interface{}]{
		Method: http.MethodPost,
		Auth:   true,
		Decode: handlers.JSONBody[updatePresenceBody],
		Handle: func(r *http.Request, userID string, req *updatePresenceBody) (*map[string]interface{}, error) {
			if req.ProjectID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "project_id is required")
			}

			// Call collaboration service
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			// Reporting a cursor position is harmless to grant every real role,
			// same as ActionRead — this endpoint previously ran no check at all.
			if _, authErr := handlers.RequireProjectAccess(ctx, userID, req.ProjectID, handlers.ActionRead, h.scriptsClient, h.client, h.workspaceClient); authErr != nil {
				return nil, authErr
			}

			resp, err := h.client.UpdatePresence(ctx, &collab.UpdatePresenceRequest{
				UserId:         userID,
				ProjectId:      req.ProjectID,
				ScreenplayId:   req.ScreenplayID,
				CursorPosition: req.CursorPosition,
			})
			if err != nil {
				return nil, apierror.New(apierror.CodeInternal, http.StatusInternalServerError, "Failed to update presence")
			}

			// Convert response to JSON
			response := map[string]interface{}{
				"user_id":         resp.Presence.UserId,
				"project_id":      resp.Presence.ProjectId,
				"screenplay_id":   resp.Presence.ScreenplayId,
				"cursor_position": resp.Presence.CursorPosition,
				"last_seen":       handlers.TimestampToString(resp.Presence.LastSeen),
				"is_online":       resp.Presence.IsOnline,
			}
			return &response, nil
		},
	}.ServeHTTP(w, r)
}

// resolveEmailOrUserTag normalises an invitation target to an email address.
// Accepts a plain email, an @username handle, or a username#tag discriminator.
func (h *CollaborationHandler) resolveEmailOrUserTag(ctx context.Context, input string) (string, error) {
	// If it's already an email (contains @), return as-is
	if strings.Contains(input, "@") && !strings.HasPrefix(input, "@") {
		return input, nil
	}

	// If it starts with @, it's a user tag - look up the user by username
	if strings.HasPrefix(input, "@") {
		return h.getUserEmailByUsername(ctx, strings.TrimPrefix(input, "@"))
	}

	// If it contains # it's likely a username#tag format
	if strings.Contains(input, "#") {
		parts := strings.SplitN(input, "#", 2)
		return h.getUserEmailByUsernameAndTag(ctx, parts[0], parts[1])
	}

	// Assume plain username
	return h.getUserEmailByUsername(ctx, input)
}

// resolveInviteeUserID best-effort resolves the invited user's account id from
// the invite target (the same parsing as resolveEmailOrUserTag), for the live
// notification push. Returns "" for a raw email (there is no email→id lookup)
// or an unknown user — the invitation still succeeds; that invitee just won't
// get the live nudge, only the email + the badge's focus/poll refresh.
func (h *CollaborationHandler) resolveInviteeUserID(ctx context.Context, input string) string {
	input = strings.TrimSpace(input)
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	// Raw email → look the account up directly.
	if strings.Contains(input, "@") && !strings.HasPrefix(input, "@") {
		resp, err := h.identityClient.GetUserByEmail(ctx, &identity.GetUserByEmailRequest{Email: input})
		if err != nil || resp.GetUser() == nil {
			return "" // no account for this email — they'll get the email invite
		}
		return resp.GetUser().GetId()
	}

	// @handle / username#tag / plain username → resolve by username + tag.
	var username, tag string
	switch {
	case strings.HasPrefix(input, "@"):
		username = strings.TrimPrefix(input, "@")
		tag = username
	case strings.Contains(input, "#"):
		parts := strings.SplitN(input, "#", 2)
		username, tag = parts[0], parts[1]
	default:
		username, tag = input, input
	}
	resp, err := h.identityClient.GetUserByUsernameTag(ctx, &identity.GetUserByUsernameTagRequest{
		Username: username,
		UserTag:  tag,
	})
	if err != nil || resp.GetUser() == nil {
		return ""
	}
	return resp.GetUser().GetId()
}

// getUserEmailByUsername looks up a user's email by username via the identity service.
// Used when the invitation target is specified as a plain username without a tag.
func (h *CollaborationHandler) getUserEmailByUsername(ctx context.Context, username string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	resp, err := h.identityClient.GetUserByUsernameTag(ctx, &identity.GetUserByUsernameTagRequest{
		Username: username,
		UserTag:  username,
	})
	if err != nil {
		return "", fmt.Errorf("user '%s' not found: %v", username, err)
	}
	if resp.User == nil {
		return "", fmt.Errorf("user '%s' not found", username)
	}
	return resp.User.Email, nil
}

// getUserEmailByUsernameAndTag looks up a user's email by username and discriminator tag
// via the identity service. Used when the invitation target is in username#tag format.
func (h *CollaborationHandler) getUserEmailByUsernameAndTag(ctx context.Context, username, userTag string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	resp, err := h.identityClient.GetUserByUsernameTag(ctx, &identity.GetUserByUsernameTagRequest{
		Username: username,
		UserTag:  userTag,
	})
	if err != nil {
		return "", fmt.Errorf("user '%s#%s' not found: %v", username, userTag, err)
	}
	if resp.User == nil {
		return "", fmt.Errorf("user '%s#%s' not found", username, userTag)
	}
	return resp.User.Email, nil
}

// GetUserInvitations returns all pending project invitations for the authenticated
// user. Because invitations are stored by email, the handler first resolves the
// userID to an email via the identity service. Each invitation is enriched with the
// inviter's display name and the project title from their respective services.
func (h *CollaborationHandler) GetUserInvitations(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, []map[string]interface{}]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*[]map[string]interface{}, error) {
			// First, get the user's email from identity service since invitations are stored by email
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			userResp, err := h.identityClient.GetUser(ctx, &identity.GetUserRequest{
				UserId: userID,
			})
			if err != nil {
				return nil, err
			}

			if userResp.User == nil {
				return nil, apierror.New(apierror.CodeNotFound, http.StatusNotFound, "User not found")
			}

			userEmail := userResp.User.Email

			// Call collaboration service to get actual pending invitations by email
			resp, err := h.client.GetUserInvitations(ctx, &collab.GetUserInvitationsRequest{
				Email: userEmail,
			})
			if err != nil {
				return nil, err
			}

			// Convert response to the expected format
			// Initialize with empty slice to ensure JSON encodes as [] not null
			invitations := make([]map[string]interface{}, 0)
			for _, invitation := range resp.Invitations {
				// Get inviter name using invited_by field
				inviterName := "Unknown User"
				if invitation.InvitedBy != "" && invitation.InvitedBy != "00000000-0000-0000-0000-000000000000" {
					inviterCtx, inviterCancel := context.WithTimeout(r.Context(), 2*time.Second)
					defer inviterCancel()

					inviterResp, err := h.identityClient.GetUser(inviterCtx, &identity.GetUserRequest{
						UserId: invitation.InvitedBy,
					})
					if err != nil || inviterResp.User == nil {
						inviterName = "Former User"
					} else {
						inviterName = inviterResp.User.FirstName + " " + inviterResp.User.LastName
						if inviterName == " " || inviterName == "" {
							inviterName = inviterResp.User.Email
						}
					}
				}

				// Get project name from scripts service
				projectName := "Unknown Project"
				if invitation.ProjectId != "" {
					projectCtx, projectCancel := context.WithTimeout(r.Context(), 2*time.Second)
					defer projectCancel()

					projectResp, err := h.scriptsClient.GetProject(projectCtx, &scripts.GetProjectRequest{
						ProjectId: invitation.ProjectId,
						UserId:    invitation.InvitedBy,
					})
					if err == nil && projectResp.Project != nil {
						projectName = projectResp.Project.Title
					}
				}

				invitations = append(invitations, map[string]interface{}{
					"id":          invitation.Id,
					"projectId":   invitation.ProjectId,
					"projectName": projectName,
					"role":        invitation.Role,
					"invitedBy":   inviterName,
					"invitedById": invitation.InvitedBy,
					"status":      invitation.Status,
					"createdAt":   handlers.TimestampToString(invitation.InvitedAt),
				})
			}

			return &invitations, nil
		},
	}.ServeHTTP(w, r)
}

// acceptDeclineBody is the JSON request shape for AcceptInvitation and
// DeclineInvitation. Either collaborator_id or id is accepted.
type acceptDeclineBody struct {
	CollaboratorID string `json:"collaborator_id"`
	ID             string `json:"id"` // Alternative field name
}

// AcceptInvitation marks a pending invitation as accepted, granting the authenticated
// user active collaborator access to the project. Accepts either collaborator_id or
// id in the request body for client compatibility.
func (h *CollaborationHandler) AcceptInvitation(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[acceptDeclineBody, map[string]interface{}]{
		Method: http.MethodPost,
		Auth:   true,
		Decode: handlers.JSONBody[acceptDeclineBody],
		Handle: func(r *http.Request, userID string, req *acceptDeclineBody) (*map[string]interface{}, error) {
			// Accept either collaborator_id or id field
			collaboratorID := req.CollaboratorID
			if collaboratorID == "" {
				collaboratorID = req.ID
			}

			if collaboratorID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "collaborator_id or id is required")
			}

			// Call the collaboration service to accept the invitation
			resp, err := h.client.AcceptInvitation(r.Context(), &collab.AcceptInvitationRequest{
				UserId:         userID,
				CollaboratorId: collaboratorID,
			})
			if err != nil {
				return nil, err
			}

			response := map[string]interface{}{
				"success": true,
				"message": "Invitation accepted successfully",
			}

			if resp.Collaborator != nil {
				response["collaborator"] = map[string]interface{}{
					"id":         resp.Collaborator.Id,
					"project_id": resp.Collaborator.ProjectId,
					"user_id":    resp.Collaborator.UserId,
					"role":       resp.Collaborator.Role,
					"status":     resp.Collaborator.Status,
					"invited_at": handlers.TimestampToString(resp.Collaborator.InvitedAt),
					"joined_at":  handlers.TimestampToString(resp.Collaborator.JoinedAt),
				}
			}

			return &response, nil
		},
	}.ServeHTTP(w, r)
}

// DeclineInvitation marks a pending invitation as declined without granting project
// access. Accepts either collaborator_id or id in the request body for client compatibility.
func (h *CollaborationHandler) DeclineInvitation(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[acceptDeclineBody, map[string]interface{}]{
		Method: http.MethodPost,
		Auth:   true,
		Decode: handlers.JSONBody[acceptDeclineBody],
		Handle: func(r *http.Request, userID string, req *acceptDeclineBody) (*map[string]interface{}, error) {
			// Accept either collaborator_id or id field
			collaboratorID := req.CollaboratorID
			if collaboratorID == "" {
				collaboratorID = req.ID
			}

			if collaboratorID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "collaborator_id or id is required")
			}

			// Call the collaboration service to decline the invitation
			_, err := h.client.DeclineInvitation(r.Context(), &collab.DeclineInvitationRequest{
				UserId:         userID,
				CollaboratorId: collaboratorID,
			})
			if err != nil {
				return nil, err
			}

			response := map[string]interface{}{
				"success": true,
				"message": "Invitation declined successfully",
			}

			return &response, nil
		},
	}.ServeHTTP(w, r)
}

// updateRoleBody is the JSON request shape for UpdateCollaboratorRole.
type updateRoleBody struct {
	Role string `json:"role"`
}

// UpdateCollaboratorRole changes the role of an existing collaborator. The caller
// must supply a valid role: OWNER, WRITER, EDITOR, or REVIEWER. The collaborator
// ID is extracted from the URL path. Gated on ActionManageCollaborators (owner or
// org admin) — resolved from the collaborator row's own project via
// authorizeCollabResource, previously not checked at all.
func (h *CollaborationHandler) UpdateCollaboratorRole(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[updateRoleBody, map[string]interface{}]{
		// Registered under two PATCH routes (/collaborators/{collaboratorId}
		// and /collaborators/{userId}/role); leave Method empty per the
		// multi-route migration rule.
		Auth:   true,
		Decode: handlers.JSONBody[updateRoleBody],
		Handle: func(r *http.Request, userID string, req *updateRoleBody) (*map[string]interface{}, error) {
			// Extract collaborator ID from URL path
			path := strings.TrimPrefix(r.URL.Path, "/collaborators/")
			collaboratorID := strings.TrimSuffix(path, "/")
			if collaboratorID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "Collaborator ID is required")
			}

			// Validate role
			validRoles := map[string]bool{
				"OWNER":    true,
				"WRITER":   true,
				"EDITOR":   true,
				"REVIEWER": true,
			}
			if !validRoles[req.Role] {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "Invalid role. Must be 'OWNER', 'WRITER', 'EDITOR', or 'REVIEWER'")
			}

			// Call collaboration service
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			// Only the owner or an org admin may reassign a collaborator's role
			// (ActionManageCollaborators) — this endpoint previously ran no
			// project-access check at all.
			resolvedID, authErr := h.authorizeCollabResource(ctx, userID, collab.ResourceType_RESOURCE_TYPE_COLLABORATOR, collaboratorID, handlers.ActionManageCollaborators)
			if authErr != nil {
				return nil, authErr
			}

			resp, err := h.client.UpdateCollaboratorRole(ctx, &collab.UpdateCollaboratorRoleRequest{
				UserId:         resolvedID,
				CollaboratorId: collaboratorID,
				NewRole:        req.Role,
			})
			if err != nil {
				return nil, err
			}

			// Return updated collaborator info
			response := map[string]interface{}{
				"id":         resp.Collaborator.Id,
				"project_id": resp.Collaborator.ProjectId,
				"user_id":    resp.Collaborator.UserId,
				"role":       resp.Collaborator.Role,
				"status":     resp.Collaborator.Status,
				"invited_at": handlers.TimestampToString(resp.Collaborator.InvitedAt),
				"joined_at":  handlers.TimestampToString(resp.Collaborator.JoinedAt),
			}
			return &response, nil
		},
	}.ServeHTTP(w, r)
}

// RemoveCollaborator removes a collaborator from a project. The collaborator ID is
// extracted from the URL path. Gated on ActionManageCollaborators (owner or org
// admin) — resolved from the collaborator row's own project via
// authorizeCollabResource, previously not checked at all.
func (h *CollaborationHandler) RemoveCollaborator(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, map[string]string]{
		Method: http.MethodDelete,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*map[string]string, error) {
			// Extract collaborator ID from URL path
			path := strings.TrimPrefix(r.URL.Path, "/collaborators/")
			collaboratorID := strings.TrimSuffix(path, "/")
			if collaboratorID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "Collaborator ID is required")
			}

			// Call collaboration service
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			// Only the owner or an org admin may remove a collaborator
			// (ActionManageCollaborators) — this endpoint previously ran no
			// project-access check at all.
			resolvedID, authErr := h.authorizeCollabResource(ctx, userID, collab.ResourceType_RESOURCE_TYPE_COLLABORATOR, collaboratorID, handlers.ActionManageCollaborators)
			if authErr != nil {
				return nil, authErr
			}

			_, err := h.client.RemoveCollaborator(ctx, &collab.RemoveCollaboratorRequest{
				UserId:         resolvedID,
				CollaboratorId: collaboratorID,
			})
			if err != nil {
				return nil, err
			}

			// Return success response
			response := map[string]string{
				"message": "Collaborator removed successfully",
			}
			return &response, nil
		},
	}.ServeHTTP(w, r)
}

// updateCommentBody is the JSON request shape for UpdateComment.
type updateCommentBody struct {
	Content    *string `json:"content,omitempty"`
	IsResolved *bool   `json:"is_resolved,omitempty"`
}

// UpdateComment applies partial updates to an existing comment. Only non-nil fields
// are forwarded: content replaces the body text, and is_resolved marks the thread resolved.
func (h *CollaborationHandler) UpdateComment(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[updateCommentBody, map[string]interface{}]{
		// Registered as a PATCH route; leave Method empty per the migration
		// rule for handlers the prompt flagged as multi-verb.
		Auth:   true,
		Decode: handlers.JSONBody[updateCommentBody],
		Handle: func(r *http.Request, userID string, updateData *updateCommentBody) (*map[string]interface{}, error) {
			// Get comment ID from URL path
			path := strings.TrimPrefix(r.URL.Path, "/comments/")
			commentID := strings.Split(path, "/")[0]
			if commentID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "Comment ID is required")
			}

			// Call collaboration service
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			// This endpoint previously ran no project-access check at all, so a
			// total stranger could edit or resolve any comment. Fixed with a
			// precise gate, not merely a coarse one: a self-edit of your own
			// comment's content is ActionCommentAdd (viewer-permitted), but
			// resolving a thread is always moderation regardless of authorship
			// (matching collab-service's own ResolveComment, which requires
			// editor unconditionally), and editing someone else's comment is
			// always moderation too. An org-only viewer (no collab.collaborators
			// row) editing their own comment must still pass — that's why this
			// compares against the resource's real author rather than routing
			// every non-owner through ActionCommentAdd, which is what let an org
			// viewer moderate a stranger's comment via collab's CheckPermission
			// fallback (#366) before this fix.
			resourceResp, lookupErr := h.client.GetResourceProject(ctx, &collab.GetResourceProjectRequest{
				ResourceType: collab.ResourceType_RESOURCE_TYPE_COMMENT,
				ResourceId:   commentID,
			})
			if lookupErr != nil {
				return nil, lookupErr
			}
			resolvingThread := updateData.IsResolved != nil && *updateData.IsResolved
			isSelf := userID == resourceResp.OwnerUserId
			action := handlers.ActionCommentModerate
			if isSelf && !resolvingThread {
				action = handlers.ActionCommentAdd
			}
			if _, authErr := handlers.RequireProjectAccess(ctx, userID, resourceResp.ProjectId, action, h.scriptsClient, h.client, h.workspaceClient); authErr != nil {
				return nil, authErr
			}

			// Downstream identity: the real caller only for the self-edit tier,
			// where collab-service's own UpdateComment skips CheckPermission
			// entirely on the authorship match (comment.UserID == userID) — the
			// one case forwarding the real id is both needed and safe. For the
			// moderate tier (someone else's comment, or resolving a thread at
			// all — ResolveComment never has a self-exception), forward the
			// bypass sentinel instead: the gateway has already verified
			// ActionCommentModerate across every source (org role and direct
			// collaborator row combined, ADR 0030), but collab's own
			// CheckPermission only ever sees the direct collaborator row —
			// forwarding the real id there would make it re-derive a narrower
			// answer than the gateway just gave, rejecting (say) an org editor
			// who also holds a lower direct viewer row. See ADR 0030 and #366.
			downstreamID := ""
			if action == handlers.ActionCommentAdd {
				downstreamID = userID
			}
			req := &collab.UpdateCommentRequest{
				CommentId: commentID,
				UserId:    downstreamID,
			}

			if updateData.Content != nil {
				req.Content = updateData.Content
			}
			if updateData.IsResolved != nil {
				req.IsResolved = updateData.IsResolved
			}

			resp, err := h.client.UpdateComment(ctx, req)
			if err != nil {
				return nil, err
			}

			// Convert response to JSON
			comment := map[string]interface{}{
				"id":                resp.Comment.Id,
				"project_id":        resp.Comment.ProjectId,
				"screenplay_id":     resp.Comment.ScreenplayId,
				"script_element_id": resp.Comment.ScriptElementId,
				"user_id":           resp.Comment.UserId,
				"content":           resp.Comment.Content,
				"line_number":       resp.Comment.LineNumber,
				"char_position":     resp.Comment.CharPosition,
				"parent_id":         resp.Comment.ParentId,
				"is_resolved":       resp.Comment.IsResolved,
				"created_at":        handlers.TimestampToString(resp.Comment.CreatedAt),
				"updated_at":        handlers.TimestampToString(resp.Comment.UpdatedAt),
			}
			return &comment, nil
		},
	}.ServeHTTP(w, r)
}

// DeleteComment removes a comment by ID. Requires a userID from the request context.
func (h *CollaborationHandler) DeleteComment(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, map[string]interface{}]{
		Method: http.MethodDelete,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*map[string]interface{}, error) {
			// Get comment ID from URL path
			path := strings.TrimPrefix(r.URL.Path, "/comments/")
			commentID := strings.Split(path, "/")[0]
			if commentID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "Comment ID is required")
			}

			// Call collaboration service
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			// Precise gate, same reasoning as UpdateComment: deleting your own
			// comment is ActionCommentAdd (viewer-permitted), deleting someone
			// else's is always ActionCommentModerate (editor+) — comparing
			// against the resource's real author, not just "has some access",
			// closes the same org-viewer-moderates-a-stranger's-comment gap
			// (#366) UpdateComment's fix closes.
			resourceResp, lookupErr := h.client.GetResourceProject(ctx, &collab.GetResourceProjectRequest{
				ResourceType: collab.ResourceType_RESOURCE_TYPE_COMMENT,
				ResourceId:   commentID,
			})
			if lookupErr != nil {
				return nil, lookupErr
			}
			isSelf := userID == resourceResp.OwnerUserId
			action := handlers.ActionCommentModerate
			if isSelf {
				action = handlers.ActionCommentAdd
			}
			if _, authErr := handlers.RequireProjectAccess(ctx, userID, resourceResp.ProjectId, action, h.scriptsClient, h.client, h.workspaceClient); authErr != nil {
				return nil, authErr
			}

			// Downstream identity: real caller only for the self-delete tier,
			// where collab-service's own DeleteComment skips CheckPermission
			// entirely on the authorship match — the bypass sentinel otherwise,
			// same reasoning as UpdateComment above (a narrower org-blind
			// recompute in collab must not override the gateway's combined
			// org+direct decision). See ADR 0030 and #366.
			downstreamID := ""
			if action == handlers.ActionCommentAdd {
				downstreamID = userID
			}
			resp, err := h.client.DeleteComment(ctx, &collab.DeleteCommentRequest{
				CommentId: commentID,
				UserId:    downstreamID,
			})
			if err != nil {
				return nil, err
			}

			// Return success response
			response := map[string]interface{}{
				"success": resp.Success,
				"message": "Comment deleted successfully",
			}
			return &response, nil
		},
	}.ServeHTTP(w, r)
}

// editSessionResponse is the JSON shape for one durable advisory edit lock.
type editSessionResponse struct {
	SessionID    string `json:"session_id"`
	UserID       string `json:"user_id"`
	Name         string `json:"name"`
	ElementID    string `json:"element_id,omitempty"`
	StartedAt    string `json:"started_at"`
	LastActivity string `json:"last_activity"`
}

// GetEditSessions lists the durable advisory edit locks for a project — who has
// it open and which element each is focused on. Unlike the live presence roster
// (delivered over the WebSocket), these are persisted, so the client can seed its
// soft-lock markers on open and keep showing an editor across a brief reconnect
// or a gateway restart. The caller must have access to the project.
func (h *CollaborationHandler) GetEditSessions(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, []editSessionResponse]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*[]editSessionResponse, error) {
			projectID := chi.URLParam(r, "projectId")
			if projectID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "project id is required")
			}

			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			// Same access gate the WebSocket uses: at least a viewer.
			if _, err := handlers.RequireProjectAccess(ctx, userID, projectID, handlers.ActionRead, h.scriptsClient, h.client, h.workspaceClient); err != nil {
				return nil, err
			}

			resp, err := h.client.GetActiveSessions(ctx, &collab.GetActiveSessionsRequest{ProjectId: projectID})
			if err != nil {
				return nil, apierror.New(apierror.CodeInternal, http.StatusInternalServerError, "Failed to load edit sessions")
			}

			// Resolve display names once per distinct user (a user rarely holds
			// more than one session, but dedupe keeps identity lookups minimal).
			names := make(map[string]string)
			out := make([]editSessionResponse, 0, len(resp.Sessions))
			for _, s := range resp.Sessions {
				name, ok := names[s.UserId]
				if !ok {
					name = h.resolveDisplayName(r.Context(), s.UserId)
					names[s.UserId] = name
				}
				out = append(out, editSessionResponse{
					SessionID:    s.Id,
					UserID:       s.UserId,
					Name:         name,
					ElementID:    s.ElementId,
					StartedAt:    handlers.TimestampToString(s.StartedAt),
					LastActivity: handlers.TimestampToString(s.LastActivity),
				})
			}
			return &out, nil
		},
	}.ServeHTTP(w, r)
}

// resolveDisplayName looks up a user's full name (falling back to username, then
// a "User xxxxxxxx" stub) via the identity service. Failures degrade to the stub
// rather than failing the request — a name is decorative here.
func (h *CollaborationHandler) resolveDisplayName(ctx context.Context, userID string) string {
	fallback := "Someone"
	if len(userID) >= 8 {
		fallback = "User " + userID[:8]
	}
	lookupCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	resp, err := h.identityClient.GetUser(lookupCtx, &identity.GetUserRequest{UserId: userID})
	if err != nil || resp.GetUser() == nil {
		return fallback
	}
	u := resp.GetUser()
	if name := strings.TrimSpace(u.GetFirstName() + " " + u.GetLastName()); name != "" {
		return name
	}
	if u.GetUsername() != "" {
		return u.GetUsername()
	}
	return fallback
}
