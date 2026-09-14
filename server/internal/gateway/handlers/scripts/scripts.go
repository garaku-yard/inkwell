package scripts

import (
	"context"
	"encoding/json"
	"errors"
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
	workspacepb "inkwell/server/pkg/grpc/workspace"
)

// ScriptsHandler routes project, scene, and element HTTP requests to the scripts
// gRPC service. It also fans out to the collab service to enrich responses with
// collaborator counts and to verify access for shared projects, and to the
// workspace service to authorize access to org-owned projects.
type ScriptsHandler struct {
	scriptsClient   scriptspb.ScriptsServiceClient
	collabClient    collab.CollaborationServiceClient
	workspaceClient workspacepb.WorkspaceServiceClient
}

// NewScriptsHandler creates a ScriptsHandler using the gRPC clients in the
// provided registry.
func NewScriptsHandler(clients *grpcclient.Registry) *ScriptsHandler {
	return &ScriptsHandler{
		scriptsClient:   clients.Scripts,
		collabClient:    clients.Collab,
		workspaceClient: clients.Workspace,
	}
}

// callerRoleToProto maps the gateway's resolved handlers.ProjectRole to the
// scripts.CallerRole every protected scripts RPC now carries alongside the
// caller's real, always-non-empty user_id (Orbit #360 — replaces the old
// empty-user_id bypass sentinel). RoleNone never reaches here: every call
// site checks handlers.RequireProjectRole's error first, and Can() never
// permits an action for RoleNone.
func callerRoleToProto(role handlers.ProjectRole) scriptspb.CallerRole {
	switch role {
	case handlers.RoleOwner:
		return scriptspb.CallerRole_CALLER_ROLE_OWNER
	case handlers.RoleOrgAdmin:
		return scriptspb.CallerRole_CALLER_ROLE_ORG_ADMIN
	case handlers.RoleEditor:
		return scriptspb.CallerRole_CALLER_ROLE_EDITOR
	case handlers.RoleViewer:
		return scriptspb.CallerRole_CALLER_ROLE_VIEWER
	default:
		return scriptspb.CallerRole_CALLER_ROLE_UNSPECIFIED
	}
}

// CreateProject creates a new writing project. scripts.projects.owner_id is
// the sole ownership record; collab stores only non-owner collaborators.
type createProjectBody struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Category    string `json:"category"`
	// OrgID, when set, creates the project inside an organization. The caller
	// must be a member with a writing role (owner/admin/editor).
	OrgID string `json:"org_id"`
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
// field validation and the gRPC call.
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

			// Creating into an org requires a writing role in that org. Viewers
			// and non-members are rejected before the project is created.
			if body.OrgID != "" {
				role, err := handlers.ResolveOrgRole(r.Context(), h.workspaceClient, body.OrgID, userID)
				if err != nil || (role != "owner" && role != "admin" && role != "editor") {
					return nil, apierror.New(apierror.CodePermissionDenied, http.StatusForbidden, "you do not have permission to create projects in this organization")
				}
			}

			resp, err := h.scriptsClient.CreateProject(r.Context(), &scriptspb.CreateProjectRequest{
				Title:       body.Title,
				Description: body.Description,
				OwnerId:     userID,
				Category:    body.Category,
				OrgId:       body.OrgID,
			})
			if err != nil {
				return nil, err
			}

			return &createProjectResponse{Project: convertProjectFromProto(resp.Project)}, nil
		},
	}.ServeHTTP(w, r)
}

// GetProject fetches a single project by ID. It requires a userID from the
// request context and calls handlers.RequireProjectAccess (ActionRead) to
// verify the caller is at least a viewer. Returns 403 if not.
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

			role, authErr := handlers.RequireProjectRole(r.Context(), userID, projectID, handlers.ActionRead, h.scriptsClient, h.collabClient, h.workspaceClient)
			if authErr != nil {
				return nil, authErr
			}

			resp, err := h.scriptsClient.GetProject(r.Context(), &scriptspb.GetProjectRequest{
				ProjectId:  projectID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
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

// DeleteProject removes a project. Requires a userID from the request context;
// gated on ActionDeleteProject (owner-only), matching the scripts service's own
// strict owner check underneath — the gateway check exists so the classification
// is explicit and the caller gets the shared apierror envelope on denial.
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

			if _, authErr := handlers.RequireProjectRole(r.Context(), userID, projectID, handlers.ActionDeleteProject, h.scriptsClient, h.collabClient, h.workspaceClient); authErr != nil {
				return nil, authErr
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
// user. Requires a userID from the request context; gated on
// ActionManageProject (owner-only — is_starred is a single project-level flag,
// not a per-viewer bookmark, matching the scripts service's own strict owner
// check underneath).
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

			if _, authErr := handlers.RequireProjectRole(r.Context(), userID, projectID, handlers.ActionManageProject, h.scriptsClient, h.collabClient, h.workspaceClient); authErr != nil {
				return nil, authErr
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

// updateProjectBody is the PUT /projects/{projectId} request. Fields are
// pointers so an omitted field forwards as a nil optional (leave-unchanged)
// rather than clobbering with the zero value. A client-supplied user_id is
// ignored — the authenticated caller is the authorization subject.
type updateProjectBody struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Status      *string `json:"status"`
}

// UpdateProject handles PUT /projects/{projectId}: rename/description edits and
// archive/restore (status). Gated on ActionManageProject (owner-only), matching
// the scripts service's own strict owner check underneath — see ActionManageProject's
// doc comment on handlers.Can for why this stays owner-only rather than
// "owner + org admin" as the matrix's "edit content" language might suggest.
func (h *ScriptsHandler) UpdateProject(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[updateProjectBody, projectResponse]{
		Method: http.MethodPut,
		Auth:   true,
		Decode: handlers.JSONBody[updateProjectBody],
		Handle: func(r *http.Request, userID string, body *updateProjectBody) (*projectResponse, error) {
			projectID := chi.URLParam(r, "projectId")
			if projectID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "project ID is required")
			}

			if _, authErr := handlers.RequireProjectRole(r.Context(), userID, projectID, handlers.ActionManageProject, h.scriptsClient, h.collabClient, h.workspaceClient); authErr != nil {
				return nil, authErr
			}

			resp, err := h.scriptsClient.UpdateProject(r.Context(), &scriptspb.UpdateProjectRequest{
				ProjectId:   projectID,
				UserId:      userID,
				Title:       body.Title,
				Description: body.Description,
				Status:      body.Status,
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
						ProjectId:  projectID,
						UserId:     userID,
						CallerRole: collab.CallerRole_CALLER_ROLE_VIEWER,
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

// GetOrgProjects returns the projects owned by an organization. The caller must
// be a member of the org (any role); non-members receive 403.
func (h *ScriptsHandler) GetOrgProjects(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, map[string]interface{}]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*map[string]interface{}, error) {
			orgID := chi.URLParam(r, "orgId")
			if orgID == "" {
				return nil, apierror.New(apierror.CodeInvalidArgument, http.StatusBadRequest, "org ID is required")
			}
			if _, err := handlers.ResolveOrgRole(r.Context(), h.workspaceClient, orgID, userID); err != nil {
				return nil, apierror.New(apierror.CodePermissionDenied, http.StatusForbidden, "you are not a member of this organization")
			}

			resp, err := h.scriptsClient.GetOrgProjects(r.Context(), &scriptspb.GetOrgProjectsRequest{OrgId: orgID})
			if err != nil {
				return nil, err
			}

			projects := make([]map[string]interface{}, len(resp.Projects))
			for i, project := range resp.Projects {
				projects[i] = convertProjectFromProto(project)
			}
			result := map[string]interface{}{"projects": projects}
			return &result, nil
		},
	}.ServeHTTP(w, r)
}

// GetSharedProjects returns projects where the authenticated user is an active
// collaborator but not the owner. It queries the collab service for the user's
// active collaborations, resolves the effective role for each project, then fetches
// it with the real actor and explicit role assertion.
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

			// Resolve each project's effective role rather than trusting the role
			// projection returned by collab in isolation: org membership may grant
			// a higher role, and scripts requires an explicit gateway assertion.
			projects := make([]map[string]interface{}, 0, len(collabResp.Collaborations))
			for _, c := range collabResp.Collaborations {
				role, authErr := handlers.RequireProjectRole(ctx, userID, c.ProjectId, handlers.ActionRead, h.scriptsClient, h.collabClient, h.workspaceClient)
				if authErr != nil {
					continue
				}
				projResp, err := h.scriptsClient.GetProject(ctx, &scriptspb.GetProjectRequest{
					ProjectId:  c.ProjectId,
					UserId:     userID,
					CallerRole: callerRoleToProto(role),
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

			role, authErr := handlers.RequireProjectRole(ctx, userID, req.ProjectID, handlers.ActionEditContent, h.scriptsClient, h.collabClient, h.workspaceClient)
			if authErr != nil {
				return nil, authErr
			}

			response, err := h.scriptsClient.CreateScene(ctx, &scriptspb.CreateSceneRequest{
				ProjectId:     req.ProjectID,
				UserId:        userID,
				CallerRole:    callerRoleToProto(role),
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
// request context and verifies access via handlers.RequireProjectAccess (ActionRead) before fetching.
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

			role, authErr := handlers.RequireProjectRole(ctx, userID, projectID, handlers.ActionRead, h.scriptsClient, h.collabClient, h.workspaceClient)
			if authErr != nil {
				return nil, authErr
			}

			response, err := h.scriptsClient.GetProjectScenes(ctx, &scriptspb.GetProjectScenesRequest{
				ProjectId:  projectID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
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

			role, authErr := h.authorizeResource(ctx, userID, scriptspb.ResourceType_RESOURCE_TYPE_SCENE, sceneID, handlers.ActionEditContent)
			if authErr != nil {
				return nil, authErr
			}

			response, err := h.scriptsClient.UpdateScene(ctx, &scriptspb.UpdateSceneRequest{
				SceneId:      sceneID,
				UserId:       userID,
				CallerRole:   callerRoleToProto(role),
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

			role, authErr := h.authorizeResource(ctx, userID, scriptspb.ResourceType_RESOURCE_TYPE_SCENE, sceneID, handlers.ActionEditContent)
			if authErr != nil {
				return nil, authErr
			}

			_, err := h.scriptsClient.DeleteScene(ctx, &scriptspb.DeleteSceneRequest{
				SceneId:    sceneID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
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

			role, authErr := handlers.RequireProjectRole(ctx, userID, req.ProjectID, handlers.ActionEditContent, h.scriptsClient, h.collabClient, h.workspaceClient)
			if authErr != nil {
				return nil, authErr
			}

			response, err := h.scriptsClient.CreateElement(ctx, &scriptspb.CreateElementRequest{
				ProjectId:   req.ProjectID,
				UserId:      userID,
				CallerRole:  callerRoleToProto(role),
				SceneId:     req.SceneID,
				ElementType: req.ElementType,
				Content:     req.Content,
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

			role, err := h.authorizeResource(ctx, userID, scriptspb.ResourceType_RESOURCE_TYPE_ELEMENT, elementID, handlers.ActionEditContent)
			if err != nil {
				return nil, err
			}

			updateReq := &scriptspb.UpdateElementRequest{
				ElementId:  elementID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
			}

			if req.Content != nil {
				updateReq.Content = *req.Content
			}

			if req.ElementType != nil {
				updateReq.Type = *req.ElementType
			}

			response, err := h.scriptsClient.UpdateElement(ctx, updateReq)
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

			role, err := h.authorizeResource(ctx, userID, scriptspb.ResourceType_RESOURCE_TYPE_ELEMENT, elementID, handlers.ActionEditContent)
			if err != nil {
				return nil, err
			}

			_, err = h.scriptsClient.DeleteScriptElement(ctx, &scriptspb.DeleteScriptElementRequest{
				ScriptElementId: elementID,
				UserId:          userID,
				CallerRole:      callerRoleToProto(role),
			})

			if err != nil {
				return nil, apierror.New(apierror.CodeInternal, http.StatusInternalServerError, "Failed to delete element")
			}

			result := map[string]string{"message": "Element deleted successfully"}
			return &result, nil
		},
	}.ServeHTTP(w, r)
}

// GetSceneElements returns all elements for a scene. Authorizes against the
// scene's real project (RESOURCE_TYPE_SCENE) before fetching — previously
// this retried unconditionally with the empty-user bypass sentinel on any
// failure, granting read access to any authenticated caller who knew a valid
// scene_id, no membership check at all.
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

			role, authErr := h.authorizeResource(ctx, userID, scriptspb.ResourceType_RESOURCE_TYPE_SCENE, sceneID, handlers.ActionRead)
			if authErr != nil {
				return nil, authErr
			}

			response, err := h.scriptsClient.GetSceneElements(ctx, &scriptspb.GetSceneElementsRequest{
				SceneId:    sceneID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
			})
			if err != nil {
				return nil, apierror.New(apierror.CodeInternal, http.StatusInternalServerError, "Failed to get elements")
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

	if project.OrgId != "" {
		result["org_id"] = project.OrgId
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

// convertElementFromProto converts a protobuf ProjectElement message to a JSON-serialisable map.
func convertElementFromProto(element *scriptspb.ProjectElement) map[string]interface{} {
	result := map[string]interface{}{
		"id":           element.Id,
		"project_id":   element.ProjectId,
		"scene_id":     element.SceneId,
		"element_type": element.Type,
		"content":      element.Content,
		"line_number":  element.LineNumber,
		"formatting":   element.Formatting,
	}

	result["created_at"] = handlers.TimestampToString(element.CreatedAt)
	result["updated_at"] = handlers.TimestampToString(element.UpdatedAt)

	return result
}
