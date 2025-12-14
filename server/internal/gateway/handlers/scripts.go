package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"google.golang.org/grpc"

	"scriptlith/server/internal/gateway/config"
	"scriptlith/server/pkg/grpc/collab"
	"scriptlith/server/pkg/grpc/common"
	"scriptlith/server/pkg/grpc/identity"
	scriptspb "scriptlith/server/pkg/grpc/scripts"
)

// ScriptsHandler handles HTTP requests related to scripts and forwards them to Scripts service
type ScriptsHandler struct {
	scriptsClient  scriptspb.ScriptsServiceClient
	collabClient   collab.CollaborationServiceClient
	identityClient identity.IdentityServiceClient
}

// NewScriptsHandler creates a new ScriptsHandler
func NewScriptsHandler(cfg *config.Config) (*ScriptsHandler, error) {
	// Connect to Scripts service
	conn, err := grpc.Dial(
		cfg.ScriptsService.Host+":"+cfg.ScriptsService.Port,
		grpc.WithInsecure(),
		grpc.WithTimeout(time.Second*30),
	)
	if err != nil {
		return nil, err
	}

	scriptsClient := scriptspb.NewScriptsServiceClient(conn)

	// Connect to Collaboration service
	collabConn, err := grpc.Dial(
		cfg.CollabService.Host+":"+cfg.CollabService.Port,
		grpc.WithInsecure(),
		grpc.WithTimeout(time.Second*30),
	)
	if err != nil {
		return nil, err
	}

	collabClient := collab.NewCollaborationServiceClient(collabConn)

	// Connect to Identity service
	identityConn, err := grpc.Dial(
		cfg.IdentityService.Host+":"+cfg.IdentityService.Port,
		grpc.WithInsecure(),
		grpc.WithTimeout(time.Second*30),
	)
	if err != nil {
		return nil, err
	}

	identityClient := identity.NewIdentityServiceClient(identityConn)

	return &ScriptsHandler{
		scriptsClient:  scriptsClient,
		collabClient:   collabClient,
		identityClient: identityClient,
	}, nil
}

// CreateProject creates a new screenplay project
func (h *ScriptsHandler) CreateProject(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("DEBUG: CreateProject called\n")
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse request body
	var req struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		OwnerID     string `json:"owner_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	fmt.Printf("DEBUG: CreateProject for user: %s, title: %s\n", req.OwnerID, req.Title)

	// Validate required fields
	if req.Title == "" {
		http.Error(w, "Title is required", http.StatusBadRequest)
		return
	}
	if req.OwnerID == "" {
		http.Error(w, "Owner ID is required", http.StatusBadRequest)
		return
	}

	// Call Scripts service
	resp, err := h.scriptsClient.CreateProject(context.Background(), &scriptspb.CreateProjectRequest{
		Title:       req.Title,
		Description: req.Description,
		OwnerId:     req.OwnerID,
	})
	if err != nil {
		http.Error(w, "Failed to create project: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Add the owner as a collaborator with "owner" role in the collaboration service
	// First, get the user's email from identity service
	fmt.Printf("DEBUG: Adding owner %s as collaborator for project %s\n", req.OwnerID, resp.Project.Id)
	userResp, err := h.identityClient.GetUser(context.Background(), &identity.GetUserRequest{
		UserId: req.OwnerID,
	})
	if err != nil {
		// Log error but don't fail the project creation
		fmt.Printf("ERROR: Failed to get user email from identity service: %v\n", err)
		// The project is created but collaboration features might not work until manually added
	} else {
		fmt.Printf("DEBUG: Got user email: %s for user %s\n", userResp.User.Email, req.OwnerID)
		// Add user as owner collaborator using direct method (bypasses invitation system)
		_, err = h.collabClient.AddCollaboratorDirect(context.Background(), &collab.AddCollaboratorDirectRequest{
			ProjectId: resp.Project.Id,
			UserId:    req.OwnerID,
			InviterId: req.OwnerID,
			Role:      "owner",
		})
		if err != nil {
			// Log error but don't fail the project creation
			fmt.Printf("ERROR: Failed to add owner as collaborator: %v\n", err)
			// The project is created but collaboration features might not work until manually added
		} else {
			fmt.Printf("DEBUG: Successfully added owner as collaborator\n")
		}
	}

	// Convert response
	project := convertProjectFromProto(resp.Project)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"project": project,
	})
}

// GetProject retrieves a project by ID
func (h *ScriptsHandler) GetProject(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract project ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/projects/")
	projectID := path

	if projectID == "" {
		http.Error(w, "Project ID is required", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call Scripts service
	resp, err := h.scriptsClient.GetProject(context.Background(), &scriptspb.GetProjectRequest{
		ProjectId: projectID,
		UserId:    userID,
	})
	if err != nil {
		http.Error(w, "Failed to get project: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Convert response
	project := convertProjectFromProto(resp.Project)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"project": project,
	})
}

// DeleteProject deletes a project
func (h *ScriptsHandler) DeleteProject(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract project ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/projects/")
	parts := strings.Split(path, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.Error(w, "Project ID is required", http.StatusBadRequest)
		return
	}
	projectID := parts[0]

	// Get user ID from context
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call Scripts service
	resp, err := h.scriptsClient.DeleteProject(context.Background(), &scriptspb.DeleteProjectRequest{
		ProjectId: projectID,
		UserId:    userID,
	})
	if err != nil {
		http.Error(w, "Failed to delete project: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": resp.Success,
	})
}

// ToggleProjectStar toggles the starred status of a project
func (h *ScriptsHandler) ToggleProjectStar(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract project ID from URL
	path := strings.TrimPrefix(r.URL.Path, "/projects/")
	parts := strings.Split(path, "/")
	if len(parts) < 2 {
		http.Error(w, "Project ID is required", http.StatusBadRequest)
		return
	}
	projectID := parts[0]

	// Get user ID from context
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call Scripts service
	resp, err := h.scriptsClient.ToggleProjectStar(context.Background(), &scriptspb.ToggleProjectStarRequest{
		ProjectId: projectID,
		UserId:    userID,
	})
	if err != nil {
		http.Error(w, "Failed to toggle star: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Convert response
	project := convertProjectFromProto(resp.Project)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"project": project,
	})
}

// GetUserProjects retrieves all projects for a user
func (h *ScriptsHandler) GetUserProjects(w http.ResponseWriter, r *http.Request) {
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

	// Parse pagination parameters
	pageStr := r.URL.Query().Get("page")
	limitStr := r.URL.Query().Get("limit")

	page := int32(1)
	limit := int32(20) // default limit

	if pageStr != "" {
		if parsedPage, err := strconv.ParseInt(pageStr, 10, 32); err == nil && parsedPage > 0 {
			page = int32(parsedPage)
		}
	}

	if limitStr != "" {
		if parsedLimit, err := strconv.ParseInt(limitStr, 10, 32); err == nil && parsedLimit > 0 {
			limit = int32(parsedLimit)
		}
	}

	// Call Scripts service
	resp, err := h.scriptsClient.GetUserProjects(context.Background(), &scriptspb.GetUserProjectsRequest{
		UserId: userID,
		Pagination: &common.PaginationRequest{
			Page:  page,
			Limit: limit,
		},
	})
	if err != nil {
		http.Error(w, "Failed to get projects: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Convert response
	projects := make([]map[string]interface{}, len(resp.Projects))
	for i, project := range resp.Projects {
		projects[i] = convertProjectFromProto(project)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"projects":   projects,
		"pagination": convertPaginationFromProto(resp.Pagination),
	})
}

// CreateScene handles scene creation requests
func (h *ScriptsHandler) CreateScene(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProjectID     string `json:"project_id"`
		UserID        string `json:"user_id"`
		OutlineUnitID string `json:"outline_unit_id,omitempty"`
		SceneHeading  string `json:"scene_heading"`
		Content       string `json:"content"`
		OrderIndex    int32  `json:"order_index"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid JSON"}`, http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.ProjectID == "" || req.UserID == "" {
		http.Error(w, `{"error":"project_id and user_id are required"}`, http.StatusBadRequest)
		return
	}

	// Call Scripts service
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	response, err := h.scriptsClient.CreateScene(ctx, &scriptspb.CreateSceneRequest{
		ProjectId:     req.ProjectID,
		UserId:        req.UserID,
		OutlineUnitId: &req.OutlineUnitID,
		SceneHeading:  req.SceneHeading,
		Content:       req.Content,
		OrderIndex:    req.OrderIndex,
	})

	if err != nil {
		http.Error(w, `{"error":"Failed to create scene"}`, http.StatusInternalServerError)
		return
	}

	// Convert response
	scene := convertSceneFromProto(response.Scene)
	result := map[string]interface{}{
		"scene": scene,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GetProjectScenes handles getting all scenes for a project
func (h *ScriptsHandler) GetProjectScenes(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("project_id")
	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)

	if projectID == "" {
		http.Error(w, `{"error":"project_id is required"}`, http.StatusBadRequest)
		return
	}
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	response, err := h.scriptsClient.GetProjectScenes(ctx, &scriptspb.GetProjectScenesRequest{
		ProjectId: projectID,
		UserId:    userID,
	})

	if err != nil {
		http.Error(w, `{"error":"Failed to get scenes"}`, http.StatusInternalServerError)
		return
	}

	scenes := make([]map[string]interface{}, len(response.Scenes))
	for i, scene := range response.Scenes {
		scenes[i] = convertSceneFromProto(scene)
	}

	result := map[string]interface{}{
		"scenes": scenes,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// UpdateScene handles scene update requests
func (h *ScriptsHandler) UpdateScene(w http.ResponseWriter, r *http.Request) {
	// Extract scene ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/scenes/")
	sceneID := path

	if sceneID == "" {
		http.Error(w, `{"error":"Scene ID is required"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		UserID        string  `json:"user_id"`
		SceneHeading  *string `json:"scene_heading,omitempty"`
		Content       *string `json:"content,omitempty"`
		OrderIndex    *int32  `json:"order_index,omitempty"`
		OutlineUnitID *string `json:"outline_unit_id,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid JSON"}`, http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.UserID == "" {
		http.Error(w, `{"error":"user_id is required"}`, http.StatusBadRequest)
		return
	}

	// Call Scripts service
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	response, err := h.scriptsClient.UpdateScene(ctx, &scriptspb.UpdateSceneRequest{
		SceneId:      sceneID,
		UserId:       req.UserID,
		SceneHeading: req.SceneHeading,
		Content:      req.Content,
		OrderIndex:   req.OrderIndex,
	})

	if err != nil {
		http.Error(w, `{"error":"Failed to update scene"}`, http.StatusInternalServerError)
		return
	}

	// Convert response
	scene := convertSceneFromProto(response.Scene)
	result := map[string]interface{}{
		"scene": scene,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// CreateElement handles script element creation requests
func (h *ScriptsHandler) CreateElement(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProjectID   string            `json:"project_id"`
		UserID      string            `json:"user_id"`
		SceneID     string            `json:"scene_id"`
		ElementType string            `json:"element_type"`
		Content     string            `json:"content"`
		CharacterID string            `json:"character_id,omitempty"`
		LineNumber  int32             `json:"line_number"`
		Formatting  map[string]string `json:"formatting"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid JSON"}`, http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.ProjectID == "" || req.UserID == "" || req.ElementType == "" || req.SceneID == "" {
		http.Error(w, `{"error":"project_id, user_id, scene_id, and element_type are required"}`, http.StatusBadRequest)
		return
	}

	// Call Scripts service
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	response, err := h.scriptsClient.CreateElement(ctx, &scriptspb.CreateElementRequest{
		ProjectId:   req.ProjectID,
		UserId:      req.UserID,
		SceneId:     req.SceneID,
		ElementType: req.ElementType,
		Content:     req.Content,
		CharacterId: &req.CharacterID,
		LineNumber:  req.LineNumber,
		Formatting:  req.Formatting,
	})

	if err != nil {
		http.Error(w, `{"error":"Failed to create element"}`, http.StatusInternalServerError)
		return
	}

	// Convert response
	element := convertElementFromProto(response.Element)
	result := map[string]interface{}{
		"element": element,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// UpdateElement handles script element update requests
func (h *ScriptsHandler) UpdateElement(w http.ResponseWriter, r *http.Request) {
	// Extract element ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/elements/")
	elementID := path

	if elementID == "" {
		http.Error(w, `{"error":"Element ID is required"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		UserID  string `json:"user_id"`
		Content string `json:"content"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid JSON"}`, http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.UserID == "" {
		http.Error(w, `{"error":"user_id is required"}`, http.StatusBadRequest)
		return
	}

	// Call Scripts service
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	response, err := h.scriptsClient.UpdateElement(ctx, &scriptspb.UpdateElementRequest{
		ElementId: elementID,
		UserId:    req.UserID,
		Content:   req.Content,
	})

	if err != nil {
		http.Error(w, `{"error":"Failed to update element"}`, http.StatusInternalServerError)
		return
	}

	// Convert response
	element := convertElementFromProto(response.Element)
	result := map[string]interface{}{
		"element": element,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// DeleteElement handles script element deletion requests
func (h *ScriptsHandler) DeleteElement(w http.ResponseWriter, r *http.Request) {
	// Extract element ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/elements/")
	elementID := path

	if elementID == "" {
		http.Error(w, `{"error":"Element ID is required"}`, http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Call Scripts service
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err := h.scriptsClient.DeleteScriptElement(ctx, &scriptspb.DeleteScriptElementRequest{
		ScriptElementId: elementID,
		UserId:          userID,
	})

	if err != nil {
		http.Error(w, `{"error":"Failed to delete element"}`, http.StatusInternalServerError)
		return
	}

	// Return success response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Element deleted successfully"})
}

// GetSceneElements handles getting all elements for a scene
func (h *ScriptsHandler) GetSceneElements(w http.ResponseWriter, r *http.Request) {
	sceneID := r.URL.Query().Get("scene_id")
	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)

	if sceneID == "" {
		http.Error(w, `{"error":"scene_id is required"}`, http.StatusBadRequest)
		return
	}
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	response, err := h.scriptsClient.GetSceneElements(ctx, &scriptspb.GetSceneElementsRequest{
		SceneId: sceneID,
		UserId:  userID,
	})

	if err != nil {
		http.Error(w, `{"error":"Failed to get elements"}`, http.StatusInternalServerError)
		return
	}

	elements := make([]map[string]interface{}, len(response.Elements))
	for i, element := range response.Elements {
		elements[i] = convertElementFromProto(element)
	}

	result := map[string]interface{}{
		"elements": elements,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// Helper function to convert protobuf Project to JSON-friendly map
func convertProjectFromProto(project *scriptspb.Project) map[string]interface{} {
	result := map[string]interface{}{
		"id":          project.Id,
		"title":       project.Title,
		"description": project.Description,
		"owner_id":    project.OwnerId,
		"status":      project.Status,
		"is_starred":  project.IsStarred,
	}

	if project.CreatedAt != nil {
		result["created_at"] = time.Unix(project.CreatedAt.Seconds, int64(project.CreatedAt.Nanos)).Format(time.RFC3339)
	}

	if project.UpdatedAt != nil {
		result["updated_at"] = time.Unix(project.UpdatedAt.Seconds, int64(project.UpdatedAt.Nanos)).Format(time.RFC3339)
	}

	return result
}

// Helper function to convert protobuf Scene to JSON-friendly map
func convertSceneFromProto(scene *scriptspb.Scene) map[string]interface{} {
	result := map[string]interface{}{
		"id":            scene.Id,
		"project_id":    scene.ProjectId,
		"scene_heading": scene.SceneHeading,
		"content":       scene.Content,
		"order_index":   scene.OrderIndex,
	}

	if scene.OutlineUnitId != "" {
		result["outline_unit_id"] = scene.OutlineUnitId
	}

	if scene.CreatedAt != nil {
		result["created_at"] = time.Unix(scene.CreatedAt.Seconds, int64(scene.CreatedAt.Nanos)).Format(time.RFC3339)
	}

	if scene.UpdatedAt != nil {
		result["updated_at"] = time.Unix(scene.UpdatedAt.Seconds, int64(scene.UpdatedAt.Nanos)).Format(time.RFC3339)
	}

	return result
}

// Helper function to convert protobuf Pagination to JSON-friendly map
func convertPaginationFromProto(pagination *common.PaginationResponse) map[string]interface{} {
	if pagination == nil {
		return map[string]interface{}{
			"current_page":   1,
			"total_pages":    1,
			"total_items":    0,
			"items_per_page": 20,
		}
	}

	return map[string]interface{}{
		"current_page":   pagination.CurrentPage,
		"total_pages":    pagination.TotalPages,
		"total_items":    pagination.TotalItems,
		"items_per_page": pagination.ItemsPerPage,
	}
}

// Helper function to convert protobuf ScriptElement to JSON-friendly map
func convertElementFromProto(element *scriptspb.ScriptElement) map[string]interface{} {
	result := map[string]interface{}{
		"id":           element.Id,
		"project_id":   element.ProjectId,
		"scene_id":     element.SceneId,
		"element_type": element.Type,
		"content":      element.Content,
		"character_id": element.CharacterId,
		"line_number":  element.LineNumber,
		"formatting":   element.Formatting,
	}

	if element.CreatedAt != nil {
		result["created_at"] = time.Unix(element.CreatedAt.Seconds, int64(element.CreatedAt.Nanos)).Format(time.RFC3339)
	}

	if element.UpdatedAt != nil {
		result["updated_at"] = time.Unix(element.UpdatedAt.Seconds, int64(element.UpdatedAt.Nanos)).Format(time.RFC3339)
	}

	return result
}
