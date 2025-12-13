package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"scriptlith/server/internal/gateway/config"
	"scriptlith/server/pkg/grpc/collab"
	"scriptlith/server/pkg/grpc/common"
	"scriptlith/server/pkg/grpc/identity"
	"scriptlith/server/pkg/grpc/scripts"
)

// CollaborationHandler handles HTTP requests for collaboration service
type CollaborationHandler struct {
	client         collab.CollaborationServiceClient
	identityClient identity.IdentityServiceClient
	scriptsClient  scripts.ScriptsServiceClient
}

// NewCollaborationHandler creates a new collaboration handler
func NewCollaborationHandler(cfg *config.Config) (*CollaborationHandler, error) {
	// Connect to collaboration service
	collabConn, err := grpc.NewClient(cfg.CollaborationServiceURL(), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}

	// Connect to identity service
	identityConn, err := grpc.NewClient(cfg.IdentityServiceURL(), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}

	// Connect to scripts service
	scriptsConn, err := grpc.NewClient(cfg.ScriptsServiceURL(), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}

	client := collab.NewCollaborationServiceClient(collabConn)
	identityClient := identity.NewIdentityServiceClient(identityConn)
	scriptsClient := scripts.NewScriptsServiceClient(scriptsConn)

	return &CollaborationHandler{
		client:         client,
		identityClient: identityClient,
		scriptsClient:  scriptsClient,
	}, nil
}

// AddCollaborator handles adding a collaborator to a project
func (h *CollaborationHandler) AddCollaborator(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ProjectID string `json:"project_id"`
		Email     string `json:"email"`
		Role      string `json:"role"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate role
	validRoles := map[string]bool{
		"owner":  true,
		"editor": true,
		"viewer": true,
	}
	if !validRoles[req.Role] {
		http.Error(w, "Invalid role. Must be 'owner', 'editor', or 'viewer'", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Resolve email or user tag to actual email address
	actualEmail, err := h.resolveEmailOrUserTag(req.Email)
	if err != nil {
		fmt.Printf("DEBUG: Failed to resolve email/user tag '%s': %v\n", req.Email, err)
		http.Error(w, "Failed to resolve user: "+err.Error(), http.StatusBadRequest)
		return
	}

	fmt.Printf("DEBUG: Resolved '%s' to email '%s'\n", req.Email, actualEmail)

	// Call collaboration service
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.AddCollaborator(ctx, &collab.AddCollaboratorRequest{
		ProjectId: req.ProjectID,
		InviterId: userID,
		Email:     actualEmail, // Use resolved email
		Role:      req.Role,
	})
	if err != nil {
		http.Error(w, "Failed to add collaborator: "+err.Error(), http.StatusInternalServerError)
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

// GetProjectCollaborators handles getting collaborators for a project
func (h *CollaborationHandler) GetProjectCollaborators(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	projectID := r.URL.Query().Get("project_id")
	if projectID == "" {
		http.Error(w, "project_id is required", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call collaboration service
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.GetProjectCollaborators(ctx, &collab.GetProjectCollaboratorsRequest{
		ProjectId: projectID,
		UserId:    userID,
	})
	if err != nil {
		http.Error(w, "Failed to get collaborators", http.StatusInternalServerError)
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
				identityCtx, identityCancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer identityCancel()

				inviterResp, err := h.identityClient.GetUser(identityCtx, &identity.GetUserRequest{
					UserId: collab.InvitedBy,
				})
				if err != nil {
					fmt.Printf("DEBUG: Failed to get inviter details for user %s: %v\n", collab.InvitedBy, err)
					// Fallback display for pending invitation
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
				identityCtx, identityCancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer identityCancel()

				userResp, err := h.identityClient.GetUser(identityCtx, &identity.GetUserRequest{
					UserId: collab.UserId,
				})
				if err != nil {
					fmt.Printf("DEBUG: Failed to get user details for user %s: %v\n", collab.UserId, err)
					// Fallback to user ID
					collaboratorData["name"] = fmt.Sprintf("User %s", collab.UserId[:8])
					collaboratorData["email"] = fmt.Sprintf("user-%s@example.com", collab.UserId[:8])
				} else if userResp.User != nil {
					collaboratorData["name"] = userResp.User.FirstName + " " + userResp.User.LastName
					collaboratorData["email"] = userResp.User.Email
					if userResp.User.UserTag != "" {
						collaboratorData["username_with_tag"] = userResp.User.UserTag
					}
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

// AddComment handles adding a comment to a project
func (h *CollaborationHandler) AddComment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
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
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call collaboration service
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
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
		http.Error(w, "Failed to add comment", http.StatusInternalServerError)
		return
	}

	// Get username from identity service
	userResp, err := h.identityClient.GetUser(ctx, &identity.GetUserRequest{
		UserId: userID,
	})
	if err != nil {
		// If we can't get the username, use a fallback
		fmt.Printf("Warning: Could not get username for user %s: %v\n", userID, err)
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

// GetComments handles getting comments for a screenplay
func (h *CollaborationHandler) GetComments(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	screenplayID := r.URL.Query().Get("screenplay_id")
	if screenplayID == "" {
		http.Error(w, "screenplay_id is required", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Check if user has access to the project (screenplay_id is actually project_id)
	// This is a workaround since collab service doesn't have access to projects table
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Verify project access via scripts service
	_, err := h.scriptsClient.GetProject(ctx, &scripts.GetProjectRequest{
		ProjectId: screenplayID,
		UserId:    userID,
	})
	if err != nil {
		// User doesn't have access to this project
		http.Error(w, "Unauthorized access to project", http.StatusForbidden)
		return
	}

	// Call collaboration service
	resp, err := h.client.GetComments(ctx, &collab.GetCommentsRequest{
		ScreenplayId: screenplayID,
		UserId:       userID,
	})
	if err != nil {
		http.Error(w, "Failed to get comments", http.StatusInternalServerError)
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

// UpdatePresence handles updating user presence
func (h *CollaborationHandler) UpdatePresence(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ProjectID      string `json:"project_id"`
		ScreenplayID   string `json:"screenplay_id"`
		CursorPosition int32  `json:"cursor_position"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call collaboration service
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.UpdatePresence(ctx, &collab.UpdatePresenceRequest{
		UserId:         userID,
		ProjectId:      req.ProjectID,
		ScreenplayId:   req.ScreenplayID,
		CursorPosition: req.CursorPosition,
	})
	if err != nil {
		http.Error(w, "Failed to update presence", http.StatusInternalServerError)
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

// Helper functions
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

// resolveEmailOrUserTag resolves either an email address or user tag (@username) to an email address
func (h *CollaborationHandler) resolveEmailOrUserTag(input string) (string, error) {
	fmt.Printf("DEBUG: Resolving input: '%s'\n", input)

	// If it's already an email (contains @), return as-is
	if strings.Contains(input, "@") && !strings.HasPrefix(input, "@") {
		fmt.Printf("DEBUG: Input is already an email: %s\n", input)
		return input, nil
	}

	// If it starts with @, it's a user tag - look up the user by username
	if strings.HasPrefix(input, "@") {
		username := strings.TrimPrefix(input, "@")
		fmt.Printf("DEBUG: Input is user tag, username: %s\n", username)
		return h.getUserEmailByUsername(username)
	}

	// If it contains # it's likely a username#tag format
	if strings.Contains(input, "#") {
		fmt.Printf("DEBUG: Input contains #, treating as username#tag: %s\n", input)
		parts := strings.SplitN(input, "#", 2)
		username := parts[0]
		userTag := parts[1]
		return h.getUserEmailByUsernameAndTag(username, userTag)
	}

	// If it doesn't contain @ and doesn't start with @, assume it's a username
	fmt.Printf("DEBUG: Input treated as plain username: %s\n", input)
	return h.getUserEmailByUsername(input)
}

// getUserEmailByUsername looks up a user's email by their username via identity service
func (h *CollaborationHandler) getUserEmailByUsername(username string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	fmt.Printf("DEBUG: Looking up user by username: '%s'\n", username)

	// Call identity service to find user by username/user_tag
	// The identity service expects both username and user_tag, so we'll try username in both fields
	resp, err := h.identityClient.GetUserByUsernameTag(ctx, &identity.GetUserByUsernameTagRequest{
		Username: username,
		UserTag:  username, // Try as user_tag as well
	})
	if err != nil {
		fmt.Printf("DEBUG: Failed to find user %s: %v\n", username, err)
		return "", fmt.Errorf("user '%s' not found: %v", username, err)
	}

	if resp.User == nil {
		return "", fmt.Errorf("user '%s' not found", username)
	}

	fmt.Printf("DEBUG: Found user %s with email: %s\n", username, resp.User.Email)
	return resp.User.Email, nil
}

// getUserEmailByUsernameAndTag looks up a user's email by their username and tag via identity service
func (h *CollaborationHandler) getUserEmailByUsernameAndTag(username, userTag string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	fmt.Printf("DEBUG: Looking up user by username: '%s' and tag: '%s'\n", username, userTag)

	// Call identity service to find user by username and user_tag
	resp, err := h.identityClient.GetUserByUsernameTag(ctx, &identity.GetUserByUsernameTagRequest{
		Username: username,
		UserTag:  userTag,
	})
	if err != nil {
		fmt.Printf("DEBUG: Failed to find user %s#%s: %v\n", username, userTag, err)
		return "", fmt.Errorf("user '%s#%s' not found: %v", username, userTag, err)
	}

	if resp.User == nil {
		return "", fmt.Errorf("user '%s#%s' not found", username, userTag)
	}

	fmt.Printf("DEBUG: Found user %s#%s with email: %s\n", username, userTag, resp.User.Email)
	return resp.User.Email, nil
}

func timestampToString(ts *common.Timestamp) string {
	if ts == nil {
		return ""
	}
	return time.Unix(ts.Seconds, int64(ts.Nanos)).UTC().Format(time.RFC3339)
}

// GetUserInvitations handles getting pending invitations for a user
func (h *CollaborationHandler) GetUserInvitations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	fmt.Printf("DEBUG: Getting invitations for user ID: %s\n", userID)

	// First, get the user's email from identity service since invitations are stored by email
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	userResp, err := h.identityClient.GetUser(ctx, &identity.GetUserRequest{
		UserId: userID,
	})
	if err != nil {
		fmt.Printf("DEBUG: Failed to get user details for user ID %s: %v\n", userID, err)
		http.Error(w, "Failed to get user details: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if userResp.User == nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	userEmail := userResp.User.Email
	fmt.Printf("DEBUG: User email: %s\n", userEmail)

	// Call collaboration service to get actual pending invitations by email
	resp, err := h.client.GetUserInvitations(ctx, &collab.GetUserInvitationsRequest{
		Email: userEmail,
	})
	if err != nil {
		fmt.Printf("DEBUG: Failed to get invitations from collab service: %v\n", err)
		http.Error(w, "Failed to get user invitations: "+err.Error(), http.StatusInternalServerError)
		return
	}

	fmt.Printf("DEBUG: Retrieved %d invitations from collab service\n", len(resp.Invitations))

	// Debug: Print invitation details
	for i, inv := range resp.Invitations {
		fmt.Printf("DEBUG: Invitation %d - ID: %s, ProjectID: %s, InvitedBy: %s, Status: %s\n",
			i, inv.Id, inv.ProjectId, inv.InvitedBy, inv.Status)
	}

	// Convert response to the expected format
	// Initialize with empty slice to ensure JSON encodes as [] not null
	invitations := make([]map[string]interface{}, 0)
	for _, invitation := range resp.Invitations {
		// Get inviter name using invited_by field
		inviterName := "Unknown User"
		if invitation.InvitedBy != "" && invitation.InvitedBy != "00000000-0000-0000-0000-000000000000" {
			fmt.Printf("DEBUG: Looking up inviter user ID: %s\n", invitation.InvitedBy)

			// Call identity service to get inviter details
			inviterCtx, inviterCancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer inviterCancel()

			inviterResp, err := h.identityClient.GetUser(inviterCtx, &identity.GetUserRequest{
				UserId: invitation.InvitedBy,
			})
			if err != nil {
				fmt.Printf("DEBUG: Failed to get inviter details for user %s: %v\n", invitation.InvitedBy, err)
				// Use a more friendly fallback
				inviterName = "Former User"
			} else if inviterResp.User != nil {
				inviterName = inviterResp.User.FirstName + " " + inviterResp.User.LastName
				if inviterName == " " || inviterName == "" {
					inviterName = inviterResp.User.Email
				}
				fmt.Printf("DEBUG: Successfully resolved inviter: %s\n", inviterName)
			} else {
				fmt.Printf("DEBUG: Identity service returned nil user for ID: %s\n", invitation.InvitedBy)
				inviterName = "Former User"
			}
		} else {
			fmt.Printf("DEBUG: Invalid or empty invited_by field: '%s'\n", invitation.InvitedBy)
		}

		// Get project name from scripts service
		projectName := "Unknown Project"
		if invitation.ProjectId != "" {
			projectCtx, projectCancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer projectCancel()

			projectResp, err := h.scriptsClient.GetProject(projectCtx, &scripts.GetProjectRequest{
				ProjectId: invitation.ProjectId,
			})
			if err != nil {
				fmt.Printf("DEBUG: Failed to get project name for project %s: %v\n", invitation.ProjectId, err)
			} else if projectResp.Project != nil {
				projectName = projectResp.Project.Title // Use Title field
			}
		}

		invitationData := map[string]interface{}{
			"id":          invitation.Id, // Invitation ID for accept/decline operations
			"projectId":   invitation.ProjectId,
			"projectName": projectName,
			"role":        invitation.Role,
			"invitedBy":   inviterName,
			"invitedById": invitation.InvitedBy,
			"status":      invitation.Status,
			"createdAt":   timestampToString(invitation.InvitedAt),
		}
		fmt.Printf("DEBUG: Adding invitation to response: %+v\n", invitationData)
		invitations = append(invitations, invitationData)
	}

	fmt.Printf("DEBUG: Sending %d invitations to frontend\n", len(invitations))
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(invitations); err != nil {
		fmt.Printf("DEBUG: Failed to encode response: %v\n", err)
	}
}

// AcceptInvitation handles accepting a collaboration invitation
func (h *CollaborationHandler) AcceptInvitation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		CollaboratorID string `json:"collaborator_id"`
		ID             string `json:"id"` // Alternative field name
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Accept either collaborator_id or id field
	collaboratorID := req.CollaboratorID
	if collaboratorID == "" {
		collaboratorID = req.ID
	}

	if collaboratorID == "" {
		http.Error(w, "collaborator_id or id is required", http.StatusBadRequest)
		return
	}

	fmt.Printf("DEBUG: Accepting invitation with ID: %s\n", collaboratorID)

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call the collaboration service to accept the invitation
	resp, err := h.client.AcceptInvitation(r.Context(), &collab.AcceptInvitationRequest{
		UserId:         userID,
		CollaboratorId: collaboratorID,
	})
	if err != nil {
		http.Error(w, "Failed to accept invitation: "+err.Error(), http.StatusInternalServerError)
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

// DeclineInvitation handles declining a collaboration invitation
func (h *CollaborationHandler) DeclineInvitation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		CollaboratorID string `json:"collaborator_id"`
		ID             string `json:"id"` // Alternative field name
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Accept either collaborator_id or id field
	collaboratorID := req.CollaboratorID
	if collaboratorID == "" {
		collaboratorID = req.ID
	}

	if collaboratorID == "" {
		http.Error(w, "collaborator_id or id is required", http.StatusBadRequest)
		return
	}

	fmt.Printf("DEBUG: Declining invitation with ID: %s\n", collaboratorID)

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call the collaboration service to decline the invitation
	_, err := h.client.DeclineInvitation(r.Context(), &collab.DeclineInvitationRequest{
		UserId:         userID,
		CollaboratorId: collaboratorID,
	})
	if err != nil {
		http.Error(w, "Failed to decline invitation: "+err.Error(), http.StatusInternalServerError)
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

// UpdateCollaboratorRole handles updating a collaborator's role
func (h *CollaborationHandler) UpdateCollaboratorRole(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract collaborator ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/collaborators/")
	collaboratorID := strings.TrimSuffix(path, "/")
	if collaboratorID == "" {
		http.Error(w, "Collaborator ID is required", http.StatusBadRequest)
		return
	}

	var req struct {
		Role string `json:"role"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
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
		http.Error(w, "Invalid role. Must be 'OWNER', 'WRITER', 'EDITOR', or 'REVIEWER'", http.StatusBadRequest)
		return
	}

	// Get user ID from context
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call collaboration service
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.UpdateCollaboratorRole(ctx, &collab.UpdateCollaboratorRoleRequest{
		UserId:         userID,
		CollaboratorId: collaboratorID,
		NewRole:        req.Role,
	})
	if err != nil {
		http.Error(w, "Failed to update collaborator role: "+err.Error(), http.StatusInternalServerError)
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

// RemoveCollaborator handles removing a collaborator from a project
func (h *CollaborationHandler) RemoveCollaborator(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract collaborator ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/collaborators/")
	collaboratorID := strings.TrimSuffix(path, "/")
	if collaboratorID == "" {
		http.Error(w, "Collaborator ID is required", http.StatusBadRequest)
		return
	}

	// Get user ID from context
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call collaboration service
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := h.client.RemoveCollaborator(ctx, &collab.RemoveCollaboratorRequest{
		UserId:         userID,
		CollaboratorId: collaboratorID,
	})
	if err != nil {
		http.Error(w, "Failed to remove collaborator: "+err.Error(), http.StatusInternalServerError)
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

// UpdateComment handles updating an existing comment
func (h *CollaborationHandler) UpdateComment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get comment ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/comments/")
	commentID := strings.Split(path, "/")[0]
	if commentID == "" {
		http.Error(w, "Comment ID is required", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var updateData struct {
		Content    *string `json:"content,omitempty"`
		IsResolved *bool   `json:"is_resolved,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&updateData); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	// Call collaboration service
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
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
		http.Error(w, "Failed to update comment: "+err.Error(), http.StatusInternalServerError)
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

// DeleteComment handles deleting an existing comment
func (h *CollaborationHandler) DeleteComment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get comment ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/comments/")
	commentID := strings.Split(path, "/")[0]
	if commentID == "" {
		http.Error(w, "Comment ID is required", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call collaboration service
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.DeleteComment(ctx, &collab.DeleteCommentRequest{
		CommentId: commentID,
		UserId:    userID,
	})
	if err != nil {
		http.Error(w, "Failed to delete comment: "+err.Error(), http.StatusInternalServerError)
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
