package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/pkg/grpc/collab"
	"inkwell/server/pkg/grpc/identity"
	"inkwell/server/pkg/grpc/scripts"
)

// CollaborationHandler routes collaboration HTTP requests to the collab gRPC
// service. It also reaches the identity service to resolve display names for
// collaborators and comment authors, and the scripts service to look up project
// titles when enriching invitation data.
type CollaborationHandler struct {
	client         collab.CollaborationServiceClient
	identityClient identity.IdentityServiceClient
	scriptsClient  scripts.ScriptsServiceClient
}

// NewCollaborationHandler creates a CollaborationHandler using the gRPC clients
// in the provided registry.
func NewCollaborationHandler(clients *grpcclient.Registry) *CollaborationHandler {
	return &CollaborationHandler{
		client:         clients.Collab,
		identityClient: clients.Identity,
		scriptsClient:  clients.Scripts,
	}
}

// AddCollaborator sends a project invitation to a user identified by email address
// or user tag. The role must be "editor" or "viewer"; the "owner" role cannot be
// assigned through this endpoint. The input is resolved to a canonical email before
// being forwarded to the collab service.
func (h *CollaborationHandler) AddCollaborator(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ProjectID string `json:"project_id"`
		Email     string `json:"email"`
		Role      string `json:"role"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate role — owner cannot be assigned via invitation
	validRoles := map[string]bool{
		"editor": true,
		"viewer": true,
	}
	if !validRoles[req.Role] {
		writeError(w, "Invalid role. Must be 'editor' or 'viewer'", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Resolve email or user tag to actual email address
	actualEmail, err := h.resolveEmailOrUserTag(r.Context(), req.Email)
	if err != nil {
		writeError(w, "Failed to resolve user: "+err.Error(), http.StatusBadRequest)
		return
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
		writeError(w, "Failed to add collaborator: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Convert response to JSON
	response := struct {
		ID        string `json:"id"`
		ProjectID string `json:"project_id"`
		UserID    string `json:"user_id"`
		Email     string `json:"email"`
		Role      string `json:"role"`
		Status    string `json:"status"`
		InvitedAt string `json:"invited_at"`
		JoinedAt  string `json:"joined_at,omitempty"`
		Message   string `json:"message"`
	}{
		ID:        resp.Collaborator.Id,
		ProjectID: resp.Collaborator.ProjectId,
		UserID:    resp.Collaborator.UserId,
		Email:     req.Email,
		Role:      resp.Collaborator.Role,
		Status:    resp.Collaborator.Status,
		InvitedAt: timestampToString(resp.Collaborator.InvitedAt),
		JoinedAt:  timestampToString(resp.Collaborator.JoinedAt),
		Message:   "Invitation sent successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// GetProjectCollaborators returns all collaborators for a project, both active and
// pending. Active records are enriched with user profile data from the identity
// service; pending records show the inviter's name instead of the invited user,
// whose account may not yet exist.
func (h *CollaborationHandler) GetProjectCollaborators(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	projectID := r.URL.Query().Get("project_id")
	if projectID == "" {
		writeError(w, "project_id is required", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call collaboration service
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.client.GetProjectCollaborators(ctx, &collab.GetProjectCollaboratorsRequest{
		ProjectId: projectID,
		UserId:    userID,
	})
	if err != nil {
		writeError(w, "Failed to get collaborators", http.StatusInternalServerError)
		return
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
			"invited_at": timestampToString(collab.InvitedAt),
			"joined_at":  timestampToString(collab.JoinedAt),
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(collaborators)
}

// AddComment attaches a comment to a project or a specific scene/element within it.
// Supports threaded replies via the optional parent_id field. Requires a userID from
// the request context. The response includes the commenter's username, resolved from
// the identity service.
func (h *CollaborationHandler) AddComment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ProjectID       string  `json:"project_id"`
		ScreenplayID    string  `json:"screenplay_id"`
		Content         string  `json:"content"`
		ScriptElementID *string `json:"script_element_id,omitempty"`
		SceneID         *string `json:"scene_id,omitempty"`
		LineNumber      int32   `json:"line_number,omitempty"`
		CharPosition    int32   `json:"char_position,omitempty"`
		ParentID        *string `json:"parent_id,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call collaboration service
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

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
		writeError(w, "Failed to add comment", http.StatusInternalServerError)
		return
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
		"created_at":        timestampToString(resp.Comment.CreatedAt),
		"updated_at":        timestampToString(resp.Comment.UpdatedAt),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// GetComments returns all comments for a project, identified by screenplay_id.
// Verifies the caller has access via resolveProjectAccess before fetching. Each
// comment is enriched with the author's username from the identity service.
func (h *CollaborationHandler) GetComments(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	screenplayID := r.URL.Query().Get("screenplay_id")
	if screenplayID == "" {
		writeError(w, "screenplay_id is required", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if _, err := resolveProjectAccess(ctx, userID, screenplayID, h.scriptsClient, h.client); err != nil {
		writeError(w, "Forbidden", http.StatusForbidden)
		return
	}

	// Call collaboration service
	resp, err := h.client.GetComments(ctx, &collab.GetCommentsRequest{
		ScreenplayId: screenplayID,
		UserId:       userID,
	})
	if err != nil {
		writeError(w, "Failed to get comments", http.StatusInternalServerError)
		return
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
			"created_at":        timestampToString(comment.CreatedAt),
			"updated_at":        timestampToString(comment.UpdatedAt),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(comments)
}

// UpdatePresence records the authenticated user's current cursor position within
// a project. Used by real-time collaboration features to show active editors.
func (h *CollaborationHandler) UpdatePresence(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ProjectID      string `json:"project_id"`
		ScreenplayID   string `json:"screenplay_id"`
		CursorPosition int32  `json:"cursor_position"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call collaboration service
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.client.UpdatePresence(ctx, &collab.UpdatePresenceRequest{
		UserId:         userID,
		ProjectId:      req.ProjectID,
		ScreenplayId:   req.ScreenplayID,
		CursorPosition: req.CursorPosition,
	})
	if err != nil {
		writeError(w, "Failed to update presence", http.StatusInternalServerError)
		return
	}

	// Convert response to JSON
	response := map[string]interface{}{
		"user_id":         resp.Presence.UserId,
		"project_id":      resp.Presence.ProjectId,
		"screenplay_id":   resp.Presence.ScreenplayId,
		"cursor_position": resp.Presence.CursorPosition,
		"last_seen":       timestampToString(resp.Presence.LastSeen),
		"is_online":       resp.Presence.IsOnline,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// getUserIDFromContext extracts the authenticated user's ID from the request context,
// falling back to the X-User-ID header set by the auth middleware. Returns an empty
// string if neither source yields a value, which callers should treat as an
// unauthenticated request and respond with 401.
func getUserIDFromContext(r *http.Request) string {
	// First, try to get user ID from context (set by auth middleware)
	if userID := r.Context().Value("userID"); userID != nil {
		if userIDStr, ok := userID.(string); ok {
			return userIDStr
		}
	}

	// Fallback: try to get from header (also set by auth middleware)
	userID := r.Header.Get("X-User-ID")
	if userID != "" {
		return userID
	}

	// If no proper auth, return empty (which will trigger 401)
	return ""
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
	if r.Method != http.MethodGet {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// First, get the user's email from identity service since invitations are stored by email
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	userResp, err := h.identityClient.GetUser(ctx, &identity.GetUserRequest{
		UserId: userID,
	})
	if err != nil {
		writeError(w, "Failed to get user details: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if userResp.User == nil {
		writeError(w, "User not found", http.StatusNotFound)
		return
	}

	userEmail := userResp.User.Email

	// Call collaboration service to get actual pending invitations by email
	resp, err := h.client.GetUserInvitations(ctx, &collab.GetUserInvitationsRequest{
		Email: userEmail,
	})
	if err != nil {
		writeError(w, "Failed to get user invitations: "+err.Error(), http.StatusInternalServerError)
		return
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
			"createdAt":   timestampToString(invitation.InvitedAt),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(invitations)
}

// AcceptInvitation marks a pending invitation as accepted, granting the authenticated
// user active collaborator access to the project. Accepts either collaborator_id or
// id in the request body for client compatibility.
func (h *CollaborationHandler) AcceptInvitation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		CollaboratorID string `json:"collaborator_id"`
		ID             string `json:"id"` // Alternative field name
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Accept either collaborator_id or id field
	collaboratorID := req.CollaboratorID
	if collaboratorID == "" {
		collaboratorID = req.ID
	}

	if collaboratorID == "" {
		writeError(w, "collaborator_id or id is required", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call the collaboration service to accept the invitation
	resp, err := h.client.AcceptInvitation(r.Context(), &collab.AcceptInvitationRequest{
		UserId:         userID,
		CollaboratorId: collaboratorID,
	})
	if err != nil {
		writeError(w, "Failed to accept invitation: "+err.Error(), http.StatusInternalServerError)
		return
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
			"invited_at": timestampToString(resp.Collaborator.InvitedAt),
			"joined_at":  timestampToString(resp.Collaborator.JoinedAt),
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// DeclineInvitation marks a pending invitation as declined without granting project
// access. Accepts either collaborator_id or id in the request body for client compatibility.
func (h *CollaborationHandler) DeclineInvitation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		CollaboratorID string `json:"collaborator_id"`
		ID             string `json:"id"` // Alternative field name
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Accept either collaborator_id or id field
	collaboratorID := req.CollaboratorID
	if collaboratorID == "" {
		collaboratorID = req.ID
	}

	if collaboratorID == "" {
		writeError(w, "collaborator_id or id is required", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call the collaboration service to decline the invitation
	_, err := h.client.DeclineInvitation(r.Context(), &collab.DeclineInvitationRequest{
		UserId:         userID,
		CollaboratorId: collaboratorID,
	})
	if err != nil {
		writeError(w, "Failed to decline invitation: "+err.Error(), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"message": "Invitation declined successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// UpdateCollaboratorRole changes the role of an existing collaborator. The caller
// must supply a valid role: OWNER, WRITER, EDITOR, or REVIEWER. The collaborator
// ID is extracted from the URL path.
func (h *CollaborationHandler) UpdateCollaboratorRole(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract collaborator ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/collaborators/")
	collaboratorID := strings.TrimSuffix(path, "/")
	if collaboratorID == "" {
		writeError(w, "Collaborator ID is required", http.StatusBadRequest)
		return
	}

	var req struct {
		Role string `json:"role"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate role
	validRoles := map[string]bool{
		"OWNER":    true,
		"WRITER":   true,
		"EDITOR":   true,
		"REVIEWER": true,
	}
	if !validRoles[req.Role] {
		writeError(w, "Invalid role. Must be 'OWNER', 'WRITER', 'EDITOR', or 'REVIEWER'", http.StatusBadRequest)
		return
	}

	// Get user ID from context
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call collaboration service
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.client.UpdateCollaboratorRole(ctx, &collab.UpdateCollaboratorRoleRequest{
		UserId:         userID,
		CollaboratorId: collaboratorID,
		NewRole:        req.Role,
	})
	if err != nil {
		writeError(w, "Failed to update collaborator role: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Return updated collaborator info
	response := map[string]interface{}{
		"id":         resp.Collaborator.Id,
		"project_id": resp.Collaborator.ProjectId,
		"user_id":    resp.Collaborator.UserId,
		"role":       resp.Collaborator.Role,
		"status":     resp.Collaborator.Status,
		"invited_at": timestampToString(resp.Collaborator.InvitedAt),
		"joined_at":  timestampToString(resp.Collaborator.JoinedAt),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// RemoveCollaborator removes a collaborator from a project. The collaborator ID is
// extracted from the URL path. Requires a userID from the request context.
func (h *CollaborationHandler) RemoveCollaborator(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract collaborator ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/collaborators/")
	collaboratorID := strings.TrimSuffix(path, "/")
	if collaboratorID == "" {
		writeError(w, "Collaborator ID is required", http.StatusBadRequest)
		return
	}

	// Get user ID from context
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call collaboration service
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	_, err := h.client.RemoveCollaborator(ctx, &collab.RemoveCollaboratorRequest{
		UserId:         userID,
		CollaboratorId: collaboratorID,
	})
	if err != nil {
		writeError(w, "Failed to remove collaborator: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Return success response
	response := map[string]string{
		"message": "Collaborator removed successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// UpdateComment applies partial updates to an existing comment. Only non-nil fields
// are forwarded: content replaces the body text, and is_resolved marks the thread resolved.
func (h *CollaborationHandler) UpdateComment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get comment ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/comments/")
	commentID := strings.Split(path, "/")[0]
	if commentID == "" {
		writeError(w, "Comment ID is required", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var updateData struct {
		Content    *string `json:"content,omitempty"`
		IsResolved *bool   `json:"is_resolved,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&updateData); err != nil {
		writeError(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	// Call collaboration service
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	req := &collab.UpdateCommentRequest{
		CommentId: commentID,
		UserId:    userID,
	}

	if updateData.Content != nil {
		req.Content = updateData.Content
	}
	if updateData.IsResolved != nil {
		req.IsResolved = updateData.IsResolved
	}

	resp, err := h.client.UpdateComment(ctx, req)
	if err != nil {
		writeError(w, "Failed to update comment: "+err.Error(), http.StatusInternalServerError)
		return
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
		"created_at":        timestampToString(resp.Comment.CreatedAt),
		"updated_at":        timestampToString(resp.Comment.UpdatedAt),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(comment)
}

// DeleteComment removes a comment by ID. Requires a userID from the request context.
func (h *CollaborationHandler) DeleteComment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get comment ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/comments/")
	commentID := strings.Split(path, "/")[0]
	if commentID == "" {
		writeError(w, "Comment ID is required", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call collaboration service
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := h.client.DeleteComment(ctx, &collab.DeleteCommentRequest{
		CommentId: commentID,
		UserId:    userID,
	})
	if err != nil {
		writeError(w, "Failed to delete comment: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Return success response
	response := map[string]interface{}{
		"success": resp.Success,
		"message": "Comment deleted successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
