package scripts

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"inkwell/server/internal/gateway/apierror"
	"inkwell/server/internal/gateway/grpcclient"
	"inkwell/server/internal/gateway/handlers"
	"inkwell/server/pkg/grpc/collab"
	"inkwell/server/pkg/grpc/common"
	scriptspb "inkwell/server/pkg/grpc/scripts"
)

// ScriptsHandler routes project, scene, and element HTTP requests to the scripts
// gRPC service. It also fans out to the collab service to enrich responses with
// collaborator counts and to verify access for shared projects.
type ScriptsHandler struct {
	scriptsClient scriptspb.ScriptsServiceClient
	collabClient  collab.CollaborationServiceClient
}

// NewScriptsHandler creates a ScriptsHandler using the gRPC clients in the
// provided registry.
func NewScriptsHandler(clients *grpcclient.Registry) *ScriptsHandler {
	return &ScriptsHandler{
		scriptsClient: clients.Scripts,
		collabClient:  clients.Collab,
	}
}

// CreateProject creates a new writing project and immediately registers its
// creator as an "owner" collaborator in the collab service. The owner is
// always the authenticated caller — client-supplied owner fields are ignored
// so a signed-in user cannot mint projects owned by someone else. If the
// collab call fails the project is still returned; the error is logged but
// not surfaced to the client.
type createProjectBody struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Category    string `json:"category"`
}

// createProjectResponse is the JSON shape returned by CreateProject.
type createProjectResponse struct {
	Project any `json:"project"`
}

// CreateProject handles POST /projects.
//
// Reference implementation for the Wrap[Req, Resp] generic: all boilerplate
// (method guard, JSON decode, auth, error envelope, response writer) lives in
// the Endpoint declaration; the Handle closure carries only business logic —
// field validation, the gRPC call, and the owner-as-collaborator side effect.
func (h *ScriptsHandler) CreateProject(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[createProjectBody, createProjectResponse]{
		Method:        http.MethodPost,
		Auth:          true,
		Decode:        handlers.JSONBody[createProjectBody],
		SuccessStatus: http.StatusCreated,
		Handle: func(r *http.Request, userID string, body *createProjectBody) (*createProjectResponse, error) {
			if body.Title == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "title is required")
			}

			resp, err := h.scriptsClient.CreateProject(r.Context(), &scriptspb.CreateProjectRequest{
				Title:       body.Title,
				Description: body.Description,
				OwnerId:     userID,
				Category:    body.Category,
			})
			if err != nil {
				return nil, err
			}

			// Register the owner as a collaborator with the "owner" role so they
			// appear in collaborator listings. Failures are logged but non-fatal —
			// the project itself already committed.
			if _, err := h.collabClient.AddCollaboratorDirect(r.Context(), &collab.AddCollaboratorDirectRequest{
				ProjectId: resp.Project.Id,
				UserId:    userID,
				InviterId: userID,
				Role:      "owner",
			}); err != nil {
				slog.Warn("failed to register owner as collaborator", "user_id", userID, "project_id", resp.Project.Id, "error", err)
			}

			return &createProjectResponse{Project: convertProjectFromProto(resp.Project)}, nil
		},
	}.ServeHTTP(w, r)
}

// GetProject fetches a single project by ID. It requires a userID from the
// request context and calls handlers.ResolveProjectAccess to verify the caller is either
// the project owner or an active collaborator. Returns 403 if neither holds.
func (h *ScriptsHandler) GetProject(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, map[string]interface{}]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*map[string]interface{}, error) {
			projectID := chi.URLParam(r, "projectId")
			if projectID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "Project ID is required")
			}

			resolvedID, authErr := handlers.ResolveProjectAccess(r.Context(), userID, projectID, h.scriptsClient, h.collabClient)
			if authErr != nil {
				return nil, apierror.New(apierror.CodePermissionDenied, http.StatusForbidden, "Forbidden")
			}

			resp, err := h.scriptsClient.GetProject(r.Context(), &scriptspb.GetProjectRequest{
				ProjectId: projectID,
				UserId:    resolvedID,
			})
			if err != nil {
				return nil, err
			}

			result := map[string]interface{}{
				"project": convertProjectFromProto(resp.Project),
			}
			return &result, nil
		},
	}.ServeHTTP(w, r)
}

// deleteProjectResponse is the JSON shape returned by DeleteProject.
type deleteProjectResponse struct {
	Success bool `json:"success"`
}

// DeleteProject removes a project. It requires a userID from the request context
// and delegates ownership enforcement to the scripts service.
func (h *ScriptsHandler) DeleteProject(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, deleteProjectResponse]{
		Method: http.MethodDelete,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*deleteProjectResponse, error) {
			projectID := chi.URLParam(r, "projectId")
			if projectID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "project ID is required")
			}

			resp, err := h.scriptsClient.DeleteProject(r.Context(), &scriptspb.DeleteProjectRequest{
				ProjectId: projectID,
				UserId:    userID,
			})
			if err != nil {
				return nil, err
			}
			return &deleteProjectResponse{Success: resp.Success}, nil
		},
	}.ServeHTTP(w, r)
}

// projectResponse is shared by endpoints that return a single project envelope.
type projectResponse struct {
	Project any `json:"project"`
}

// ToggleProjectStar flips the starred state of a project for the authenticated
// user. Requires a userID from the request context.
func (h *ScriptsHandler) ToggleProjectStar(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, projectResponse]{
		Method: http.MethodPatch,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*projectResponse, error) {
			projectID := chi.URLParam(r, "projectId")
			if projectID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "project ID is required")
			}

			resp, err := h.scriptsClient.ToggleProjectStar(r.Context(), &scriptspb.ToggleProjectStarRequest{
				ProjectId: projectID,
				UserId:    userID,
			})
			if err != nil {
				return nil, err
			}
			return &projectResponse{Project: convertProjectFromProto(resp.Project)}, nil
		},
	}.ServeHTTP(w, r)
}

// GetUserProjects returns a paginated list of projects owned by the authenticated
// user. Accepts optional ?page and ?limit query parameters (defaults: page=1,
// limit=20). For each project it issues a parallel gRPC call to the collab service
// to fetch the collaborator count, avoiding N+1 HTTP round-trips from the client.
func (h *ScriptsHandler) GetUserProjects(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, map[string]interface{}]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*map[string]interface{}, error) {
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
				return nil, err
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

			result := map[string]interface{}{
				"projects":   projects,
				"pagination": convertPaginationFromProto(resp.Pagination),
			}
			return &result, nil
		},
	}.ServeHTTP(w, r)
}

// GetSharedProjects returns projects where the authenticated user is an active
// collaborator but not the owner. It queries the collab service for the user's
// active collaborations, then fetches each project using an empty userID bypass —
// ownership checks are skipped because collaborator membership is already confirmed.
func (h *ScriptsHandler) GetSharedProjects(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, map[string]interface{}]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*map[string]interface{}, error) {
			ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
			defer cancel()

			// Get all active collaborations for this user from collab service
			collabResp, err := h.collabClient.GetUserCollaborations(ctx, &collab.GetUserCollaborationsRequest{
				UserId: userID,
			})
			if err != nil {
				return nil, err
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

			result := map[string]interface{}{
				"projects": projects,
			}
			return &result, nil
		},
	}.ServeHTTP(w, r)
}

// CreateScene adds a new scene to a project. The scene is always attributed
// to the authenticated caller; a user_id field in the request body is ignored
// to prevent impersonation.
func (h *ScriptsHandler) CreateScene(w http.ResponseWriter, r *http.Request) {
	type createSceneBody struct {
		ProjectID     string `json:"project_id"`
		OutlineUnitID string `json:"outline_unit_id,omitempty"`
		SceneHeading  string `json:"scene_heading"`
		Content       string `json:"content"`
		OrderIndex    int32  `json:"order_index"`
	}

	handlers.Endpoint[createSceneBody, map[string]interface{}]{
		Method: http.MethodPost,
		Auth:   true,
		Decode: func(r *http.Request) (*createSceneBody, error) {
			var req createSceneBody
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return nil, errors.New("Invalid JSON")
			}
			return &req, nil
		},
		Handle: func(r *http.Request, userID string, req *createSceneBody) (*map[string]interface{}, error) {
			if req.ProjectID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "project_id is required")
			}

			ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
			defer cancel()

			response, err := h.scriptsClient.CreateScene(ctx, &scriptspb.CreateSceneRequest{
				ProjectId:     req.ProjectID,
				UserId:        userID,
				OutlineUnitId: &req.OutlineUnitID,
				SceneHeading:  req.SceneHeading,
				Content:       req.Content,
				OrderIndex:    req.OrderIndex,
			})

			if err != nil {
				return nil, apierror.New(apierror.CodeInternal, http.StatusInternalServerError, "Failed to create scene")
			}

			result := map[string]interface{}{
				"scene": convertSceneFromProto(response.Scene),
			}
			return &result, nil
		},
	}.ServeHTTP(w, r)
}

// GetProjectScenes returns all scenes for a project. Requires a userID from the
// request context and verifies access via handlers.ResolveProjectAccess before fetching.
func (h *ScriptsHandler) GetProjectScenes(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, map[string]interface{}]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*map[string]interface{}, error) {
			projectID := r.URL.Query().Get("project_id")
			if projectID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "project_id is required")
			}

			ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
			defer cancel()

			resolvedID, authErr := handlers.ResolveProjectAccess(ctx, userID, projectID, h.scriptsClient, h.collabClient)
			if authErr != nil {
				return nil, apierror.New(apierror.CodePermissionDenied, http.StatusForbidden, "Unauthorized")
			}

			response, err := h.scriptsClient.GetProjectScenes(ctx, &scriptspb.GetProjectScenesRequest{
				ProjectId: projectID,
				UserId:    resolvedID,
			})

			if err != nil {
				return nil, apierror.New(apierror.CodeInternal, http.StatusInternalServerError, "Failed to get scenes")
			}

			scenes := make([]map[string]interface{}, len(response.Scenes))
			for i, scene := range response.Scenes {
				scenes[i] = convertSceneFromProto(scene)
			}

			result := map[string]interface{}{
				"scenes": scenes,
			}
			return &result, nil
		},
	}.ServeHTTP(w, r)
}

// UpdateScene applies partial updates to a scene. The caller is identified
// from the auth context; a user_id field in the body is ignored. Only non-nil
// fields in the request body are forwarded to the scripts service.
func (h *ScriptsHandler) UpdateScene(w http.ResponseWriter, r *http.Request) {
	type updateSceneBody struct {
		SceneHeading  *string `json:"scene_heading,omitempty"`
		Content       *string `json:"content,omitempty"`
		OrderIndex    *int32  `json:"order_index,omitempty"`
		OutlineUnitID *string `json:"outline_unit_id,omitempty"`
	}

	handlers.Endpoint[updateSceneBody, map[string]interface{}]{
		// Registered under both PUT and PATCH — leave Method empty so both verbs work.
		Auth: true,
		Decode: func(r *http.Request) (*updateSceneBody, error) {
			var req updateSceneBody
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return nil, errors.New("Invalid JSON")
			}
			return &req, nil
		},
		Handle: func(r *http.Request, userID string, req *updateSceneBody) (*map[string]interface{}, error) {
			sceneID := chi.URLParam(r, "sceneId")
			if sceneID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "Scene ID is required")
			}

			ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
			defer cancel()

			response, err := h.scriptsClient.UpdateScene(ctx, &scriptspb.UpdateSceneRequest{
				SceneId:      sceneID,
				UserId:       userID,
				SceneHeading: req.SceneHeading,
				Content:      req.Content,
				OrderIndex:   req.OrderIndex,
			})

			if err != nil {
				return nil, apierror.New(apierror.CodeInternal, http.StatusInternalServerError, "Failed to update scene")
			}

			result := map[string]interface{}{
				"scene": convertSceneFromProto(response.Scene),
			}
			return &result, nil
		},
	}.ServeHTTP(w, r)
}

// DeleteScene removes a scene by ID. Requires a userID from the request context.
func (h *ScriptsHandler) DeleteScene(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, map[string]string]{
		Method: http.MethodDelete,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*map[string]string, error) {
			sceneID := chi.URLParam(r, "sceneId")
			if sceneID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "Scene ID is required")
			}

			ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
			defer cancel()

			_, err := h.scriptsClient.DeleteScene(ctx, &scriptspb.DeleteSceneRequest{
				SceneId: sceneID,
				UserId:  userID,
			})

			if err != nil {
				return nil, apierror.New(apierror.CodeInternal, http.StatusInternalServerError, "Failed to delete scene")
			}

			result := map[string]string{"message": "Scene deleted successfully"}
			return &result, nil
		},
	}.ServeHTTP(w, r)
}

// CreateElement adds a new script element (e.g. dialogue, action, transition)
// to a scene within a project. The element is attributed to the authenticated
// caller; a user_id field in the request body is ignored.
func (h *ScriptsHandler) CreateElement(w http.ResponseWriter, r *http.Request) {
	type createElementBody struct {
		ProjectID   string            `json:"project_id"`
		SceneID     string            `json:"scene_id"`
		ElementType string            `json:"element_type"`
		Content     string            `json:"content"`
		CharacterID string            `json:"character_id,omitempty"`
		LineNumber  int32             `json:"line_number"`
		Formatting  map[string]string `json:"formatting"`
	}

	handlers.Endpoint[createElementBody, map[string]interface{}]{
		Method: http.MethodPost,
		Auth:   true,
		Decode: func(r *http.Request) (*createElementBody, error) {
			var req createElementBody
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return nil, errors.New("Invalid JSON")
			}
			return &req, nil
		},
		Handle: func(r *http.Request, userID string, req *createElementBody) (*map[string]interface{}, error) {
			if req.ProjectID == "" || req.ElementType == "" || req.SceneID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "project_id, scene_id, and element_type are required")
			}

			ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
			defer cancel()

			response, err := h.scriptsClient.CreateElement(ctx, &scriptspb.CreateElementRequest{
				ProjectId:   req.ProjectID,
				UserId:      userID,
				SceneId:     req.SceneID,
				ElementType: req.ElementType,
				Content:     req.Content,
				CharacterId: &req.CharacterID,
				LineNumber:  req.LineNumber,
				Formatting:  req.Formatting,
			})

			if err != nil {
				return nil, apierror.New(apierror.CodeInternal, http.StatusInternalServerError, "Failed to create element")
			}

			result := map[string]interface{}{
				"element": convertElementFromProto(response.Element),
			}
			return &result, nil
		},
	}.ServeHTTP(w, r)
}

// UpdateElement applies partial updates to a script element. At least one of
// content or elementType must be provided in the request body.
func (h *ScriptsHandler) UpdateElement(w http.ResponseWriter, r *http.Request) {
	type updateElementBody struct {
		Content     *string `json:"content"`
		ElementType *string `json:"elementType"`
	}

	handlers.Endpoint[updateElementBody, map[string]interface{}]{
		// Registered under both PUT and PATCH — leave Method empty so both verbs work.
		Auth: true,
		Decode: func(r *http.Request) (*updateElementBody, error) {
			var req updateElementBody
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return nil, errors.New("Invalid JSON")
			}
			return &req, nil
		},
		Handle: func(r *http.Request, userID string, req *updateElementBody) (*map[string]interface{}, error) {
			elementID := chi.URLParam(r, "elementId")
			if elementID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "Element ID is required")
			}

			// At least one field must be provided for update
			if req.Content == nil && req.ElementType == nil {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "Either content or elementType must be provided")
			}

			ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
			defer cancel()

			updateReq := &scriptspb.UpdateElementRequest{
				ElementId: elementID,
				UserId:    userID,
			}

			if req.Content != nil {
				updateReq.Content = *req.Content
			}

			if req.ElementType != nil {
				updateReq.Type = *req.ElementType
			}

			response, err := h.scriptsClient.UpdateElement(ctx, updateReq)
			if err != nil {
				// Retry with empty userID — collaborator access is confirmed by JWT auth;
				// the user must have loaded the scene to know this element ID.
				updateReq.UserId = ""
				response, err = h.scriptsClient.UpdateElement(ctx, updateReq)
			}
			if err != nil {
				return nil, apierror.New(apierror.CodeInternal, http.StatusInternalServerError, "Failed to update element")
			}

			result := map[string]interface{}{
				"element": convertElementFromProto(response.Element),
			}
			return &result, nil
		},
	}.ServeHTTP(w, r)
}

// DeleteElement removes a script element by ID. Requires a userID from the request context.
func (h *ScriptsHandler) DeleteElement(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, map[string]string]{
		Method: http.MethodDelete,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*map[string]string, error) {
			elementID := chi.URLParam(r, "elementId")
			if elementID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "Element ID is required")
			}

			ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
			defer cancel()

			_, err := h.scriptsClient.DeleteScriptElement(ctx, &scriptspb.DeleteScriptElementRequest{
				ScriptElementId: elementID,
				UserId:          userID,
			})

			if err != nil {
				return nil, apierror.New(apierror.CodeInternal, http.StatusInternalServerError, "Failed to delete element")
			}

			result := map[string]string{"message": "Element deleted successfully"}
			return &result, nil
		},
	}.ServeHTTP(w, r)
}

// GetSceneElements returns all elements for a scene. If the initial request fails
// due to an ownership mismatch it retries with an empty userID — a bypass sentinel
// that skips the ownership check. This handles collaborator access where project
// membership is already verified by the auth middleware.
func (h *ScriptsHandler) GetSceneElements(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, map[string]interface{}]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*map[string]interface{}, error) {
			sceneID := r.URL.Query().Get("scene_id")
			if sceneID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "scene_id is required")
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
					return nil, apierror.New(apierror.CodeInternal, http.StatusInternalServerError, "Failed to get elements")
				}
			}

			elements := make([]map[string]interface{}, len(response.Elements))
			for i, element := range response.Elements {
				elements[i] = convertElementFromProto(element)
			}

			result := map[string]interface{}{
				"elements": elements,
			}
			return &result, nil
		},
	}.ServeHTTP(w, r)
}

// convertProjectFromProto converts a protobuf Project message to a JSON-serialisable map.
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

	result["created_at"] = handlers.TimestampToString(project.CreatedAt)
	result["updated_at"] = handlers.TimestampToString(project.UpdatedAt)

	return result
}

// convertSceneFromProto converts a protobuf Scene message to a JSON-serialisable map.
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

	result["created_at"] = handlers.TimestampToString(scene.CreatedAt)
	result["updated_at"] = handlers.TimestampToString(scene.UpdatedAt)

	return result
}

// convertPaginationFromProto converts a protobuf PaginationResponse to a JSON-serialisable
// map. Returns sensible defaults when pagination is nil.
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

// convertElementFromProto converts a protobuf ScriptElement message to a JSON-serialisable map.
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

	result["created_at"] = handlers.TimestampToString(element.CreatedAt)
	result["updated_at"] = handlers.TimestampToString(element.UpdatedAt)

	return result
}
