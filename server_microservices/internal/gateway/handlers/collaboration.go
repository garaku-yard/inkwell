package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"scriptlith/server_microservices/internal/gateway/config"
	"scriptlith/server_microservices/pkg/grpc/collab"
	"scriptlith/server_microservices/pkg/grpc/common"
)

// CollaborationHandler handles HTTP requests for collaboration service
type CollaborationHandler struct {
	client collab.CollaborationServiceClient
}

// NewCollaborationHandler creates a new collaboration handler
func NewCollaborationHandler(cfg *config.Config) (*CollaborationHandler, error) {
	// Connect to collaboration service
	conn, err := grpc.NewClient(cfg.CollaborationServiceURL(), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}

	client := collab.NewCollaborationServiceClient(conn)

	return &CollaborationHandler{
		client: client,
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

	// Call collaboration service
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.AddCollaborator(ctx, &collab.AddCollaboratorRequest{
		ProjectId: req.ProjectID,
		InviterId: userID,
		Email:     req.Email,
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

	// Convert response to JSON
	var collaborators []map[string]interface{}
	for _, collab := range resp.Collaborators {
		collaborators = append(collaborators, map[string]interface{}{
			"id":         collab.Id,
			"project_id": collab.ProjectId,
			"user_id":    collab.UserId,
			"role":       collab.Role,
			"status":     collab.Status,
			"invited_at": timestampToString(collab.InvitedAt),
			"joined_at":  timestampToString(collab.JoinedAt),
		})
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
		LineNumber:      req.LineNumber,
		CharPosition:    req.CharPosition,
		ParentId:        req.ParentID,
	})
	if err != nil {
		http.Error(w, "Failed to add comment", http.StatusInternalServerError)
		return
	}

	// Convert response to JSON
	response := map[string]interface{}{
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

	// Call collaboration service
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.GetComments(ctx, &collab.GetCommentsRequest{
		ScreenplayId: screenplayID,
		UserId:       userID,
	})
	if err != nil {
		http.Error(w, "Failed to get comments", http.StatusInternalServerError)
		return
	}

	// Convert response to JSON
	var comments []map[string]interface{}
	for _, comment := range resp.Comments {
		comments = append(comments, map[string]interface{}{
			"id":                comment.Id,
			"project_id":        comment.ProjectId,
			"screenplay_id":     comment.ScreenplayId,
			"script_element_id": comment.ScriptElementId,
			"user_id":           comment.UserId,
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
	// This would normally be set by auth middleware
	// For now, we'll check for a header or return a placeholder
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		// In a real implementation, this would be extracted from JWT
		return "00000000-0000-0000-0000-000000000000"
	}
	return userID
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

	// For now, this returns a placeholder response
	// In a real implementation, this would call the collaboration service
	// to get actual pending invitations for the user

	// Example response structure for pending invitations
	response := []map[string]interface{}{
		{
			"id":           "example-invitation-id",
			"project_id":   "example-project-id",
			"project_name": "Example Project",
			"inviter_name": "John Doe",
			"role":         "editor",
			"status":       "pending",
			"invited_at":   "2025-11-22T21:30:00Z",
			"message":      "You've been invited to collaborate on this project",
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// AcceptInvitation handles accepting a collaboration invitation
func (h *CollaborationHandler) AcceptInvitation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		CollaboratorID string `json:"collaborator_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.CollaboratorID == "" {
		http.Error(w, "collaborator_id is required", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// For now, this is a placeholder implementation
	// In a real implementation, this would:
	// 1. Validate the collaborator_id belongs to the user
	// 2. Update the collaborator status to "active"
	// 3. Set the joined_at timestamp
	// 4. Return the updated collaborator information

	response := map[string]interface{}{
		"success": true,
		"message": "Invitation accepted successfully",
		"collaborator": map[string]interface{}{
			"id":        req.CollaboratorID,
			"status":    "active",
			"joined_at": "2025-11-22T21:30:00Z",
		},
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
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.CollaboratorID == "" {
		http.Error(w, "collaborator_id is required", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// For now, this is a placeholder implementation
	// In a real implementation, this would:
	// 1. Validate the collaborator_id belongs to the user
	// 2. Delete the collaborator record (declined invitations are removed)
	// 3. Optionally send a notification to the inviter

	response := map[string]interface{}{
		"success": true,
		"message": "Invitation declined successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}
