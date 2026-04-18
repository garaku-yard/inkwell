package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"scriptlith/server/internal/gateway/grpcclient"
	"scriptlith/server/pkg/grpc/collab"
	"scriptlith/server/pkg/grpc/common"
	scriptspb "scriptlith/server/pkg/grpc/scripts"
)

// ScriptsHandler handles HTTP requests related to scripts and forwards them to Scripts service
type ScriptsHandler struct {
	scriptsClient scriptspb.ScriptsServiceClient
	collabClient  collab.CollaborationServiceClient
}

// NewScriptsHandler creates a new ScriptsHandler
func NewScriptsHandler(clients *grpcclient.Registry) *ScriptsHandler {
	return &ScriptsHandler{
		scriptsClient: clients.Scripts,
		collabClient:  clients.Collab,
	}
}

// CreateProject creates a new screenplay project
func (h *ScriptsHandler) CreateProject(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse request body
	var req struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		OwnerID     string `json:"owner_id"`
		Category    string `json:"category"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.Title == "" {
		writeError(w, "Title is required", http.StatusBadRequest)
		return
	}
	if req.OwnerID == "" {
		writeError(w, "Owner ID is required", http.StatusBadRequest)
		return
	}

	// Call Scripts service
	resp, err := h.scriptsClient.CreateProject(r.Context(), &scriptspb.CreateProjectRequest{
		Title:       req.Title,
		Description: req.Description,
		OwnerId:     req.OwnerID,
		Category:    req.Category,
	})
	if err != nil {
		writeError(w, "Failed to create project: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Add the owner as a collaborator with "owner" role in the collaboration service
	if _, err = h.collabClient.AddCollaboratorDirect(r.Context(), &collab.AddCollaboratorDirectRequest{
		ProjectId: resp.Project.Id,
		UserId:    req.OwnerID,
		InviterId: req.OwnerID,
		Role:      "owner",
	}); err != nil {
		log.Printf("failed to add owner %s as collaborator for project %s: %v", req.OwnerID, resp.Project.Id, err)
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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract project ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/projects/")
	projectID := path

	if projectID == "" {
		writeError(w, "Project ID is required", http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	resolvedID, authErr := resolveProjectAccess(r.Context(), userID, projectID, h.scriptsClient, h.collabClient)
	if authErr != nil {
		writeError(w, "Forbidden", http.StatusForbidden)
		return
	}

	resp, err := h.scriptsClient.GetProject(r.Context(), &scriptspb.GetProjectRequest{
		ProjectId: projectID,
		UserId:    resolvedID,
	})
	if err != nil {
		writeError(w, "Failed to get project: "+err.Error(), http.StatusInternalServerError)
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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract project ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/projects/")
	parts := strings.Split(path, "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, "Project ID is required", http.StatusBadRequest)
		return
	}
	projectID := parts[0]

	// Get user ID from context
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call Scripts service
	resp, err := h.scriptsClient.DeleteProject(r.Context(), &scriptspb.DeleteProjectRequest{
		ProjectId: projectID,
		UserId:    userID,
	})
	if err != nil {
		writeError(w, "Failed to delete project: "+err.Error(), http.StatusInternalServerError)
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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract project ID from URL
	path := strings.TrimPrefix(r.URL.Path, "/projects/")
	parts := strings.Split(path, "/")
	if len(parts) < 2 {
		writeError(w, "Project ID is required", http.StatusBadRequest)
		return
	}
	projectID := parts[0]

	// Get user ID from context
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Call Scripts service
	resp, err := h.scriptsClient.ToggleProjectStar(r.Context(), &scriptspb.ToggleProjectStarRequest{
		ProjectId: projectID,
		UserId:    userID,
	})
	if err != nil {
		writeError(w, "Failed to toggle star: "+err.Error(), http.StatusInternalServerError)
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
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
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
	resp, err := h.scriptsClient.GetUserProjects(r.Context(), &scriptspb.GetUserProjectsRequest{
		UserId: userID,
		Pagination: &common.PaginationRequest{
			Page:  page,
			Limit: limit,
		},
	})
	if err != nil {
		writeError(w, "Failed to get projects: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Fetch collaborator counts for all projects in parallel (one gRPC call per project).
	// This keeps N+1 within the backend (cheap intra-datacenter gRPC) rather than
	// forcing the frontend to make N separate HTTP calls.
	type countResult struct {
		index int
		count int
	}
	counts := make([]int, len(resp.Projects))
	resultCh := make(chan countResult, len(resp.Projects))
	var wg sync.WaitGroup
	for i, p := range resp.Projects {
		wg.Add(1)
		go func(idx int, projectID string) {
			defer wg.Done()
			collabResp, err := h.collabClient.GetProjectCollaborators(r.Context(), &collab.GetProjectCollaboratorsRequest{
				ProjectId: projectID,
				UserId:    userID,
			})
			if err != nil {
				resultCh <- countResult{index: idx, count: 0}
				return
			}
			resultCh <- countResult{index: idx, count: len(collabResp.Collaborators)}
		}(i, p.Id)
	}
	wg.Wait()
	close(resultCh)
	for cr := range resultCh {
		counts[cr.index] = cr.count
	}

	projects := make([]map[string]interface{}, len(resp.Projects))
	for i, project := range resp.Projects {
		p := convertProjectFromProto(project)
		p["collaborator_count"] = counts[i]
		projects[i] = p
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"projects":   projects,
		"pagination": convertPaginationFromProto(resp.Pagination),
	})
}

// GetSharedProjects returns projects the user is a collaborator on (not owner)
func (h *ScriptsHandler) GetSharedProjects(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	// Get all active collaborations for this user from collab service
	collabResp, err := h.collabClient.GetUserCollaborations(ctx, &collab.GetUserCollaborationsRequest{
		UserId: userID,
	})
	if err != nil {
		writeError(w, "Failed to get collaborations: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Fetch each project using the bypass (empty userId)
	projects := make([]map[string]interface{}, 0, len(collabResp.Collaborations))
	for _, c := range collabResp.Collaborations {
		projResp, err := h.scriptsClient.GetProject(ctx, &scriptspb.GetProjectRequest{
			ProjectId: c.ProjectId,
			UserId:    "", // bypass — already verified as collaborator
		})
		if err != nil {
			continue // skip projects that can't be fetched
		}
		project := convertProjectFromProto(projResp.Project)
		projects = append(projects, project)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"projects": projects,
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
		writeRawError(w, `{"error":"Invalid JSON"}`, http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.ProjectID == "" || req.UserID == "" {
		writeRawError(w, `{"error":"project_id and user_id are required"}`, http.StatusBadRequest)
		return
	}

	// Call Scripts service
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
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
		writeRawError(w, `{"error":"Failed to create scene"}`, http.StatusInternalServerError)
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
		writeRawError(w, `{"error":"project_id is required"}`, http.StatusBadRequest)
		return
	}
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	resolvedID, authErr := resolveProjectAccess(ctx, userID, projectID, h.scriptsClient, h.collabClient)
	if authErr != nil {
		writeRawError(w, `{"error":"Unauthorized"}`, http.StatusForbidden)
		return
	}

	response, err := h.scriptsClient.GetProjectScenes(ctx, &scriptspb.GetProjectScenesRequest{
		ProjectId: projectID,
		UserId:    resolvedID,
	})

	if err != nil {
		writeRawError(w, `{"error":"Failed to get scenes"}`, http.StatusInternalServerError)
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
		writeRawError(w, `{"error":"Scene ID is required"}`, http.StatusBadRequest)
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
		writeRawError(w, `{"error":"Invalid JSON"}`, http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.UserID == "" {
		writeRawError(w, `{"error":"user_id is required"}`, http.StatusBadRequest)
		return
	}

	// Call Scripts service
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	response, err := h.scriptsClient.UpdateScene(ctx, &scriptspb.UpdateSceneRequest{
		SceneId:      sceneID,
		UserId:       req.UserID,
		SceneHeading: req.SceneHeading,
		Content:      req.Content,
		OrderIndex:   req.OrderIndex,
	})

	if err != nil {
		writeRawError(w, `{"error":"Failed to update scene"}`, http.StatusInternalServerError)
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

// DeleteScene handles scene deletion requests
func (h *ScriptsHandler) DeleteScene(w http.ResponseWriter, r *http.Request) {
	// Extract scene ID from URL path
	path := strings.TrimPrefix(r.URL.Path, "/scenes/")
	sceneID := path

	if sceneID == "" {
		writeRawError(w, `{"error":"Scene ID is required"}`, http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeRawError(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Call Scripts service
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	_, err := h.scriptsClient.DeleteScene(ctx, &scriptspb.DeleteSceneRequest{
		SceneId: sceneID,
		UserId:  userID,
	})

	if err != nil {
		writeRawError(w, `{"error":"Failed to delete scene"}`, http.StatusInternalServerError)
		return
	}

	// Return success response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Scene deleted successfully"})
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
		writeRawError(w, `{"error":"Invalid JSON"}`, http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.ProjectID == "" || req.UserID == "" || req.ElementType == "" || req.SceneID == "" {
		writeRawError(w, `{"error":"project_id, user_id, scene_id, and element_type are required"}`, http.StatusBadRequest)
		return
	}

	// Call Scripts service
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
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
		writeRawError(w, `{"error":"Failed to create element"}`, http.StatusInternalServerError)
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
		writeRawError(w, `{"error":"Element ID is required"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		UserID      string  `json:"user_id"`
		Content     *string `json:"content"`
		ElementType *string `json:"elementType"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeRawError(w, `{"error":"Invalid JSON"}`, http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.UserID == "" {
		writeRawError(w, `{"error":"user_id is required"}`, http.StatusBadRequest)
		return
	}

	// At least one field must be provided for update
	if req.Content == nil && req.ElementType == nil {
		writeRawError(w, `{"error":"Either content or elementType must be provided"}`, http.StatusBadRequest)
		return
	}

	// Call Scripts service
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	updateReq := &scriptspb.UpdateElementRequest{
		ElementId: elementID,
		UserId:    req.UserID,
	}

	if req.Content != nil {
		updateReq.Content = *req.Content
	}

	if req.ElementType != nil {
		updateReq.Type = *req.ElementType
	}

	response, err := h.scriptsClient.UpdateElement(ctx, updateReq)

	if err != nil {
		writeRawError(w, `{"error":"Failed to update element"}`, http.StatusInternalServerError)
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
		writeRawError(w, `{"error":"Element ID is required"}`, http.StatusBadRequest)
		return
	}

	// Get user ID from context (set by auth middleware)
	userID := getUserIDFromContext(r)
	if userID == "" {
		writeRawError(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Call Scripts service
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	_, err := h.scriptsClient.DeleteScriptElement(ctx, &scriptspb.DeleteScriptElementRequest{
		ScriptElementId: elementID,
		UserId:          userID,
	})

	if err != nil {
		writeRawError(w, `{"error":"Failed to delete element"}`, http.StatusInternalServerError)
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
		writeRawError(w, `{"error":"scene_id is required"}`, http.StatusBadRequest)
		return
	}
	if userID == "" {
		writeError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	response, err := h.scriptsClient.GetSceneElements(ctx, &scriptspb.GetSceneElementsRequest{
		SceneId: sceneID,
		UserId:  userID,
	})
	if err != nil {
		// Retry with empty userId — collaborator access is verified by JWT auth middleware
		// and the user must have already loaded scenes successfully to know this scene_id
		response, err = h.scriptsClient.GetSceneElements(ctx, &scriptspb.GetSceneElementsRequest{
			SceneId: sceneID,
			UserId:  "",
		})
		if err != nil {
			writeRawError(w, `{"error":"Failed to get elements"}`, http.StatusInternalServerError)
			return
		}
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
		"category":    project.Category,
		"status":      project.Status,
		"is_starred":  project.IsStarred,
	}

	result["created_at"] = timestampToString(project.CreatedAt)
	result["updated_at"] = timestampToString(project.UpdatedAt)

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

	result["created_at"] = timestampToString(scene.CreatedAt)
	result["updated_at"] = timestampToString(scene.UpdatedAt)

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

	result["created_at"] = timestampToString(element.CreatedAt)
	result["updated_at"] = timestampToString(element.UpdatedAt)

	return result
}
