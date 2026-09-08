package handler

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/scripts/domain"
	"inkwell/server/internal/scripts/service"
	"inkwell/server/pkg/grpc/common"
	scriptspb "inkwell/server/pkg/grpc/scripts"
	"inkwell/server/pkg/quota"
)

// ScriptsHandler implements the ScriptsService gRPC service. It translates
// inbound proto messages to domain types, delegates to ScriptsService for
// project/scene/element operations, and forwards beat-board calls to an
// embedded BeatBoardHandler to keep that surface area self-contained.
type ScriptsHandler struct {
	scriptspb.UnimplementedScriptsServiceServer
	service          service.ScriptsService
	beatBoardHandler *BeatBoardHandler
}

// NewScriptsHandler creates a ScriptsHandler backed by the provided services.
// Beat-board RPCs are handled by a dedicated BeatBoardHandler that is
// constructed here and held privately.
func NewScriptsHandler(svc service.ScriptsService, beatBoardSvc service.BeatBoardService) *ScriptsHandler {
	return &ScriptsHandler{
		service:          svc,
		beatBoardHandler: NewBeatBoardHandler(beatBoardSvc),
	}
}

// CreateProject creates a new writing project owned by the user identified by
// req.OwnerId. Both title and owner_id are required; missing either returns
// codes.InvalidArgument. The project is created with default status and the
// category field is stored as-is (e.g. "screenplay", "prose").
func (h *ScriptsHandler) CreateProject(ctx context.Context, req *scriptspb.CreateProjectRequest) (*scriptspb.CreateProjectResponse, error) {
	// Validate input
	if req.Title == "" {
		return nil, status.Errorf(codes.InvalidArgument, "title is required")
	}
	if req.OwnerId == "" {
		return nil, status.Errorf(codes.InvalidArgument, "owner_id is required")
	}

	// Parse owner ID
	ownerID, err := uuid.Parse(req.OwnerId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid owner_id: %v", err)
	}

	// Optional owning organization. Membership is authorized at the gateway.
	var orgID *uuid.UUID
	if req.OrgId != "" {
		parsed, err := uuid.Parse(req.OrgId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid org_id: %v", err)
		}
		orgID = &parsed
	}

	// Create project via service
	project, err := h.service.CreateProject(ctx, req.Title, req.Description, req.Category, ownerID, orgID)
	if err != nil {
		return nil, handleServiceError(err)
	}

	// Convert to protobuf response
	return &scriptspb.CreateProjectResponse{
		Project: convertProjectToProto(project),
	}, nil
}

// GetProject retrieves a single project by ID. When req.UserId is non-empty the
// service enforces ownership; passing an empty user_id bypasses the ownership
// check and is used by the gateway after it has already confirmed collaborator
// access via the collab service.
func (h *ScriptsHandler) GetProject(ctx context.Context, req *scriptspb.GetProjectRequest) (*scriptspb.GetProjectResponse, error) {
	// Validate input
	if req.ProjectId == "" {
		return nil, status.Errorf(codes.InvalidArgument, "project_id is required")
	}

	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	// userID is optional — if empty, the service skips the owner check (collaborator access
	// is already verified by the gateway before making this call)
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	// Get project via service
	project, err := h.service.GetProject(ctx, projectID, userID)
	if err != nil {
		return nil, handleServiceError(err)
	}

	// Convert to protobuf response
	return &scriptspb.GetProjectResponse{
		Project: convertProjectToProto(project),
	}, nil
}

// UpdateProject is not yet implemented and always returns codes.Unimplemented.
// UpdateProject applies title/description/status edits (rename, archive/restore)
// to a project. Both ids are required; the service enforces that only the owner
// may update. Optional fields left nil are unchanged.
func (h *ScriptsHandler) UpdateProject(ctx context.Context, req *scriptspb.UpdateProjectRequest) (*scriptspb.UpdateProjectResponse, error) {
	if req.ProjectId == "" || req.UserId == "" {
		return nil, status.Errorf(codes.InvalidArgument, "project_id and user_id are required")
	}

	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
	}

	project, err := h.service.UpdateProject(ctx, projectID, userID, req.Title, req.Description, req.Status)
	if err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.UpdateProjectResponse{
		Project: convertProjectToProto(project),
	}, nil
}

// ToggleProjectStar flips the starred state on a project for the given user.
// It returns the updated project so the caller can reflect the new state
// without a second round-trip.
func (h *ScriptsHandler) ToggleProjectStar(ctx context.Context, req *scriptspb.ToggleProjectStarRequest) (*scriptspb.ToggleProjectStarResponse, error) {
	// Validate input
	if req.ProjectId == "" || req.UserId == "" {
		return nil, status.Errorf(codes.InvalidArgument, "project_id and user_id are required")
	}

	// Parse UUIDs
	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
	}

	// Toggle star via service
	project, err := h.service.ToggleProjectStar(ctx, projectID, userID)
	if err != nil {
		return nil, handleServiceError(err)
	}

	// Convert to protobuf response
	return &scriptspb.ToggleProjectStarResponse{
		Project: convertProjectToProto(project),
	}, nil
}

// DeleteProject permanently removes a project. Both project_id and user_id are
// required; the service enforces that only the project owner may delete it.
func (h *ScriptsHandler) DeleteProject(ctx context.Context, req *scriptspb.DeleteProjectRequest) (*scriptspb.DeleteProjectResponse, error) {
	// Validate input
	if req.ProjectId == "" {
		return nil, status.Error(codes.InvalidArgument, "project_id is required")
	}
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	// Parse UUIDs
	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
	}

	// Delete the project
	err = h.service.DeleteProject(ctx, projectID, userID)
	if err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.DeleteProjectResponse{
		Success: true,
	}, nil
}

// GetUserProjects returns a paginated list of projects owned by the given user.
// Pagination defaults to page 1, limit 20 if the Pagination field is nil or
// zero. Total pages are calculated with ceiling division and are at least 1.
func (h *ScriptsHandler) GetUserProjects(ctx context.Context, req *scriptspb.GetUserProjectsRequest) (*scriptspb.GetUserProjectsResponse, error) {
	// Validate input
	if req.UserId == "" {
		return nil, status.Errorf(codes.InvalidArgument, "user_id is required")
	}

	// Parse user ID
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
	}

	// Set defaults for pagination
	page := int32(1)
	limit := int32(20)

	if req.Pagination != nil {
		if req.Pagination.Page > 0 {
			page = req.Pagination.Page
		}
		if req.Pagination.Limit > 0 {
			limit = req.Pagination.Limit
		}
	}

	// Calculate offset from page
	offset := int((page - 1) * limit)

	// Get projects via service
	projects, total, err := h.service.GetUserProjects(ctx, userID, offset, int(limit))
	if err != nil {
		return nil, handleServiceError(err)
	}

	// Calculate pagination info
	totalPages := int32((total + int64(limit) - 1) / int64(limit)) // Ceiling division
	if totalPages == 0 {
		totalPages = 1
	}

	// Convert to protobuf response
	protoProjects := make([]*scriptspb.Project, len(projects))
	for i, project := range projects {
		protoProjects[i] = convertProjectToProto(project)
	}

	return &scriptspb.GetUserProjectsResponse{
		Projects: protoProjects,
		Pagination: &common.PaginationResponse{
			CurrentPage:  page,
			TotalPages:   totalPages,
			TotalItems:   total,
			ItemsPerPage: limit,
		},
	}, nil
}

// GetOrgProjects returns the projects owned by an organization. Org membership
// is authorized at the gateway before this RPC is reached.
func (h *ScriptsHandler) GetOrgProjects(ctx context.Context, req *scriptspb.GetOrgProjectsRequest) (*scriptspb.GetOrgProjectsResponse, error) {
	if req.OrgId == "" {
		return nil, status.Errorf(codes.InvalidArgument, "org_id is required")
	}
	orgID, err := uuid.Parse(req.OrgId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid org_id: %v", err)
	}

	projects, err := h.service.GetOrgProjects(ctx, orgID)
	if err != nil {
		return nil, handleServiceError(err)
	}

	protoProjects := make([]*scriptspb.Project, len(projects))
	for i, project := range projects {
		protoProjects[i] = convertProjectToProto(project)
	}
	return &scriptspb.GetOrgProjectsResponse{Projects: protoProjects}, nil
}

// CreateOutlineUnit is not yet implemented and always returns codes.Unimplemented.
func (h *ScriptsHandler) CreateOutlineUnit(ctx context.Context, req *scriptspb.CreateOutlineUnitRequest) (*scriptspb.CreateOutlineUnitResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method CreateOutlineUnit not implemented")
}

// GetProjectOutline is not yet implemented and always returns codes.Unimplemented.
func (h *ScriptsHandler) GetProjectOutline(ctx context.Context, req *scriptspb.GetProjectOutlineRequest) (*scriptspb.GetProjectOutlineResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method GetProjectOutline not implemented")
}

// UpdateOutlineUnit is not yet implemented and always returns codes.Unimplemented.
func (h *ScriptsHandler) UpdateOutlineUnit(ctx context.Context, req *scriptspb.UpdateOutlineUnitRequest) (*scriptspb.UpdateOutlineUnitResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method UpdateOutlineUnit not implemented")
}

// DeleteOutlineUnit is not yet implemented and always returns codes.Unimplemented.
func (h *ScriptsHandler) DeleteOutlineUnit(ctx context.Context, req *scriptspb.DeleteOutlineUnitRequest) (*scriptspb.DeleteOutlineUnitResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method DeleteOutlineUnit not implemented")
}

// CreateScene adds a new scene to an existing project. project_id and user_id
// are required; the service enforces that the caller owns or has write access to
// the project. outline_unit_id is optional and links the scene to a beat-board
// outline unit when provided.
// userID is optional — empty means collaborator/org access already verified
// by the gateway (see handlers.RequireProjectAccess); the service's
// verifyProjectAccess treats uuid.Nil as that bypass.
func (h *ScriptsHandler) CreateScene(ctx context.Context, req *scriptspb.CreateSceneRequest) (*scriptspb.CreateSceneResponse, error) {
	// Validate request
	if req.ProjectId == "" {
		return nil, status.Errorf(codes.InvalidArgument, "project_id is required")
	}

	// Parse project ID
	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
	}

	// Create scene object
	scene := &domain.Scene{
		SceneHeading: req.SceneHeading,
		Content:      req.Content,
		OrderIndex:   req.OrderIndex,
	}

	// Handle optional outline_unit_id
	if req.OutlineUnitId != nil && *req.OutlineUnitId != "" {
		outlineUnitID, err := uuid.Parse(*req.OutlineUnitId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid outline_unit_id: %v", err)
		}
		scene.OutlineUnitID = &outlineUnitID
	}

	// Call service
	createdScene, err := h.service.CreateScene(ctx, projectID, userID, scene)
	if err != nil {
		return nil, handleServiceError(err)
	}

	// Convert to protobuf
	pbScene := &scriptspb.Scene{
		Id:           createdScene.ID.String(),
		ProjectId:    createdScene.ProjectID.String(),
		SceneHeading: createdScene.SceneHeading,
		Content:      createdScene.Content,
		OrderIndex:   createdScene.OrderIndex,
		CreatedAt: &common.Timestamp{
			Seconds: createdScene.CreatedAt.Unix(),
			Nanos:   int32(createdScene.CreatedAt.Nanosecond()),
		},
		UpdatedAt: &common.Timestamp{
			Seconds: createdScene.UpdatedAt.Unix(),
			Nanos:   int32(createdScene.UpdatedAt.Nanosecond()),
		},
	}

	if createdScene.OutlineUnitID != nil {
		pbScene.OutlineUnitId = createdScene.OutlineUnitID.String()
	}

	return &scriptspb.CreateSceneResponse{
		Scene: pbScene,
	}, nil
}

// GetProjectScenes returns all scenes for a project, ordered by their index.
// Passing an empty user_id bypasses the ownership check; the gateway does this
// when collaborator access has already been confirmed by the collab service.
func (h *ScriptsHandler) GetProjectScenes(ctx context.Context, req *scriptspb.GetProjectScenesRequest) (*scriptspb.GetProjectScenesResponse, error) {
	// Parse project ID
	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project ID: %v", err)
	}

	// userID is optional — empty means collaborator access already verified by gateway
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
		}
	}

	// Get scenes from service
	scenes, err := h.service.GetProjectScenes(ctx, projectID, userID)
	if err != nil {
		return nil, handleServiceError(err)
	}

	// Convert to protobuf
	pbScenes := make([]*scriptspb.Scene, len(scenes))
	for i, scene := range scenes {
		pbScenes[i] = convertSceneToProto(scene)
	}

	return &scriptspb.GetProjectScenesResponse{
		Scenes: pbScenes,
	}, nil
}

// UpdateScene applies a partial update to a scene. Only the non-nil optional
// fields (SceneHeading, Content, OrderIndex) are forwarded to the service; omitted
// fields are left unchanged. userID is optional — empty means collaborator/org
// access already verified by the gateway (see handlers.RequireProjectAccess).
func (h *ScriptsHandler) UpdateScene(ctx context.Context, req *scriptspb.UpdateSceneRequest) (*scriptspb.UpdateSceneResponse, error) {
	// Parse scene ID
	sceneID, err := uuid.Parse(req.SceneId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid scene ID: %v", err)
	}

	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
		}
	}

	// Create domain scene for updates
	updates := &domain.Scene{}

	// Set fields if provided (handle optional fields)
	if req.SceneHeading != nil {
		updates.SceneHeading = *req.SceneHeading
	}
	if req.Content != nil {
		updates.Content = *req.Content
	}
	if req.OrderIndex != nil {
		updates.OrderIndex = *req.OrderIndex
	}

	// Update scene through service
	updatedScene, err := h.service.UpdateScene(ctx, sceneID, userID, updates)
	if err != nil {
		return nil, handleServiceError(err)
	}

	// Convert to protobuf
	pbScene := convertSceneToProto(updatedScene)

	return &scriptspb.UpdateSceneResponse{
		Scene: pbScene,
	}, nil
}

// DeleteScene permanently removes a scene and its elements. The service enforces
// that only a user with write access to the project may delete its scenes.
// userID is optional — empty means collaborator/org access already verified
// by the gateway (see handlers.RequireProjectAccess).
func (h *ScriptsHandler) DeleteScene(ctx context.Context, req *scriptspb.DeleteSceneRequest) (*scriptspb.DeleteSceneResponse, error) {
	// Parse scene ID
	sceneID, err := uuid.Parse(req.SceneId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid scene ID: %v", err)
	}

	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
		}
	}

	// Delete scene through service
	err = h.service.DeleteScene(ctx, sceneID, userID)
	if err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.DeleteSceneResponse{
		Success: true,
	}, nil
}

// CreateCharacter is not yet implemented and always returns codes.Unimplemented.
func (h *ScriptsHandler) CreateCharacter(ctx context.Context, req *scriptspb.CreateCharacterRequest) (*scriptspb.CreateCharacterResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method CreateCharacter not implemented")
}

// GetProjectCharacters is not yet implemented and always returns codes.Unimplemented.
func (h *ScriptsHandler) GetProjectCharacters(ctx context.Context, req *scriptspb.GetProjectCharactersRequest) (*scriptspb.GetProjectCharactersResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method GetProjectCharacters not implemented")
}

// UpdateCharacter is not yet implemented and always returns codes.Unimplemented.
func (h *ScriptsHandler) UpdateCharacter(ctx context.Context, req *scriptspb.UpdateCharacterRequest) (*scriptspb.UpdateCharacterResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method UpdateCharacter not implemented")
}

// CreateLocation is not yet implemented and always returns codes.Unimplemented.
func (h *ScriptsHandler) CreateLocation(ctx context.Context, req *scriptspb.CreateLocationRequest) (*scriptspb.CreateLocationResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method CreateLocation not implemented")
}

// GetProjectLocations is not yet implemented and always returns codes.Unimplemented.
func (h *ScriptsHandler) GetProjectLocations(ctx context.Context, req *scriptspb.GetProjectLocationsRequest) (*scriptspb.GetProjectLocationsResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method GetProjectLocations not implemented")
}

// DeleteScriptElement removes a single script element by ID. The service enforces
// that the caller has write access to the element's parent project.
func (h *ScriptsHandler) DeleteScriptElement(ctx context.Context, req *scriptspb.DeleteScriptElementRequest) (*scriptspb.DeleteScriptElementResponse, error) {
	// Parse UUIDs
	elementID, err := uuid.Parse(req.ScriptElementId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid script element ID: %v", err)
	}

	// userID is optional — empty means collaborator access already verified by
	// the gateway; uuid.Nil makes the service skip the ownership check.
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
		}
	}

	// Call service to delete script element
	err = h.service.DeleteScriptElement(ctx, elementID, userID)
	if err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.DeleteScriptElementResponse{
		Success: true,
	}, nil
}

// BatchCreateElements creates multiple script elements in a single call. It is
// used by the FDX import flow to persist all elements for a scene at once,
// avoiding individual round-trips per element. At least one element is required.
func (h *ScriptsHandler) BatchCreateElements(ctx context.Context, req *scriptspb.BatchCreateElementsRequest) (*scriptspb.BatchCreateElementsResponse, error) {
	// Validate input
	if req.ProjectId == "" {
		return nil, status.Errorf(codes.InvalidArgument, "project_id is required")
	}
	if req.UserId == "" {
		return nil, status.Errorf(codes.InvalidArgument, "user_id is required")
	}
	if len(req.Elements) == 0 {
		return nil, status.Errorf(codes.InvalidArgument, "at least one element is required")
	}

	// Parse IDs
	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
	}

	// Convert protobuf elements to domain elements
	domainElements := make([]*domain.ProjectElement, len(req.Elements))
	for i, protoElement := range req.Elements {
		sceneID, err := uuid.Parse(protoElement.SceneId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid scene_id at index %d: %v", i, err)
		}

		domainElements[i] = &domain.ProjectElement{
			ProjectID:  projectID,
			SceneID:    &sceneID,
			Type:       protoElement.Type,
			Content:    protoElement.Content,
			LineNumber: protoElement.LineNumber,
			Formatting: protoElement.Formatting,
		}
	}

	// Create elements through service
	createdElements, err := h.service.BatchCreateElements(ctx, userID, projectID, domainElements)
	if err != nil {
		return nil, handleServiceError(err)
	}

	// Convert to protobuf
	protoElements := make([]*scriptspb.ProjectElement, len(createdElements))
	for i, element := range createdElements {
		protoElements[i] = convertElementToProto(element)
	}

	return &scriptspb.BatchCreateElementsResponse{
		CreatedElements: protoElements,
	}, nil
}

// orgIDString renders an optional org UUID as a string, empty when nil (the
// proto's zero value for an unset/personal project).
func orgIDString(id *uuid.UUID) string {
	if id == nil {
		return ""
	}
	return id.String()
}

// convertProjectToProto maps a domain Project to the scripts proto Project message.
func convertProjectToProto(project *domain.Project) *scriptspb.Project {
	return &scriptspb.Project{
		Id:          project.ID.String(),
		Title:       project.Title,
		Description: project.Description,
		OwnerId:     project.OwnerID.String(),
		Category:    project.Category,
		Status:      project.Status,
		IsStarred:   project.IsStarred,
		CreatedAt: &common.Timestamp{
			Seconds: project.CreatedAt.Unix(),
			Nanos:   int32(project.CreatedAt.Nanosecond()),
		},
		UpdatedAt: &common.Timestamp{
			Seconds: project.UpdatedAt.Unix(),
			Nanos:   int32(project.UpdatedAt.Nanosecond()),
		},
		OrgId: orgIDString(project.OrgID),
	}
}

// handleServiceError maps domain error sentinels to gRPC status codes so
// callers receive meaningful error types rather than a blanket
// codes.Internal. Uses errors.Is so wrapped errors (e.g. fmt.Errorf
// chains in repository code) still resolve to the right code.
func handleServiceError(err error) error {
	switch {
	case errors.Is(err, domain.ErrProjectNotFound),
		errors.Is(err, domain.ErrSceneNotFound),
		errors.Is(err, domain.ErrProjectElementNotFound),
		errors.Is(err, domain.ErrCharacterNotFound),
		errors.Is(err, domain.ErrLocationNotFound),
		errors.Is(err, domain.ErrOutlineUnitNotFound):
		return status.Error(codes.NotFound, err.Error())
	case errors.Is(err, domain.ErrProjectExists):
		return status.Error(codes.AlreadyExists, err.Error())
	case errors.Is(err, domain.ErrUnauthorizedAccess):
		return status.Error(codes.PermissionDenied, err.Error())
	case errors.Is(err, domain.ErrInvalidProjectData):
		return status.Error(codes.InvalidArgument, err.Error())
	case errors.Is(err, quota.ErrQuotaExceeded):
		// Hitting a plan limit is an expected, actionable condition — surface
		// it as ResourceExhausted so the gateway maps it to 429 rather than a
		// generic 500.
		return status.Error(codes.ResourceExhausted, err.Error())
	}
	return status.Errorf(codes.Internal, "internal server error: %v", err)
}

// CreateElement adds a single typed element (a paragraph, line, panel, stat
// block, passage body, etc., depending on the format) to a scene/container.
// userID is optional — empty means collaborator/org access already verified
// by the gateway (see handlers.RequireProjectAccess).
func (h *ScriptsHandler) CreateElement(ctx context.Context, req *scriptspb.CreateElementRequest) (*scriptspb.CreateElementResponse, error) {
	// Parse project ID
	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project ID: %v", err)
	}

	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
		}
	}

	// Parse required scene ID
	sceneID, err := uuid.Parse(req.SceneId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid scene ID: %v", err)
	}

	// Create domain element
	element := &domain.ProjectElement{
		ProjectID:  projectID,
		SceneID:    &sceneID,
		Type:       req.ElementType,
		Content:    req.Content,
		LineNumber: req.LineNumber,
		Formatting: req.Formatting,
	}

	// Create element through service
	createdElement, err := h.service.CreateElement(ctx, userID, element)
	if err != nil {
		return nil, handleServiceError(err)
	}

	// Convert to protobuf
	protoElement := convertElementToProto(createdElement)

	return &scriptspb.CreateElementResponse{
		Element: protoElement,
	}, nil
}

// UpdateElement replaces the text content of a script element. Only the content
// field is mutable through this RPC; type and position changes are not supported.
func (h *ScriptsHandler) UpdateElement(ctx context.Context, req *scriptspb.UpdateElementRequest) (*scriptspb.UpdateElementResponse, error) {
	// Parse element ID
	elementID, err := uuid.Parse(req.ElementId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid element ID: %v", err)
	}

	// userID is optional — empty string means collaborator access already verified by gateway
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
		}
	}

	// Update element through service
	updatedElement, err := h.service.UpdateElementContent(ctx, userID, elementID, req.Content)
	if err != nil {
		return nil, handleServiceError(err)
	}

	// Convert to protobuf
	protoElement := convertElementToProto(updatedElement)

	return &scriptspb.UpdateElementResponse{
		Element: protoElement,
	}, nil
}

// GetSceneElements returns all script elements belonging to a scene, ordered by
// line number. Passing an empty user_id bypasses the ownership check; the gateway
// does this when collaborator access has already been confirmed by the collab service.
func (h *ScriptsHandler) GetSceneElements(ctx context.Context, req *scriptspb.GetSceneElementsRequest) (*scriptspb.GetSceneElementsResponse, error) {
	// Parse scene ID
	sceneID, err := uuid.Parse(req.SceneId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid scene ID: %v", err)
	}

	// userID is optional — empty means collaborator access already verified by gateway
	userID := uuid.Nil
	if req.UserId != "" {
		userID, err = uuid.Parse(req.UserId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
		}
	}

	// Get elements through service
	elements, err := h.service.GetSceneElements(ctx, userID, sceneID)
	if err != nil {
		return nil, handleServiceError(err)
	}

	// Convert to protobuf
	protoElements := make([]*scriptspb.ProjectElement, len(elements))
	for i, element := range elements {
		protoElements[i] = convertElementToProto(element)
	}

	return &scriptspb.GetSceneElementsResponse{
		Elements: protoElements,
	}, nil
}

// convertElementToProto maps a domain ProjectElement to the scripts proto
// ProjectElement message. scene_id is only set when non-nil.
func convertElementToProto(element *domain.ProjectElement) *scriptspb.ProjectElement {
	protoElement := &scriptspb.ProjectElement{
		Id:         element.ID.String(),
		ProjectId:  element.ProjectID.String(),
		Type:       element.Type,
		Content:    element.Content,
		LineNumber: element.LineNumber,
		Formatting: element.Formatting,
		CreatedAt: &common.Timestamp{
			Seconds: element.CreatedAt.Unix(),
			Nanos:   int32(element.CreatedAt.Nanosecond()),
		},
		UpdatedAt: &common.Timestamp{
			Seconds: element.UpdatedAt.Unix(),
			Nanos:   int32(element.UpdatedAt.Nanosecond()),
		},
	}

	if element.SceneID != nil {
		protoElement.SceneId = element.SceneID.String()
	}

	return protoElement
}

// convertSceneToProto maps a domain Scene to the scripts proto Scene message.
// outline_unit_id is only set when the scene is linked to a beat-board outline unit.
func convertSceneToProto(scene *domain.Scene) *scriptspb.Scene {
	pbScene := &scriptspb.Scene{
		Id:           scene.ID.String(),
		ProjectId:    scene.ProjectID.String(),
		SceneHeading: scene.SceneHeading,
		Content:      scene.Content,
		OrderIndex:   scene.OrderIndex,
		CreatedAt: &common.Timestamp{
			Seconds: scene.CreatedAt.Unix(),
			Nanos:   int32(scene.CreatedAt.Nanosecond()),
		},
		UpdatedAt: &common.Timestamp{
			Seconds: scene.UpdatedAt.Unix(),
			Nanos:   int32(scene.UpdatedAt.Nanosecond()),
		},
	}

	// Set optional outline unit ID if present
	if scene.OutlineUnitID != nil {
		pbScene.OutlineUnitId = scene.OutlineUnitID.String()
	}

	return pbScene
}

// The following methods satisfy the ScriptsService gRPC interface for beat-board
// RPCs. Each call is forwarded directly to the embedded BeatBoardHandler.

// CreateBeat delegates to BeatBoardHandler.CreateBeat.
func (h *ScriptsHandler) CreateBeat(ctx context.Context, req *scriptspb.CreateBeatRequest) (*scriptspb.CreateBeatResponse, error) {
	return h.beatBoardHandler.CreateBeat(ctx, req)
}

// GetBeat delegates to BeatBoardHandler.GetBeat.
func (h *ScriptsHandler) GetBeat(ctx context.Context, req *scriptspb.GetBeatRequest) (*scriptspb.GetBeatResponse, error) {
	return h.beatBoardHandler.GetBeat(ctx, req)
}

// GetProjectBeatBoard delegates to BeatBoardHandler.GetProjectBeatBoard.
func (h *ScriptsHandler) GetProjectBeatBoard(ctx context.Context, req *scriptspb.GetProjectBeatBoardRequest) (*scriptspb.GetProjectBeatBoardResponse, error) {
	return h.beatBoardHandler.GetProjectBeatBoard(ctx, req)
}

// UpdateBeat delegates to BeatBoardHandler.UpdateBeat.
func (h *ScriptsHandler) UpdateBeat(ctx context.Context, req *scriptspb.UpdateBeatRequest) (*scriptspb.UpdateBeatResponse, error) {
	return h.beatBoardHandler.UpdateBeat(ctx, req)
}

// DeleteBeat delegates to BeatBoardHandler.DeleteBeat.
func (h *ScriptsHandler) DeleteBeat(ctx context.Context, req *scriptspb.DeleteBeatRequest) (*scriptspb.DeleteBeatResponse, error) {
	return h.beatBoardHandler.DeleteBeat(ctx, req)
}

// CreateConnection delegates to BeatBoardHandler.CreateConnection.
func (h *ScriptsHandler) CreateConnection(ctx context.Context, req *scriptspb.CreateConnectionRequest) (*scriptspb.CreateConnectionResponse, error) {
	return h.beatBoardHandler.CreateConnection(ctx, req)
}

// DeleteConnection delegates to BeatBoardHandler.DeleteConnection.
func (h *ScriptsHandler) DeleteConnection(ctx context.Context, req *scriptspb.DeleteConnectionRequest) (*scriptspb.DeleteConnectionResponse, error) {
	return h.beatBoardHandler.DeleteConnection(ctx, req)
}

// CreateLane delegates to BeatBoardHandler.CreateLane.
func (h *ScriptsHandler) CreateLane(ctx context.Context, req *scriptspb.CreateLaneRequest) (*scriptspb.CreateLaneResponse, error) {
	return h.beatBoardHandler.CreateLane(ctx, req)
}

// GetProjectLanes delegates to BeatBoardHandler.GetProjectLanes.
func (h *ScriptsHandler) GetProjectLanes(ctx context.Context, req *scriptspb.GetProjectLanesRequest) (*scriptspb.GetProjectLanesResponse, error) {
	return h.beatBoardHandler.GetProjectLanes(ctx, req)
}

// UpdateLane delegates to BeatBoardHandler.UpdateLane.
func (h *ScriptsHandler) UpdateLane(ctx context.Context, req *scriptspb.UpdateLaneRequest) (*scriptspb.UpdateLaneResponse, error) {
	return h.beatBoardHandler.UpdateLane(ctx, req)
}

// UpdateLaneOrder delegates to BeatBoardHandler.UpdateLaneOrder.
func (h *ScriptsHandler) UpdateLaneOrder(ctx context.Context, req *scriptspb.UpdateLaneOrderRequest) (*scriptspb.UpdateLaneOrderResponse, error) {
	return h.beatBoardHandler.UpdateLaneOrder(ctx, req)
}

// DeleteLane delegates to BeatBoardHandler.DeleteLane.
func (h *ScriptsHandler) DeleteLane(ctx context.Context, req *scriptspb.DeleteLaneRequest) (*scriptspb.DeleteLaneResponse, error) {
	return h.beatBoardHandler.DeleteLane(ctx, req)
}

// CreateOutlineItem delegates to BeatBoardHandler.CreateOutlineItem.
func (h *ScriptsHandler) CreateOutlineItem(ctx context.Context, req *scriptspb.CreateOutlineItemRequest) (*scriptspb.CreateOutlineItemResponse, error) {
	return h.beatBoardHandler.CreateOutlineItem(ctx, req)
}

// UpdateOutlineItem delegates to BeatBoardHandler.UpdateOutlineItem.
func (h *ScriptsHandler) UpdateOutlineItem(ctx context.Context, req *scriptspb.UpdateOutlineItemRequest) (*scriptspb.UpdateOutlineItemResponse, error) {
	return h.beatBoardHandler.UpdateOutlineItem(ctx, req)
}

// DeleteOutlineItem delegates to BeatBoardHandler.DeleteOutlineItem.
func (h *ScriptsHandler) DeleteOutlineItem(ctx context.Context, req *scriptspb.DeleteOutlineItemRequest) (*scriptspb.DeleteOutlineItemResponse, error) {
	return h.beatBoardHandler.DeleteOutlineItem(ctx, req)
}

// resourceKindFromProto maps the proto ResourceType to the domain ResourceKind.
func resourceKindFromProto(t scriptspb.ResourceType) (domain.ResourceKind, bool) {
	switch t {
	case scriptspb.ResourceType_RESOURCE_TYPE_BEAT:
		return domain.ResourceKindBeat, true
	case scriptspb.ResourceType_RESOURCE_TYPE_CONNECTION:
		return domain.ResourceKindConnection, true
	case scriptspb.ResourceType_RESOURCE_TYPE_LANE:
		return domain.ResourceKindLane, true
	case scriptspb.ResourceType_RESOURCE_TYPE_OUTLINE_ITEM:
		return domain.ResourceKindOutlineItem, true
	case scriptspb.ResourceType_RESOURCE_TYPE_ELEMENT:
		return domain.ResourceKindElement, true
	case scriptspb.ResourceType_RESOURCE_TYPE_DRAWING:
		return domain.ResourceKindDrawing, true
	case scriptspb.ResourceType_RESOURCE_TYPE_SCENE:
		return domain.ResourceKindScene, true
	default:
		return domain.ResourceKindUnspecified, false
	}
}

// GetResourceProject resolves which project owns a sub-resource so the gateway
// can authorize a mutation against it. It performs no access check itself.
func (h *ScriptsHandler) GetResourceProject(ctx context.Context, req *scriptspb.GetResourceProjectRequest) (*scriptspb.GetResourceProjectResponse, error) {
	kind, ok := resourceKindFromProto(req.ResourceType)
	if !ok {
		return nil, status.Error(codes.InvalidArgument, "unknown or unspecified resource_type")
	}

	resourceID, err := uuid.Parse(req.ResourceId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid resource_id: %v", err)
	}

	projectID, err := h.service.GetResourceProject(ctx, kind, resourceID)
	if err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.GetResourceProjectResponse{ProjectId: projectID.String()}, nil
}
