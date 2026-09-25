// Package scriptwrites owns authorization-aware script mutations shared by transports.
package scriptwrites

import (
	"context"
	"errors"
	"fmt"
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

type CreateCharacterInput struct {
	Name, Description, Role string
	Attributes              map[string]string
}

func (w *Writer) CreateCharacter(ctx context.Context, userID, projectID string, in CreateCharacterInput) (*scriptspb.Character, error) {
	if strings.TrimSpace(in.Name) == "" {
		return nil, errors.New("name is required")
	}
	existing, err := w.reads.ListCharacters(ctx, userID, projectID)
	if err != nil {
		return nil, err
	}
	for _, character := range existing {
		if strings.EqualFold(character.Name, strings.TrimSpace(in.Name)) {
			return nil, fmt.Errorf("a character named %q already exists", strings.TrimSpace(in.Name))
		}
	}
	role, err := handlers.RequireProjectRole(ctx, userID, projectID, handlers.ActionEditContent, w.scripts, w.collab, w.workspace)
	if err != nil {
		return nil, err
	}
	resp, err := w.scripts.CreateCharacter(ctx, &scriptspb.CreateCharacterRequest{
		ProjectId: projectID, UserId: userID, CallerRole: handlers.ScriptsCallerRole(role),
		Name: strings.TrimSpace(in.Name), Description: in.Description, Role: in.Role, Attributes: in.Attributes,
	})
	if err != nil {
		return nil, err
	}
	return resp.Character, nil
}

type UpdateCharacterInput struct {
	Name, Description, Role *string
	Attributes              *map[string]string
}

func (w *Writer) UpdateCharacter(ctx context.Context, userID, projectID, reference string, in UpdateCharacterInput) (*scriptspb.Character, error) {
	current, err := w.reads.ReadCharacter(ctx, userID, projectID, reference)
	if err != nil {
		return nil, err
	}
	if current == nil {
		return nil, errors.New("character not found")
	}
	role, err := handlers.RequireProjectRole(ctx, userID, projectID, handlers.ActionEditContent, w.scripts, w.collab, w.workspace)
	if err != nil {
		return nil, err
	}
	req := &scriptspb.UpdateCharacterRequest{
		CharacterId: current.Id, UserId: userID, CallerRole: handlers.ScriptsCallerRole(role),
		Name: in.Name, Description: in.Description, Role: in.Role,
	}
	if in.Attributes != nil {
		req.Attributes = *in.Attributes
		req.AttributesSet = true
	}
	resp, err := w.scripts.UpdateCharacter(ctx, req)
	if err != nil {
		return nil, err
	}
	return resp.Character, nil
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
func (w *Writer) RenameScene(ctx context.Context, userID, projectID, sceneID, heading string, category ...string) (*scriptspb.Scene, error) {
	if strings.TrimSpace(heading) == "" {
		return nil, errors.New("scene_heading is required")
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
	if len(category) > 0 && category[0] == "interactive_fiction" {
		scenes, listErr := w.reads.ListScenes(ctx, userID, projectID)
		if listErr != nil {
			return nil, listErr
		}
		for _, scene := range scenes {
			content, readErr := w.reads.ReadScene(ctx, userID, projectID, scene.Id)
			if readErr != nil {
				return nil, readErr
			}
			for _, element := range content.Elements {
				next := renamePassageLinks(element.Content, current.Scene.SceneHeading, heading)
				if next == element.Content {
					continue
				}
				if _, updateErr := w.scripts.UpdateElement(ctx, &scriptspb.UpdateElementRequest{
					ElementId: element.Id, UserId: userID, CallerRole: handlers.ScriptsCallerRole(role), Content: &next,
				}); updateErr != nil {
					return nil, updateErr
				}
			}
		}
	}
	r, err := w.scripts.UpdateScene(ctx, &scriptspb.UpdateSceneRequest{SceneId: sceneID, UserId: userID, CallerRole: handlers.ScriptsCallerRole(role), SceneHeading: &heading})
	if err != nil {
		return nil, err
	}
	return r.Scene, nil
}

func renamePassageLinks(content, previous, next string) string {
	wanted := strings.ToLower(strings.TrimSpace(previous))
	for offset := 0; ; {
		start := strings.Index(content[offset:], "[[")
		if start < 0 {
			return content
		}
		start += offset
		end := strings.Index(content[start+2:], "]]")
		if end < 0 {
			return content
		}
		end += start + 2
		inner := content[start+2 : end]
		targetStart, targetEnd := 0, len(inner)
		if arrow := strings.LastIndex(inner, "->"); arrow >= 0 {
			targetStart = arrow + 2
		} else if pipe := strings.Index(inner, "|"); pipe >= 0 {
			targetEnd = pipe
		}
		target := strings.TrimSpace(inner[targetStart:targetEnd])
		if strings.ToLower(target) == wanted {
			leading := len(inner[targetStart:targetEnd]) - len(strings.TrimLeft(inner[targetStart:targetEnd], " \t"))
			trailing := len(inner[targetStart:targetEnd]) - len(strings.TrimRight(inner[targetStart:targetEnd], " \t"))
			replacement := inner[:targetStart+leading] + next + inner[targetEnd-trailing:]
			content = content[:start+2] + replacement + content[end:]
			end = start + 2 + len(replacement)
		}
		offset = end + 2
	}
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
