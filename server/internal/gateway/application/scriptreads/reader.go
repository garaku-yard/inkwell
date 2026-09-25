// Package scriptreads contains authorization-aware project and scene queries
// shared by HTTP handlers and hosted AI tools. It is an application boundary:
// callers choose a transport, while this package owns role resolution and the
// outgoing scripts-service contract.
package scriptreads

import (
	"context"
	"strings"
	"sync"

	"inkwell/server/internal/gateway/handlers"
	"inkwell/server/pkg/grpc/collab"
	"inkwell/server/pkg/grpc/common"
	scriptspb "inkwell/server/pkg/grpc/scripts"
	workspacepb "inkwell/server/pkg/grpc/workspace"
)

type Reader struct {
	scripts   scriptspb.ScriptsServiceClient
	collab    collab.CollaborationServiceClient
	workspace workspacepb.WorkspaceServiceClient
}

func New(scripts scriptspb.ScriptsServiceClient, collabClient collab.CollaborationServiceClient, workspace workspacepb.WorkspaceServiceClient) *Reader {
	return &Reader{scripts: scripts, collab: collabClient, workspace: workspace}
}

type OwnedProjects struct {
	Projects           []*scriptspb.Project
	Pagination         *common.PaginationResponse
	CollaboratorCounts []int
}

func (r *Reader) ListOwnedProjects(ctx context.Context, userID string, page, limit int32) (*OwnedProjects, error) {
	resp, err := r.scripts.GetUserProjects(ctx, &scriptspb.GetUserProjectsRequest{
		UserId: userID, Pagination: &common.PaginationRequest{Page: page, Limit: limit},
	})
	if err != nil {
		return nil, err
	}
	counts := make([]int, len(resp.Projects))
	if r.collab != nil {
		type countResult struct{ index, count int }
		results := make(chan countResult, len(resp.Projects))
		var wg sync.WaitGroup
		for i, project := range resp.Projects {
			wg.Add(1)
			go func(index int, projectID string) {
				defer wg.Done()
				got, err := r.collab.GetProjectCollaborators(ctx, &collab.GetProjectCollaboratorsRequest{
					ProjectId: projectID, UserId: userID, CallerRole: collab.CallerRole_CALLER_ROLE_VIEWER,
				})
				if err == nil {
					results <- countResult{index: index, count: len(got.Collaborators)}
				}
			}(i, project.Id)
		}
		wg.Wait()
		close(results)
		for result := range results {
			counts[result.index] = result.count
		}
	}
	return &OwnedProjects{Projects: resp.Projects, Pagination: resp.Pagination, CollaboratorCounts: counts}, nil
}

func (r *Reader) ListScenes(ctx context.Context, userID, projectID string) ([]*scriptspb.Scene, error) {
	role, err := handlers.RequireProjectRole(ctx, userID, projectID, handlers.ActionRead, r.scripts, r.collab, r.workspace)
	if err != nil {
		return nil, err
	}
	resp, err := r.scripts.GetProjectScenes(ctx, &scriptspb.GetProjectScenesRequest{
		ProjectId: projectID, UserId: userID, CallerRole: handlers.ScriptsCallerRole(role),
	})
	if err != nil {
		return nil, err
	}
	return resp.Scenes, nil
}

func (r *Reader) ListSceneElements(ctx context.Context, userID, sceneID string) ([]*scriptspb.ProjectElement, error) {
	project, err := r.scripts.GetResourceProject(ctx, &scriptspb.GetResourceProjectRequest{
		ResourceType: scriptspb.ResourceType_RESOURCE_TYPE_SCENE, ResourceId: sceneID,
	})
	if err != nil {
		return nil, err
	}
	role, err := handlers.RequireProjectRole(ctx, userID, project.ProjectId, handlers.ActionRead, r.scripts, r.collab, r.workspace)
	if err != nil {
		return nil, err
	}
	return r.sceneElements(ctx, userID, sceneID, role)
}

type SceneContent struct {
	Scene    *scriptspb.Scene
	Elements []*scriptspb.ProjectElement
}

func (r *Reader) ReadScene(ctx context.Context, userID, projectID, sceneID string) (*SceneContent, error) {
	role, err := handlers.RequireProjectRole(ctx, userID, projectID, handlers.ActionRead, r.scripts, r.collab, r.workspace)
	if err != nil {
		return nil, err
	}
	resp, err := r.scripts.GetProjectScenes(ctx, &scriptspb.GetProjectScenesRequest{
		ProjectId: projectID, UserId: userID, CallerRole: handlers.ScriptsCallerRole(role),
	})
	if err != nil {
		return nil, err
	}
	var scene *scriptspb.Scene
	for _, candidate := range resp.Scenes {
		if candidate.Id == sceneID {
			scene = candidate
			break
		}
	}
	if scene == nil {
		return &SceneContent{}, nil
	}
	elements, err := r.sceneElements(ctx, userID, sceneID, role)
	if err != nil {
		return nil, err
	}
	return &SceneContent{Scene: scene, Elements: elements}, nil
}

func (r *Reader) ListCharacters(ctx context.Context, userID, projectID string) ([]*scriptspb.Character, error) {
	role, err := handlers.RequireProjectRole(ctx, userID, projectID, handlers.ActionRead, r.scripts, r.collab, r.workspace)
	if err != nil {
		return nil, err
	}
	resp, err := r.scripts.GetProjectCharacters(ctx, &scriptspb.GetProjectCharactersRequest{
		ProjectId: projectID, UserId: userID, CallerRole: handlers.ScriptsCallerRole(role),
	})
	if err != nil {
		return nil, err
	}
	return resp.Characters, nil
}

func (r *Reader) ReadCharacter(ctx context.Context, userID, projectID, reference string) (*scriptspb.Character, error) {
	characters, err := r.ListCharacters(ctx, userID, projectID)
	if err != nil {
		return nil, err
	}
	for _, character := range characters {
		if character.Id == reference || strings.EqualFold(character.Name, reference) {
			return character, nil
		}
	}
	return nil, nil
}

func (r *Reader) sceneElements(ctx context.Context, userID, sceneID string, role handlers.ProjectRole) ([]*scriptspb.ProjectElement, error) {
	resp, err := r.scripts.GetSceneElements(ctx, &scriptspb.GetSceneElementsRequest{
		SceneId: sceneID, UserId: userID, CallerRole: handlers.ScriptsCallerRole(role),
	})
	if err != nil {
		return nil, err
	}
	return resp.Elements, nil
}
