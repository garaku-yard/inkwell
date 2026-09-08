package scripts

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"inkwell/server/internal/gateway/handlers"
	scriptspb "inkwell/server/pkg/grpc/scripts"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// createBeatBody is the JSON request shape for CreateBeat / UpdateBeat-adjacent fields.
type createBeatBody struct {
	Title        string `json:"title"`
	Description  string `json:"description"`
	SceneNumbers string `json:"sceneNumbers"` // DEPRECATED: Use startPage/endPage
	Color        string `json:"color"`
	Position     *struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	} `json:"position,omitempty"`
	PositionX *float64 `json:"positionX,omitempty"`
	PositionY *float64 `json:"positionY,omitempty"`
	Width     float64  `json:"width"`
	Height    float64  `json:"height"`
	ActNumber int32    `json:"actNumber"`
	Order     int32    `json:"order"`
	StartPage int32    `json:"startPage"`
	EndPage   int32    `json:"endPage"`
	ImageUrl  *string  `json:"imageUrl,omitempty"`
}

// CreateBeat handles POST /projects/{projectID}/beat-board/beats
func (h *ScriptsHandler) CreateBeat(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[createBeatBody, BeatResponse]{
		Method:        http.MethodPost,
		Auth:          true,
		SuccessStatus: http.StatusCreated,
		Decode: func(r *http.Request) (*createBeatBody, error) {
			// Limit request body size to 50MB (base64 images can be large)
			r.Body = http.MaxBytesReader(w, r.Body, 50*1024*1024)

			var req createBeatBody
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				log.Printf("CreateBeat: Error decoding request body: %v", err)
				return nil, errors.New("Invalid request body: " + err.Error())
			}
			return &req, nil
		},
		Handle: func(r *http.Request, userID string, req *createBeatBody) (*BeatResponse, error) {
			projectID := chi.URLParam(r, "projectId")

			role, authErr := handlers.RequireProjectRole(r.Context(), userID, projectID, handlers.ActionEditContent, h.scriptsClient, h.collabClient, h.workspaceClient)
			if authErr != nil {
				return nil, authErr
			}

			log.Printf("CreateBeat: Received request with imageUrl: %v", req.ImageUrl)

			// Handle both nested position object and flat positionX/Y
			var posX, posY float64
			if req.Position != nil {
				posX = req.Position.X
				posY = req.Position.Y
			} else {
				if req.PositionX != nil {
					posX = *req.PositionX
				}
				if req.PositionY != nil {
					posY = *req.PositionY
				}
			}

			resp, err := h.scriptsClient.CreateBeat(r.Context(), &scriptspb.CreateBeatRequest{
				ProjectId:    projectID,
				UserId:       userID,
				CallerRole:   callerRoleToProto(role),
				Title:        req.Title,
				Description:  req.Description,
				SceneNumbers: req.SceneNumbers,
				Color:        req.Color,
				PositionX:    posX,
				PositionY:    posY,
				Width:        req.Width,
				Height:       req.Height,
				ActNumber:    req.ActNumber,
				Order:        req.Order,
				StartPage:    req.StartPage,
				EndPage:      req.EndPage,
				ImageUrl:     req.ImageUrl,
			})

			if err != nil {
				return nil, err
			}

			return transformBeat(resp.Beat), nil
		},
	}.ServeHTTP(w, r)
}

// GetProjectBeatBoard handles GET /projects/{projectID}/beat-board
func (h *ScriptsHandler) GetProjectBeatBoard(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, BeatBoardDataResponse]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*BeatBoardDataResponse, error) {
			projectID := chi.URLParam(r, "projectId")

			role, authErr := handlers.RequireProjectRole(r.Context(), userID, projectID, handlers.ActionRead, h.scriptsClient, h.collabClient, h.workspaceClient)
			if authErr != nil {
				return nil, authErr
			}

			resp, err := h.scriptsClient.GetProjectBeatBoard(r.Context(), &scriptspb.GetProjectBeatBoardRequest{
				ProjectId:  projectID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
			})

			if err != nil {
				return nil, err
			}

			return transformBeatBoardData(resp.BeatBoard), nil
		},
	}.ServeHTTP(w, r)
}

// resolveAccessOrForbidden authorizes userID against projectID for action and
// returns the resolved role — the caller sends userID (always real, Orbit
// #360) and callerRoleToProto(role) on the outgoing scripts request; there is
// no more owner-id-or-bypass-sentinel to collapse to. A denial or a
// resolution failure returns a ready-to-return *apierror.Error (403 for
// denial; whatever handlers.RequireProjectRole makes of a dependency failure
// otherwise — never 403 for the latter). projectID MUST be read from the
// resource being acted on (see the authorize* helpers below), never taken
// from the client, so authorization always runs against the resource's real
// project.
func (h *ScriptsHandler) resolveAccessOrForbidden(ctx context.Context, userID, projectID string, action handlers.ProjectAction) (handlers.ProjectRole, error) {
	return handlers.RequireProjectRole(ctx, userID, projectID, action, h.scriptsClient, h.collabClient, h.workspaceClient)
}

// authorizeResource resolves the project that owns a sub-resource (via the
// scripts service's GetResourceProject lookup) and authorizes the caller
// against it for action, returning the resolved role. The project is read
// from the resource itself, never supplied by the client, so a caller can't
// authorize a project they own while acting on a resource in another. A
// non-nil error means the resource is missing or the caller may not perform
// action; in both cases the mutation must not proceed.
func (h *ScriptsHandler) authorizeResource(ctx context.Context, userID string, resourceType scriptspb.ResourceType, resourceID string, action handlers.ProjectAction) (handlers.ProjectRole, error) {
	resp, err := h.scriptsClient.GetResourceProject(ctx, &scriptspb.GetResourceProjectRequest{
		ResourceType: resourceType,
		ResourceId:   resourceID,
	})
	if err != nil {
		return handlers.RoleNone, err
	}
	return h.resolveAccessOrForbidden(ctx, userID, resp.ProjectId, action)
}

// UpdateBeat handles PUT/PATCH /beats/{beatID}
func (h *ScriptsHandler) UpdateBeat(w http.ResponseWriter, r *http.Request) {
	type updateBeatBody struct {
		Title        *string `json:"title,omitempty"`
		Description  *string `json:"description,omitempty"`
		SceneNumbers *string `json:"sceneNumbers,omitempty"` // DEPRECATED: Use startPage/endPage
		Color        *string `json:"color,omitempty"`
		Position     *struct {
			X float64 `json:"x"`
			Y float64 `json:"y"`
		} `json:"position,omitempty"`
		PositionX *float64 `json:"positionX,omitempty"`
		PositionY *float64 `json:"positionY,omitempty"`
		Width     *float64 `json:"width,omitempty"`
		Height    *float64 `json:"height,omitempty"`
		ActNumber *int32   `json:"actNumber,omitempty"`
		Order     *int32   `json:"order,omitempty"`
		StartPage *int32   `json:"startPage,omitempty"`
		EndPage   *int32   `json:"endPage,omitempty"`
		ImageUrl  *string  `json:"imageUrl,omitempty"`
	}

	handlers.Endpoint[updateBeatBody, BeatResponse]{
		// Registered under both PUT and PATCH — leave Method empty so both verbs work.
		Auth: true,
		Decode: func(r *http.Request) (*updateBeatBody, error) {
			var req updateBeatBody
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return nil, errors.New("Invalid request body")
			}
			return &req, nil
		},
		Handle: func(r *http.Request, userID string, req *updateBeatBody) (*BeatResponse, error) {
			beatID := chi.URLParam(r, "beatId")

			role, err := h.authorizeResource(r.Context(), userID, scriptspb.ResourceType_RESOURCE_TYPE_BEAT, beatID, handlers.ActionEditContent)
			if err != nil {
				return nil, err
			}

			grpcReq := &scriptspb.UpdateBeatRequest{
				BeatId:     beatID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
			}

			if req.Title != nil {
				grpcReq.Title = req.Title
			}
			if req.Description != nil {
				grpcReq.Description = req.Description
			}
			if req.SceneNumbers != nil {
				grpcReq.SceneNumbers = req.SceneNumbers
			}
			if req.Color != nil {
				grpcReq.Color = req.Color
			}
			// Handle both nested position object and flat positionX/Y
			if req.Position != nil {
				grpcReq.PositionX = &req.Position.X
				grpcReq.PositionY = &req.Position.Y
			} else {
				if req.PositionX != nil {
					grpcReq.PositionX = req.PositionX
				}
				if req.PositionY != nil {
					grpcReq.PositionY = req.PositionY
				}
			}
			if req.Width != nil {
				grpcReq.Width = req.Width
			}
			if req.Height != nil {
				grpcReq.Height = req.Height
			}
			if req.ActNumber != nil {
				grpcReq.ActNumber = req.ActNumber
			}
			if req.Order != nil {
				grpcReq.Order = req.Order
			}
			if req.StartPage != nil {
				grpcReq.StartPage = req.StartPage
			}
			if req.EndPage != nil {
				grpcReq.EndPage = req.EndPage
			}
			if req.ImageUrl != nil {
				grpcReq.ImageUrl = req.ImageUrl
			}

			resp, err := h.scriptsClient.UpdateBeat(r.Context(), grpcReq)
			if err != nil {
				return nil, err
			}

			return transformBeat(resp.Beat), nil
		},
	}.ServeHTTP(w, r)
}

// GetBeat handles GET /beats/{beatID}
func (h *ScriptsHandler) GetBeat(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, BeatResponse]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*BeatResponse, error) {
			beatID := chi.URLParam(r, "beatId")

			// Resolve the beat's real project without reading its contents, then
			// authorize before issuing the protected read.
			role, err := h.authorizeResource(r.Context(), userID, scriptspb.ResourceType_RESOURCE_TYPE_BEAT, beatID, handlers.ActionRead)
			if err != nil {
				return nil, err
			}
			resp, err := h.scriptsClient.GetBeat(r.Context(), &scriptspb.GetBeatRequest{
				BeatId:     beatID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
			})
			if err != nil {
				return nil, err
			}

			return transformBeat(resp.Beat), nil
		},
	}.ServeHTTP(w, r)
}

// DeleteBeat handles DELETE /beats/{beatID}
func (h *ScriptsHandler) DeleteBeat(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, struct{}]{
		Method:        http.MethodDelete,
		Auth:          true,
		Decode:        handlers.NoBody[struct{}],
		SuccessStatus: http.StatusNoContent,
		Handle: func(r *http.Request, userID string, _ *struct{}) (*struct{}, error) {
			beatID := chi.URLParam(r, "beatId")

			role, err := h.authorizeResource(r.Context(), userID, scriptspb.ResourceType_RESOURCE_TYPE_BEAT, beatID, handlers.ActionEditContent)
			if err != nil {
				return nil, err
			}

			_, err = h.scriptsClient.DeleteBeat(r.Context(), &scriptspb.DeleteBeatRequest{
				BeatId:     beatID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
			})
			if err != nil {
				return nil, err
			}

			return nil, nil
		},
	}.ServeHTTP(w, r)
}

// CreateConnection handles POST /projects/{projectID}/beat-board/connections
func (h *ScriptsHandler) CreateConnection(w http.ResponseWriter, r *http.Request) {
	type createConnectionBody struct {
		FromBeatID string `json:"fromBeatId"`
		ToBeatID   string `json:"toBeatId"`
		FromSide   string `json:"fromSide"`
		ToSide     string `json:"toSide"`
	}

	handlers.Endpoint[createConnectionBody, ConnectionResponse]{
		Method:        http.MethodPost,
		Auth:          true,
		SuccessStatus: http.StatusCreated,
		Decode: func(r *http.Request) (*createConnectionBody, error) {
			var req createConnectionBody
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return nil, errors.New("Invalid request body")
			}
			return &req, nil
		},
		Handle: func(r *http.Request, userID string, req *createConnectionBody) (*ConnectionResponse, error) {
			projectID := chi.URLParam(r, "projectId")

			role, authErr := handlers.RequireProjectRole(r.Context(), userID, projectID, handlers.ActionEditContent, h.scriptsClient, h.collabClient, h.workspaceClient)
			if authErr != nil {
				return nil, authErr
			}

			resp, err := h.scriptsClient.CreateConnection(r.Context(), &scriptspb.CreateConnectionRequest{
				ProjectId:  projectID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
				FromBeatId: req.FromBeatID,
				ToBeatId:   req.ToBeatID,
				FromSide:   req.FromSide,
				ToSide:     req.ToSide,
			})

			if err != nil {
				return nil, err
			}

			return transformConnection(resp.Connection), nil
		},
	}.ServeHTTP(w, r)
}

// DeleteConnection handles DELETE /connections/{connectionID}
func (h *ScriptsHandler) DeleteConnection(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, struct{}]{
		Method:        http.MethodDelete,
		Auth:          true,
		Decode:        handlers.NoBody[struct{}],
		SuccessStatus: http.StatusNoContent,
		Handle: func(r *http.Request, userID string, _ *struct{}) (*struct{}, error) {
			connectionID := chi.URLParam(r, "connectionId")

			role, err := h.authorizeResource(r.Context(), userID, scriptspb.ResourceType_RESOURCE_TYPE_CONNECTION, connectionID, handlers.ActionEditContent)
			if err != nil {
				return nil, err
			}

			_, err = h.scriptsClient.DeleteConnection(r.Context(), &scriptspb.DeleteConnectionRequest{
				ConnectionId: connectionID,
				UserId:       userID,
				CallerRole:   callerRoleToProto(role),
			})
			if err != nil {
				return nil, err
			}

			return nil, nil
		},
	}.ServeHTTP(w, r)
}

// CreateLane handles POST /projects/{projectID}/beat-board/lanes
func (h *ScriptsHandler) CreateLane(w http.ResponseWriter, r *http.Request) {
	type createLaneBody struct {
		Name  string `json:"name"`
		Color string `json:"color"`
		Order int32  `json:"order"`
	}

	handlers.Endpoint[createLaneBody, LaneResponse]{
		Method:        http.MethodPost,
		Auth:          true,
		SuccessStatus: http.StatusCreated,
		Decode: func(r *http.Request) (*createLaneBody, error) {
			var req createLaneBody
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return nil, errors.New("Invalid request body")
			}
			return &req, nil
		},
		Handle: func(r *http.Request, userID string, req *createLaneBody) (*LaneResponse, error) {
			projectID := chi.URLParam(r, "projectId")

			role, authErr := handlers.RequireProjectRole(r.Context(), userID, projectID, handlers.ActionEditContent, h.scriptsClient, h.collabClient, h.workspaceClient)
			if authErr != nil {
				return nil, authErr
			}

			resp, err := h.scriptsClient.CreateLane(r.Context(), &scriptspb.CreateLaneRequest{
				ProjectId:  projectID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
				Name:       req.Name,
				Color:      req.Color,
				Order:      req.Order,
			})

			if err != nil {
				return nil, err
			}

			return transformLane(resp.Lane), nil
		},
	}.ServeHTTP(w, r)
}

// GetProjectLanes handles GET /projects/{projectID}/beat-board/lanes
func (h *ScriptsHandler) GetProjectLanes(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, []LaneResponse]{
		Method: http.MethodGet,
		Auth:   true,
		Decode: handlers.NoBody[struct{}],
		Handle: func(r *http.Request, userID string, _ *struct{}) (*[]LaneResponse, error) {
			projectID := chi.URLParam(r, "projectId")

			role, authErr := handlers.RequireProjectRole(r.Context(), userID, projectID, handlers.ActionRead, h.scriptsClient, h.collabClient, h.workspaceClient)
			if authErr != nil {
				return nil, authErr
			}

			resp, err := h.scriptsClient.GetProjectLanes(r.Context(), &scriptspb.GetProjectLanesRequest{
				ProjectId:  projectID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
			})

			if err != nil {
				return nil, err
			}

			lanes := make([]LaneResponse, 0, len(resp.Lanes))
			for _, lane := range resp.Lanes {
				if transformed := transformLane(lane); transformed != nil {
					lanes = append(lanes, *transformed)
				}
			}

			return &lanes, nil
		},
	}.ServeHTTP(w, r)
}

// UpdateLane handles PUT /lanes/{laneID}
func (h *ScriptsHandler) UpdateLane(w http.ResponseWriter, r *http.Request) {
	type updateLaneBody struct {
		Name  *string `json:"name,omitempty"`
		Color *string `json:"color,omitempty"`
		Order *int32  `json:"order,omitempty"`
	}

	handlers.Endpoint[updateLaneBody, LaneResponse]{
		// Registered under both PUT and PATCH — leave Method empty so both verbs work.
		Auth: true,
		Decode: func(r *http.Request) (*updateLaneBody, error) {
			var req updateLaneBody
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return nil, errors.New("Invalid request body")
			}
			return &req, nil
		},
		Handle: func(r *http.Request, userID string, req *updateLaneBody) (*LaneResponse, error) {
			laneID := chi.URLParam(r, "laneId")

			role, err := h.authorizeResource(r.Context(), userID, scriptspb.ResourceType_RESOURCE_TYPE_LANE, laneID, handlers.ActionEditContent)
			if err != nil {
				return nil, err
			}

			grpcReq := &scriptspb.UpdateLaneRequest{
				LaneId:     laneID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
			}

			if req.Name != nil {
				grpcReq.Name = req.Name
			}
			if req.Color != nil {
				grpcReq.Color = req.Color
			}
			if req.Order != nil {
				grpcReq.Order = req.Order
			}

			resp, err := h.scriptsClient.UpdateLane(r.Context(), grpcReq)
			if err != nil {
				return nil, err
			}

			return transformLane(resp.Lane), nil
		},
	}.ServeHTTP(w, r)
}

// UpdateLaneOrder handles PUT /projects/{projectID}/beat-board/lanes/order
func (h *ScriptsHandler) UpdateLaneOrder(w http.ResponseWriter, r *http.Request) {
	type updateLaneOrderBody struct {
		LaneIDs    []string `json:"laneIds"`
		OrderedIDs []string `json:"orderedIds"`
	}

	handlers.Endpoint[updateLaneOrderBody, struct{}]{
		// Registered under both PUT and PATCH — leave Method empty so both verbs work.
		Auth:          true,
		SuccessStatus: http.StatusNoContent,
		Decode: func(r *http.Request) (*updateLaneOrderBody, error) {
			var req updateLaneOrderBody
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return nil, errors.New("Invalid request body")
			}
			return &req, nil
		},
		Handle: func(r *http.Request, userID string, req *updateLaneOrderBody) (*struct{}, error) {
			projectID := chi.URLParam(r, "projectId")

			role, authErr := handlers.RequireProjectRole(r.Context(), userID, projectID, handlers.ActionEditContent, h.scriptsClient, h.collabClient, h.workspaceClient)
			if authErr != nil {
				return nil, authErr
			}

			laneIds := req.LaneIDs
			if len(laneIds) == 0 {
				laneIds = req.OrderedIDs
			}

			_, err := h.scriptsClient.UpdateLaneOrder(r.Context(), &scriptspb.UpdateLaneOrderRequest{
				ProjectId:  projectID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
				LaneIds:    laneIds,
			})

			if err != nil {
				return nil, err
			}

			return nil, nil
		},
	}.ServeHTTP(w, r)
}

// DeleteLane handles DELETE /lanes/{laneID}
func (h *ScriptsHandler) DeleteLane(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, struct{}]{
		Method:        http.MethodDelete,
		Auth:          true,
		Decode:        handlers.NoBody[struct{}],
		SuccessStatus: http.StatusNoContent,
		Handle: func(r *http.Request, userID string, _ *struct{}) (*struct{}, error) {
			laneID := chi.URLParam(r, "laneId")

			role, err := h.authorizeResource(r.Context(), userID, scriptspb.ResourceType_RESOURCE_TYPE_LANE, laneID, handlers.ActionEditContent)
			if err != nil {
				return nil, err
			}

			_, err = h.scriptsClient.DeleteLane(r.Context(), &scriptspb.DeleteLaneRequest{
				LaneId:     laneID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
			})
			if err != nil {
				return nil, err
			}

			return nil, nil
		},
	}.ServeHTTP(w, r)
}

// CreateOutlineItem handles POST /projects/{projectID}/beat-board/outline-items
func (h *ScriptsHandler) CreateOutlineItem(w http.ResponseWriter, r *http.Request) {
	type createOutlineItemBody struct {
		BeatID           string  `json:"beatId"`
		LaneID           string  `json:"laneId"`
		Order            int32   `json:"order"`
		TimelinePosition float64 `json:"timelinePosition"`
		Width            float64 `json:"width"`
	}

	handlers.Endpoint[createOutlineItemBody, OutlineItemResponse]{
		Method:        http.MethodPost,
		Auth:          true,
		SuccessStatus: http.StatusCreated,
		Decode: func(r *http.Request) (*createOutlineItemBody, error) {
			var req createOutlineItemBody
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return nil, errors.New("Invalid request body")
			}
			return &req, nil
		},
		Handle: func(r *http.Request, userID string, req *createOutlineItemBody) (*OutlineItemResponse, error) {
			projectID := chi.URLParam(r, "projectId")

			role, authErr := handlers.RequireProjectRole(r.Context(), userID, projectID, handlers.ActionEditContent, h.scriptsClient, h.collabClient, h.workspaceClient)
			if authErr != nil {
				return nil, authErr
			}

			resp, err := h.scriptsClient.CreateOutlineItem(r.Context(), &scriptspb.CreateOutlineItemRequest{
				ProjectId:        projectID,
				UserId:           userID,
				CallerRole:       callerRoleToProto(role),
				BeatId:           req.BeatID,
				LaneId:           req.LaneID,
				Order:            req.Order,
				TimelinePosition: req.TimelinePosition,
				Width:            req.Width,
			})

			if err != nil {
				return nil, err
			}

			return transformOutlineItem(resp.OutlineItem), nil
		},
	}.ServeHTTP(w, r)
}

// UpdateOutlineItem handles PUT /outline-items/{outlineItemID}
func (h *ScriptsHandler) UpdateOutlineItem(w http.ResponseWriter, r *http.Request) {
	type updateOutlineItemBody struct {
		BeatID           *string  `json:"beatId,omitempty"`
		LaneID           *string  `json:"laneId,omitempty"`
		Order            *int32   `json:"order,omitempty"`
		TimelinePosition *float64 `json:"timelinePosition,omitempty"`
		Width            *float64 `json:"width,omitempty"`
	}

	handlers.Endpoint[updateOutlineItemBody, OutlineItemResponse]{
		// Registered under both PUT and PATCH — leave Method empty so both verbs work.
		Auth: true,
		Decode: func(r *http.Request) (*updateOutlineItemBody, error) {
			var req updateOutlineItemBody
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return nil, errors.New("Invalid request body")
			}
			return &req, nil
		},
		Handle: func(r *http.Request, userID string, req *updateOutlineItemBody) (*OutlineItemResponse, error) {
			outlineItemID := chi.URLParam(r, "itemId")

			role, err := h.authorizeResource(r.Context(), userID, scriptspb.ResourceType_RESOURCE_TYPE_OUTLINE_ITEM, outlineItemID, handlers.ActionEditContent)
			if err != nil {
				return nil, err
			}

			grpcReq := &scriptspb.UpdateOutlineItemRequest{
				OutlineItemId: outlineItemID,
				UserId:        userID,
				CallerRole:    callerRoleToProto(role),
			}

			if req.BeatID != nil {
				grpcReq.BeatId = req.BeatID
			}
			if req.LaneID != nil {
				grpcReq.LaneId = req.LaneID
			}
			if req.Order != nil {
				grpcReq.Order = req.Order
			}
			if req.TimelinePosition != nil {
				grpcReq.TimelinePosition = req.TimelinePosition
			}
			if req.Width != nil {
				grpcReq.Width = req.Width
			}

			resp, err := h.scriptsClient.UpdateOutlineItem(r.Context(), grpcReq)
			if err != nil {
				return nil, err
			}

			return transformOutlineItem(resp.OutlineItem), nil
		},
	}.ServeHTTP(w, r)
}

// DeleteOutlineItem handles DELETE /outline-items/{outlineItemID}
func (h *ScriptsHandler) DeleteOutlineItem(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, struct{}]{
		Method:        http.MethodDelete,
		Auth:          true,
		Decode:        handlers.NoBody[struct{}],
		SuccessStatus: http.StatusNoContent,
		Handle: func(r *http.Request, userID string, _ *struct{}) (*struct{}, error) {
			outlineItemID := chi.URLParam(r, "itemId")

			role, err := h.authorizeResource(r.Context(), userID, scriptspb.ResourceType_RESOURCE_TYPE_OUTLINE_ITEM, outlineItemID, handlers.ActionEditContent)
			if err != nil {
				return nil, err
			}

			_, err = h.scriptsClient.DeleteOutlineItem(r.Context(), &scriptspb.DeleteOutlineItemRequest{
				OutlineItemId: outlineItemID,
				UserId:        userID,
				CallerRole:    callerRoleToProto(role),
			})
			if err != nil {
				return nil, err
			}

			return nil, nil
		},
	}.ServeHTTP(w, r)
}

// UploadBeatImage handles POST /beats/upload-image
func (h *ScriptsHandler) UploadBeatImage(w http.ResponseWriter, r *http.Request) {
	log.Printf("UploadBeatImage: Request received")

	if r.Method != http.MethodPost {
		handlers.WriteError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Limit request body size to 10MB
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)

	log.Printf("UploadBeatImage: Starting to parse form")
	// Parse the multipart form with 10MB max memory
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		log.Printf("UploadBeatImage: Error parsing form: %v", err)
		handlers.WriteError(w, "Failed to parse form", http.StatusBadRequest)
		return
	}
	log.Printf("UploadBeatImage: Form parsed")

	file, header, err := r.FormFile("image")
	if err != nil {
		log.Printf("UploadBeatImage: Error getting file: %v", err)
		handlers.WriteError(w, "No image provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	log.Printf("UploadBeatImage: Got file: %s, size: %d", header.Filename, header.Size)

	// Determine file extension from content type
	ext := ".jpg"
	contentType := header.Header.Get("Content-Type")
	if strings.Contains(contentType, "image/png") {
		ext = ".png"
	} else if strings.Contains(contentType, "image/gif") {
		ext = ".gif"
	} else if strings.Contains(contentType, "image/webp") {
		ext = ".webp"
	}

	// Create uploads directory if it doesn't exist
	uploadsDir := "./uploads/beats"
	log.Printf("UploadBeatImage: Creating directory: %s", uploadsDir)
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		log.Printf("UploadBeatImage: Error creating uploads directory: %v", err)
		handlers.WriteError(w, "Failed to save image", http.StatusInternalServerError)
		return
	}

	// Generate unique filename
	filename := fmt.Sprintf("%s-%d%s", uuid.New().String(), time.Now().Unix(), ext)
	filePath := filepath.Join(uploadsDir, filename)
	log.Printf("UploadBeatImage: Will save to: %s", filePath)

	// Create file on disk
	dst, err := os.Create(filePath)
	if err != nil {
		log.Printf("UploadBeatImage: Error creating file: %v", err)
		handlers.WriteError(w, "Failed to save image", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	// Copy uploaded file to disk
	if _, err := dst.ReadFrom(file); err != nil {
		log.Printf("UploadBeatImage: Error copying file: %v", err)
		handlers.WriteError(w, "Failed to save image", http.StatusInternalServerError)
		return
	}

	// Return relative path
	relativePath := fmt.Sprintf("/uploads/beats/%s", filename)
	log.Printf("UploadBeatImage: Saved image to %s", filePath)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"imageUrl": relativePath,
	})
}

// ─── Drawings (decisions/0022) ───────────────────────────────────────────────

// CreateDrawing handles POST /projects/{projectId}/beat-board/drawings
func (h *ScriptsHandler) CreateDrawing(w http.ResponseWriter, r *http.Request) {
	type createDrawingBody struct {
		Kind string `json:"kind"`
		// Passed through untouched — the gateway has no opinion on a shape's
		// geometry, so it never parses it.
		Data  json.RawMessage `json:"data"`
		Order int32           `json:"order"`
	}

	handlers.Endpoint[createDrawingBody, DrawingResponse]{
		Method:        http.MethodPost,
		Auth:          true,
		SuccessStatus: http.StatusCreated,
		Decode: func(r *http.Request) (*createDrawingBody, error) {
			var req createDrawingBody
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return nil, errors.New("Invalid request body")
			}
			return &req, nil
		},
		Handle: func(r *http.Request, userID string, req *createDrawingBody) (*DrawingResponse, error) {
			projectID := chi.URLParam(r, "projectId")

			role, authErr := handlers.RequireProjectRole(r.Context(), userID, projectID, handlers.ActionEditContent, h.scriptsClient, h.collabClient, h.workspaceClient)
			if authErr != nil {
				return nil, authErr
			}

			data := "{}"
			if len(req.Data) > 0 {
				data = string(req.Data)
			}

			resp, err := h.scriptsClient.CreateDrawing(r.Context(), &scriptspb.CreateDrawingRequest{
				ProjectId:  projectID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
				Kind:       req.Kind,
				Data:       data,
				Order:      req.Order,
			})
			if err != nil {
				return nil, err
			}

			return transformDrawing(resp.Drawing), nil
		},
	}.ServeHTTP(w, r)
}

// UpdateDrawing handles PATCH /drawings/{drawingId}
func (h *ScriptsHandler) UpdateDrawing(w http.ResponseWriter, r *http.Request) {
	type updateDrawingBody struct {
		Kind  *string          `json:"kind,omitempty"`
		Data  *json.RawMessage `json:"data,omitempty"`
		Order *int32           `json:"order,omitempty"`
	}

	handlers.Endpoint[updateDrawingBody, DrawingResponse]{
		Method: http.MethodPatch,
		Auth:   true,
		Decode: func(r *http.Request) (*updateDrawingBody, error) {
			var req updateDrawingBody
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return nil, errors.New("Invalid request body")
			}
			return &req, nil
		},
		Handle: func(r *http.Request, userID string, req *updateDrawingBody) (*DrawingResponse, error) {
			drawingID := chi.URLParam(r, "drawingId")

			role, err := h.authorizeResource(r.Context(), userID, scriptspb.ResourceType_RESOURCE_TYPE_DRAWING, drawingID, handlers.ActionEditContent)
			if err != nil {
				return nil, err
			}

			out := &scriptspb.UpdateDrawingRequest{
				DrawingId:  drawingID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
				Kind:       req.Kind,
				Order:      req.Order,
			}
			if req.Data != nil {
				data := string(*req.Data)
				out.Data = &data
			}

			resp, err := h.scriptsClient.UpdateDrawing(r.Context(), out)
			if err != nil {
				return nil, err
			}

			return transformDrawing(resp.Drawing), nil
		},
	}.ServeHTTP(w, r)
}

// DeleteDrawing handles DELETE /drawings/{drawingId}
func (h *ScriptsHandler) DeleteDrawing(w http.ResponseWriter, r *http.Request) {
	handlers.Endpoint[struct{}, struct{}]{
		Method:        http.MethodDelete,
		Auth:          true,
		Decode:        handlers.NoBody[struct{}],
		SuccessStatus: http.StatusNoContent,
		Handle: func(r *http.Request, userID string, _ *struct{}) (*struct{}, error) {
			drawingID := chi.URLParam(r, "drawingId")

			role, err := h.authorizeResource(r.Context(), userID, scriptspb.ResourceType_RESOURCE_TYPE_DRAWING, drawingID, handlers.ActionEditContent)
			if err != nil {
				return nil, err
			}

			_, err = h.scriptsClient.DeleteDrawing(r.Context(), &scriptspb.DeleteDrawingRequest{
				DrawingId:  drawingID,
				UserId:     userID,
				CallerRole: callerRoleToProto(role),
			})
			if err != nil {
				return nil, err
			}

			return nil, nil
		},
	}.ServeHTTP(w, r)
}
