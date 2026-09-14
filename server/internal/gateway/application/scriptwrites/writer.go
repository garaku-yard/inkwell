// Package scriptwrites owns authorization-aware script mutations shared by transports.
package scriptwrites

import (
	"context"
	"errors"
	"strings"

	"inkwell/server/internal/gateway/application/scriptreads"
	"inkwell/server/internal/gateway/handlers"
	"inkwell/server/pkg/grpc/collab"
	scriptspb "inkwell/server/pkg/grpc/scripts"
	workspacepb "inkwell/server/pkg/grpc/workspace"
)

type Writer struct {
	scripts   scriptspb.ScriptsServiceClient
	collab    collab.CollaborationServiceClient
	workspace workspacepb.WorkspaceServiceClient
	reads     *scriptreads.Reader
}

func New(s scriptspb.ScriptsServiceClient, c collab.CollaborationServiceClient, w workspacepb.WorkspaceServiceClient) *Writer {
	return &Writer{scripts: s, collab: c, workspace: w, reads: scriptreads.New(s, c, w)}
}

type CreateProjectInput struct{ Title, Description, Category, OrgID string }

func (w *Writer) CreateProject(ctx context.Context, userID string, in CreateProjectInput) (*scriptspb.Project, error) {
	if strings.TrimSpace(in.Title) == "" {
		return nil, errors.New("title is required")
	}
	if in.OrgID != "" {
		role, err := handlers.ResolveOrgRole(ctx, w.workspace, in.OrgID, userID)
		if err != nil || (role != "owner" && role != "admin" && role != "editor") {
			return nil, errors.New("permission denied")
		}
	}
	r, err := w.scripts.CreateProject(ctx, &scriptspb.CreateProjectRequest{Title: in.Title, Description: in.Description, Category: in.Category, OrgId: in.OrgID, OwnerId: userID})
	if err != nil {
		return nil, err
	}
	return r.Project, nil
}

type CreateSceneInput struct {
	Heading, Content, OutlineUnitID string
	OrderIndex                      int32
}

func (w *Writer) CreateScene(ctx context.Context, userID, projectID string, in CreateSceneInput) (*scriptspb.Scene, error) {
	role, err := handlers.RequireProjectRole(ctx, userID, projectID, handlers.ActionEditContent, w.scripts, w.collab, w.workspace)
	if err != nil {
		return nil, err
	}
	r, err := w.scripts.CreateScene(ctx, &scriptspb.CreateSceneRequest{ProjectId: projectID, UserId: userID, CallerRole: handlers.ScriptsCallerRole(role), OutlineUnitId: &in.OutlineUnitID, SceneHeading: in.Heading, Content: in.Content, OrderIndex: in.OrderIndex})
	if err != nil {
		return nil, err
	}
	return r.Scene, nil
}

func (w *Writer) sceneRole(ctx context.Context, userID, projectID, sceneID string) (handlers.ProjectRole, error) {
	p, err := w.scripts.GetResourceProject(ctx, &scriptspb.GetResourceProjectRequest{ResourceType: scriptspb.ResourceType_RESOURCE_TYPE_SCENE, ResourceId: sceneID})
	if err != nil {
		return handlers.RoleNone, err
	}
	if p.ProjectId != projectID {
		return handlers.RoleNone, errors.New("scene does not belong to this project")
	}
	return handlers.RequireProjectRole(ctx, userID, p.ProjectId, handlers.ActionEditContent, w.scripts, w.collab, w.workspace)
}
func (w *Writer) RenameScene(ctx context.Context, userID, projectID, sceneID, heading string) (*scriptspb.Scene, error) {
	if strings.TrimSpace(heading) == "" {
		return nil, errors.New("scene_heading is required")
	}
	role, err := w.sceneRole(ctx, userID, projectID, sceneID)
	if err != nil {
		return nil, err
	}
	r, err := w.scripts.UpdateScene(ctx, &scriptspb.UpdateSceneRequest{SceneId: sceneID, UserId: userID, CallerRole: handlers.ScriptsCallerRole(role), SceneHeading: &heading})
	if err != nil {
		return nil, err
	}
	return r.Scene, nil
}
func (w *Writer) AppendToScene(ctx context.Context, userID, projectID, sceneID, content, category string) (*scriptspb.Scene, error) {
	if content == "" {
		return nil, errors.New("content is required")
	}
	current, err := w.reads.ReadScene(ctx, userID, projectID, sceneID)
	if err != nil {
		return nil, err
	}
	if current.Scene == nil {
		return nil, errors.New("scene not found")
	}
	role, err := w.sceneRole(ctx, userID, projectID, sceneID)
	if err != nil {
		return nil, err
	}
	callerRole := handlers.ScriptsCallerRole(role)
	if _, err = w.scripts.CreateElement(ctx, &scriptspb.CreateElementRequest{
		ProjectId: projectID, UserId: userID, CallerRole: callerRole, SceneId: sceneID,
		ElementType: elementTypeForCategory(category), Content: content, LineNumber: int32(len(current.Elements) + 1),
	}); err != nil {
		return nil, err
	}
	next := strings.TrimSpace(current.Scene.Content)
	if next != "" {
		next += "\n\n"
	}
	next += content
	r, err := w.scripts.UpdateScene(ctx, &scriptspb.UpdateSceneRequest{SceneId: sceneID, UserId: userID, CallerRole: handlers.ScriptsCallerRole(role), Content: &next})
	if err != nil {
		return nil, err
	}
	return r.Scene, nil
}

func elementTypeForCategory(category string) string {
	switch category {
	case "screenplay":
		return "ACTION"
	case "comic_script":
		return "panel"
	case "poetry", "lyrics":
		return "line"
	case "interactive_fiction", "tabletop_rpg":
		return "body"
	default:
		return "paragraph"
	}
}

type AddBeatInput struct {
	Title, Description, Color string
	ActNumber, Order          int32
}

func (w *Writer) AddBeat(ctx context.Context, userID, projectID string, in AddBeatInput) (*scriptspb.Beat, error) {
	if strings.TrimSpace(in.Title) == "" {
		return nil, errors.New("title is required")
	}
	role, err := handlers.RequireProjectRole(ctx, userID, projectID, handlers.ActionEditContent, w.scripts, w.collab, w.workspace)
	if err != nil {
		return nil, err
	}
	r, err := w.scripts.CreateBeat(ctx, &scriptspb.CreateBeatRequest{ProjectId: projectID, UserId: userID, CallerRole: handlers.ScriptsCallerRole(role), Title: in.Title, Description: in.Description, Color: in.Color, ActNumber: in.ActNumber, Order: in.Order})
	if err != nil {
		return nil, err
	}
	return r.Beat, nil
}

func (w *Writer) RewriteScene(ctx context.Context, userID, projectID, sceneID, content, category string) (*scriptspb.Scene, error) {
	role, err := w.sceneRole(ctx, userID, projectID, sceneID)
	if err != nil {
		return nil, err
	}
	current, err := w.reads.ReadScene(ctx, userID, projectID, sceneID)
	if err != nil {
		return nil, err
	}
	elementType := elementTypeForCategory(category)
	callerRole := handlers.ScriptsCallerRole(role)
	if len(current.Elements) == 0 {
		if _, err = w.scripts.CreateElement(ctx, &scriptspb.CreateElementRequest{ProjectId: projectID, UserId: userID, CallerRole: callerRole, SceneId: sceneID, ElementType: elementType, Content: content, LineNumber: 1}); err != nil {
			return nil, err
		}
	} else {
		first := current.Elements[0]
		if _, err = w.scripts.UpdateElement(ctx, &scriptspb.UpdateElementRequest{ElementId: first.Id, UserId: userID, CallerRole: callerRole, Content: &content, Type: &elementType}); err != nil {
			return nil, err
		}
		for _, element := range current.Elements[1:] {
			if _, err = w.scripts.DeleteScriptElement(ctx, &scriptspb.DeleteScriptElementRequest{ScriptElementId: element.Id, UserId: userID, CallerRole: callerRole}); err != nil {
				return nil, err
			}
		}
	}
	r, err := w.scripts.UpdateScene(ctx, &scriptspb.UpdateSceneRequest{SceneId: sceneID, UserId: userID, CallerRole: handlers.ScriptsCallerRole(role), Content: &content})
	if err != nil {
		return nil, err
	}
	return r.Scene, nil
}
func (w *Writer) DeleteScene(ctx context.Context, userID, projectID, sceneID string) (*scriptreads.SceneContent, error) {
	before, err := w.reads.ReadScene(ctx, userID, projectID, sceneID)
	if err != nil {
		return nil, err
	}
	if before.Scene == nil {
		return nil, errors.New("scene not found")
	}
	role, err := w.sceneRole(ctx, userID, projectID, sceneID)
	if err != nil {
		return nil, err
	}
	_, err = w.scripts.DeleteScene(ctx, &scriptspb.DeleteSceneRequest{SceneId: sceneID, UserId: userID, CallerRole: handlers.ScriptsCallerRole(role)})
	if err != nil {
		return nil, err
	}
	return before, nil
}
