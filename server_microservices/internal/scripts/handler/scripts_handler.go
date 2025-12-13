package handler

import (
	"context"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"scriptlith/server_microservices/internal/scripts/domain"
	"scriptlith/server_microservices/internal/scripts/service"
	"scriptlith/server_microservices/pkg/grpc/common"
	scriptspb "scriptlith/server_microservices/pkg/grpc/scripts"
)

// ScriptsHandler implements the ScriptsService gRPC service
type ScriptsHandler struct {
	scriptspb.UnimplementedScriptsServiceServer
	service          service.ScriptsService
	beatBoardHandler *BeatBoardHandler
}

// NewScriptsHandler creates a new ScriptsHandler instance
func NewScriptsHandler(svc service.ScriptsService, beatBoardSvc service.BeatBoardService) *ScriptsHandler {
	return &ScriptsHandler{
		service:          svc,
		beatBoardHandler: NewBeatBoardHandler(beatBoardSvc),
	}
}

// Project management methods
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

	// Create project via service
	project, err := h.service.CreateProject(ctx, req.Title, req.Description, ownerID)
	if err != nil {
		return nil, handleServiceError(err)
	}

	// Convert to protobuf response
	return &scriptspb.CreateProjectResponse{
		Project: convertProjectToProto(project),
	}, nil
}

func (h *ScriptsHandler) GetProject(ctx context.Context, req *scriptspb.GetProjectRequest) (*scriptspb.GetProjectResponse, error) {
	// Validate input
	if req.ProjectId == "" {
		return nil, status.Errorf(codes.InvalidArgument, "project_id is required")
	}
	if req.UserId == "" {
		return nil, status.Errorf(codes.InvalidArgument, "user_id is required")
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

func (h *ScriptsHandler) UpdateProject(ctx context.Context, req *scriptspb.UpdateProjectRequest) (*scriptspb.UpdateProjectResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method UpdateProject not implemented")
}

func (h *ScriptsHandler) DeleteProject(ctx context.Context, req *scriptspb.DeleteProjectRequest) (*scriptspb.DeleteProjectResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method DeleteProject not implemented")
}

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

// Outline unit management methods
func (h *ScriptsHandler) CreateOutlineUnit(ctx context.Context, req *scriptspb.CreateOutlineUnitRequest) (*scriptspb.CreateOutlineUnitResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method CreateOutlineUnit not implemented")
}

func (h *ScriptsHandler) GetProjectOutline(ctx context.Context, req *scriptspb.GetProjectOutlineRequest) (*scriptspb.GetProjectOutlineResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method GetProjectOutline not implemented")
}

func (h *ScriptsHandler) UpdateOutlineUnit(ctx context.Context, req *scriptspb.UpdateOutlineUnitRequest) (*scriptspb.UpdateOutlineUnitResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method UpdateOutlineUnit not implemented")
}

func (h *ScriptsHandler) DeleteOutlineUnit(ctx context.Context, req *scriptspb.DeleteOutlineUnitRequest) (*scriptspb.DeleteOutlineUnitResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method DeleteOutlineUnit not implemented")
}

// Scene management methods
func (h *ScriptsHandler) CreateScene(ctx context.Context, req *scriptspb.CreateSceneRequest) (*scriptspb.CreateSceneResponse, error) {
	// Validate request
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
		return nil, status.Errorf(codes.Internal, "failed to create scene: %v", err)
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

func (h *ScriptsHandler) GetProjectScenes(ctx context.Context, req *scriptspb.GetProjectScenesRequest) (*scriptspb.GetProjectScenesResponse, error) {
	// Parse project ID
	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project ID: %v", err)
	}

	// Parse user ID
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
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

func (h *ScriptsHandler) UpdateScene(ctx context.Context, req *scriptspb.UpdateSceneRequest) (*scriptspb.UpdateSceneResponse, error) {
	// Parse scene ID
	sceneID, err := uuid.Parse(req.SceneId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid scene ID: %v", err)
	}

	// Parse user ID
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
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

// Character management methods
func (h *ScriptsHandler) CreateCharacter(ctx context.Context, req *scriptspb.CreateCharacterRequest) (*scriptspb.CreateCharacterResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method CreateCharacter not implemented")
}

func (h *ScriptsHandler) GetProjectCharacters(ctx context.Context, req *scriptspb.GetProjectCharactersRequest) (*scriptspb.GetProjectCharactersResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method GetProjectCharacters not implemented")
}

func (h *ScriptsHandler) UpdateCharacter(ctx context.Context, req *scriptspb.UpdateCharacterRequest) (*scriptspb.UpdateCharacterResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method UpdateCharacter not implemented")
}

// Location management methods
func (h *ScriptsHandler) CreateLocation(ctx context.Context, req *scriptspb.CreateLocationRequest) (*scriptspb.CreateLocationResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method CreateLocation not implemented")
}

func (h *ScriptsHandler) GetProjectLocations(ctx context.Context, req *scriptspb.GetProjectLocationsRequest) (*scriptspb.GetProjectLocationsResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method GetProjectLocations not implemented")
}

// Script element management methods
func (h *ScriptsHandler) CreateScriptElement(ctx context.Context, req *scriptspb.CreateScriptElementRequest) (*scriptspb.CreateScriptElementResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method CreateScriptElement not implemented")
}

func (h *ScriptsHandler) GetProjectScriptElements(ctx context.Context, req *scriptspb.GetProjectScriptElementsRequest) (*scriptspb.GetProjectScriptElementsResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method GetProjectScriptElements not implemented")
}

func (h *ScriptsHandler) UpdateScriptElement(ctx context.Context, req *scriptspb.UpdateScriptElementRequest) (*scriptspb.UpdateScriptElementResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method UpdateScriptElement not implemented")
}

func (h *ScriptsHandler) DeleteScriptElement(ctx context.Context, req *scriptspb.DeleteScriptElementRequest) (*scriptspb.DeleteScriptElementResponse, error) {
	// Parse UUIDs
	elementID, err := uuid.Parse(req.ScriptElementId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid script element ID: %v", err)
	}

	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	// Call service to delete script element
	err = h.service.DeleteScriptElement(ctx, elementID, userID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete script element: %v", err)
	}

	return &scriptspb.DeleteScriptElementResponse{
		Success: true,
	}, nil
}

func (h *ScriptsHandler) BulkUpdateScriptElements(ctx context.Context, req *scriptspb.BulkUpdateScriptElementsRequest) (*scriptspb.BulkUpdateScriptElementsResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method BulkUpdateScriptElements not implemented")
}

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
	domainElements := make([]*domain.ScriptElement, len(req.Elements))
	for i, protoElement := range req.Elements {
		sceneID, err := uuid.Parse(protoElement.SceneId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid scene_id at index %d: %v", i, err)
		}

		var characterID *uuid.UUID
		if protoElement.CharacterId != "" {
			parsedCharacterID, err := uuid.Parse(protoElement.CharacterId)
			if err != nil {
				return nil, status.Errorf(codes.InvalidArgument, "invalid character_id at index %d: %v", i, err)
			}
			characterID = &parsedCharacterID
		}

		domainElements[i] = &domain.ScriptElement{
			ProjectID:   projectID,
			SceneID:     &sceneID,
			Type:        protoElement.Type,
			Content:     protoElement.Content,
			CharacterID: characterID,
			LineNumber:  protoElement.LineNumber,
			Formatting:  protoElement.Formatting,
		}
	}

	// Create elements through service
	createdElements, err := h.service.BatchCreateElements(ctx, userID, projectID, domainElements)
	if err != nil {
		return nil, handleServiceError(err)
	}

	// Convert to protobuf
	protoElements := make([]*scriptspb.ScriptElement, len(createdElements))
	for i, element := range createdElements {
		protoElements[i] = convertElementToProto(element)
	}

	return &scriptspb.BatchCreateElementsResponse{
		CreatedElements: protoElements,
	}, nil
}

// Helper functions
func convertProjectToProto(project *domain.Project) *scriptspb.Project {
	return &scriptspb.Project{
		Id:          project.ID.String(),
		Title:       project.Title,
		Description: project.Description,
		OwnerId:     project.OwnerID.String(),
		Status:      project.Status,
		CreatedAt: &common.Timestamp{
			Seconds: project.CreatedAt.Unix(),
			Nanos:   int32(project.CreatedAt.Nanosecond()),
		},
		UpdatedAt: &common.Timestamp{
			Seconds: project.UpdatedAt.Unix(),
			Nanos:   int32(project.UpdatedAt.Nanosecond()),
		},
	}
}

// Helper function to convert service errors to gRPC errors
func handleServiceError(err error) error {
	switch err {
	case domain.ErrProjectNotFound:
		return status.Errorf(codes.NotFound, "project not found")
	case domain.ErrProjectExists:
		return status.Errorf(codes.AlreadyExists, "project already exists")
	case domain.ErrUnauthorizedAccess:
		return status.Errorf(codes.PermissionDenied, "unauthorized access to project")
	case domain.ErrInvalidProjectData:
		return status.Errorf(codes.InvalidArgument, "invalid project data")
	default:
		return status.Errorf(codes.Internal, "internal server error: %v", err)
	}
}

// CreateElement implements the CreateElement RPC method
func (h *ScriptsHandler) CreateElement(ctx context.Context, req *scriptspb.CreateElementRequest) (*scriptspb.CreateElementResponse, error) {
	// Parse project ID
	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project ID: %v", err)
	}

	// Parse user ID
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	// Parse required scene ID
	sceneID, err := uuid.Parse(req.SceneId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid scene ID: %v", err)
	}

	// Parse optional character ID
	var characterID *uuid.UUID
	if req.CharacterId != nil && *req.CharacterId != "" {
		parsedCharacterID, err := uuid.Parse(*req.CharacterId)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid character ID: %v", err)
		}
		characterID = &parsedCharacterID
	}

	// Create domain element
	element := &domain.ScriptElement{
		ProjectID:   projectID,
		SceneID:     &sceneID,
		Type:        req.ElementType,
		Content:     req.Content,
		CharacterID: characterID,
		LineNumber:  req.LineNumber,
		Formatting:  req.Formatting,
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

// UpdateElement implements the UpdateElement RPC method
func (h *ScriptsHandler) UpdateElement(ctx context.Context, req *scriptspb.UpdateElementRequest) (*scriptspb.UpdateElementResponse, error) {
	// Parse element ID
	elementID, err := uuid.Parse(req.ElementId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid element ID: %v", err)
	}

	// Parse user ID
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
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

// GetSceneElements implements the GetSceneElements RPC method
func (h *ScriptsHandler) GetSceneElements(ctx context.Context, req *scriptspb.GetSceneElementsRequest) (*scriptspb.GetSceneElementsResponse, error) {
	// Parse scene ID
	sceneID, err := uuid.Parse(req.SceneId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid scene ID: %v", err)
	}

	// Parse user ID
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user ID: %v", err)
	}

	// Get elements through service
	elements, err := h.service.GetSceneElements(ctx, userID, sceneID)
	if err != nil {
		return nil, handleServiceError(err)
	}

	// Convert to protobuf
	protoElements := make([]*scriptspb.ScriptElement, len(elements))
	for i, element := range elements {
		protoElements[i] = convertElementToProto(element)
	}

	return &scriptspb.GetSceneElementsResponse{
		Elements: protoElements,
	}, nil
}

// Helper function to convert domain ScriptElement to protobuf
func convertElementToProto(element *domain.ScriptElement) *scriptspb.ScriptElement {
	protoElement := &scriptspb.ScriptElement{
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

	if element.CharacterID != nil {
		protoElement.CharacterId = element.CharacterID.String()
	}

	return protoElement
}

// Helper function to convert domain Scene to protobuf
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

// Beat Board delegation methods
func (h *ScriptsHandler) CreateBeat(ctx context.Context, req *scriptspb.CreateBeatRequest) (*scriptspb.CreateBeatResponse, error) {
	return h.beatBoardHandler.CreateBeat(ctx, req)
}

func (h *ScriptsHandler) GetBeat(ctx context.Context, req *scriptspb.GetBeatRequest) (*scriptspb.GetBeatResponse, error) {
	return h.beatBoardHandler.GetBeat(ctx, req)
}

func (h *ScriptsHandler) GetProjectBeatBoard(ctx context.Context, req *scriptspb.GetProjectBeatBoardRequest) (*scriptspb.GetProjectBeatBoardResponse, error) {
	return h.beatBoardHandler.GetProjectBeatBoard(ctx, req)
}

func (h *ScriptsHandler) UpdateBeat(ctx context.Context, req *scriptspb.UpdateBeatRequest) (*scriptspb.UpdateBeatResponse, error) {
	return h.beatBoardHandler.UpdateBeat(ctx, req)
}

func (h *ScriptsHandler) DeleteBeat(ctx context.Context, req *scriptspb.DeleteBeatRequest) (*scriptspb.DeleteBeatResponse, error) {
	return h.beatBoardHandler.DeleteBeat(ctx, req)
}

func (h *ScriptsHandler) CreateConnection(ctx context.Context, req *scriptspb.CreateConnectionRequest) (*scriptspb.CreateConnectionResponse, error) {
	return h.beatBoardHandler.CreateConnection(ctx, req)
}

func (h *ScriptsHandler) DeleteConnection(ctx context.Context, req *scriptspb.DeleteConnectionRequest) (*scriptspb.DeleteConnectionResponse, error) {
	return h.beatBoardHandler.DeleteConnection(ctx, req)
}

func (h *ScriptsHandler) CreateLane(ctx context.Context, req *scriptspb.CreateLaneRequest) (*scriptspb.CreateLaneResponse, error) {
	return h.beatBoardHandler.CreateLane(ctx, req)
}

func (h *ScriptsHandler) GetProjectLanes(ctx context.Context, req *scriptspb.GetProjectLanesRequest) (*scriptspb.GetProjectLanesResponse, error) {
	return h.beatBoardHandler.GetProjectLanes(ctx, req)
}

func (h *ScriptsHandler) UpdateLane(ctx context.Context, req *scriptspb.UpdateLaneRequest) (*scriptspb.UpdateLaneResponse, error) {
	return h.beatBoardHandler.UpdateLane(ctx, req)
}

func (h *ScriptsHandler) UpdateLaneOrder(ctx context.Context, req *scriptspb.UpdateLaneOrderRequest) (*scriptspb.UpdateLaneOrderResponse, error) {
	return h.beatBoardHandler.UpdateLaneOrder(ctx, req)
}

func (h *ScriptsHandler) DeleteLane(ctx context.Context, req *scriptspb.DeleteLaneRequest) (*scriptspb.DeleteLaneResponse, error) {
	return h.beatBoardHandler.DeleteLane(ctx, req)
}

func (h *ScriptsHandler) CreateOutlineItem(ctx context.Context, req *scriptspb.CreateOutlineItemRequest) (*scriptspb.CreateOutlineItemResponse, error) {
	return h.beatBoardHandler.CreateOutlineItem(ctx, req)
}

func (h *ScriptsHandler) UpdateOutlineItem(ctx context.Context, req *scriptspb.UpdateOutlineItemRequest) (*scriptspb.UpdateOutlineItemResponse, error) {
	return h.beatBoardHandler.UpdateOutlineItem(ctx, req)
}

func (h *ScriptsHandler) DeleteOutlineItem(ctx context.Context, req *scriptspb.DeleteOutlineItemRequest) (*scriptspb.DeleteOutlineItemResponse, error) {
	return h.beatBoardHandler.DeleteOutlineItem(ctx, req)
}
