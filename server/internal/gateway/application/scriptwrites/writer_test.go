package scriptwrites

import (
	"context"
	"google.golang.org/grpc"
	"inkwell/server/pkg/grpc/collab"
	scriptspb "inkwell/server/pkg/grpc/scripts"
	workspacepb "inkwell/server/pkg/grpc/workspace"
	"testing"
)

type writeScriptsStub struct {
	scriptspb.ScriptsServiceClient
	owner                                     string
	creates                                   int
	role                                      scriptspb.CallerRole
	projects                                  int
	elementType, elementContent, sceneContent string
}

func (s *writeScriptsStub) CreateProject(_ context.Context, r *scriptspb.CreateProjectRequest, _ ...grpc.CallOption) (*scriptspb.CreateProjectResponse, error) {
	s.projects++
	return &scriptspb.CreateProjectResponse{Project: &scriptspb.Project{Id: "p1", Title: r.Title, OrgId: r.OrgId}}, nil
}

func (s *writeScriptsStub) GetProjectAccessMetadata(context.Context, *scriptspb.GetProjectAccessMetadataRequest, ...grpc.CallOption) (*scriptspb.GetProjectAccessMetadataResponse, error) {
	return &scriptspb.GetProjectAccessMetadataResponse{OwnerId: s.owner}, nil
}
func (s *writeScriptsStub) CreateScene(_ context.Context, r *scriptspb.CreateSceneRequest, _ ...grpc.CallOption) (*scriptspb.CreateSceneResponse, error) {
	s.creates++
	s.role = r.CallerRole
	return &scriptspb.CreateSceneResponse{Scene: &scriptspb.Scene{Id: "s1"}}, nil
}
func (s *writeScriptsStub) GetResourceProject(context.Context, *scriptspb.GetResourceProjectRequest, ...grpc.CallOption) (*scriptspb.GetResourceProjectResponse, error) {
	return &scriptspb.GetResourceProjectResponse{ProjectId: "p"}, nil
}
func (s *writeScriptsStub) GetProjectScenes(context.Context, *scriptspb.GetProjectScenesRequest, ...grpc.CallOption) (*scriptspb.GetProjectScenesResponse, error) {
	return &scriptspb.GetProjectScenesResponse{Scenes: []*scriptspb.Scene{{Id: "s", ProjectId: "p", Content: "before"}}}, nil
}
func (s *writeScriptsStub) GetSceneElements(context.Context, *scriptspb.GetSceneElementsRequest, ...grpc.CallOption) (*scriptspb.GetSceneElementsResponse, error) {
	return &scriptspb.GetSceneElementsResponse{Elements: []*scriptspb.ProjectElement{{Id: "e0", SceneId: "s", Type: "body", Content: "before"}}}, nil
}
func (s *writeScriptsStub) CreateElement(_ context.Context, r *scriptspb.CreateElementRequest, _ ...grpc.CallOption) (*scriptspb.CreateElementResponse, error) {
	s.elementType, s.elementContent = r.ElementType, r.Content
	return &scriptspb.CreateElementResponse{Element: &scriptspb.ProjectElement{Id: "e1", SceneId: r.SceneId, Type: r.ElementType, Content: r.Content}}, nil
}
func (s *writeScriptsStub) UpdateScene(_ context.Context, r *scriptspb.UpdateSceneRequest, _ ...grpc.CallOption) (*scriptspb.UpdateSceneResponse, error) {
	s.sceneContent = r.GetContent()
	return &scriptspb.UpdateSceneResponse{Scene: &scriptspb.Scene{Id: r.SceneId, ProjectId: "p", Content: s.sceneContent}}, nil
}

type writeCollabStub struct {
	collab.CollaborationServiceClient
	role string
}

type writeWorkspaceStub struct {
	workspacepb.WorkspaceServiceClient
	role string
}

func (s writeWorkspaceStub) GetOrgMember(context.Context, *workspacepb.GetOrgMemberRequest, ...grpc.CallOption) (*workspacepb.GetOrgMemberResponse, error) {
	return &workspacepb.GetOrgMemberResponse{Member: &workspacepb.OrgMember{Role: s.role}}, nil
}

func (s writeCollabStub) GetProjectCollaboratorRole(context.Context, *collab.GetProjectCollaboratorRoleRequest, ...grpc.CallOption) (*collab.GetProjectCollaboratorRoleResponse, error) {
	return &collab.GetProjectCollaboratorRoleResponse{Role: s.role, Status: "active"}, nil
}

func TestCreateProjectRequiresOrganizationWritingRole(t *testing.T) {
	for _, tc := range []struct {
		role    string
		allowed bool
	}{{"editor", true}, {"viewer", false}} {
		t.Run(tc.role, func(t *testing.T) {
			s := &writeScriptsStub{}
			_, err := New(s, nil, writeWorkspaceStub{role: tc.role}).CreateProject(context.Background(), "u", CreateProjectInput{Title: "Novel", OrgID: "o1"})
			if (err == nil) != tc.allowed {
				t.Fatalf("err=%v", err)
			}
			if s.projects != map[bool]int{true: 1, false: 0}[tc.allowed] {
				t.Fatalf("project calls=%d", s.projects)
			}
		})
	}
}

func TestCreateSceneRoleMatrix(t *testing.T) {
	for _, tc := range []struct {
		name, user, owner, role string
		want                    bool
		assert                  scriptspb.CallerRole
	}{{"owner", "u", "u", "", true, scriptspb.CallerRole_CALLER_ROLE_OWNER}, {"editor", "u", "other", "editor", true, scriptspb.CallerRole_CALLER_ROLE_EDITOR}, {"viewer", "u", "other", "viewer", false, 0}} {
		t.Run(tc.name, func(t *testing.T) {
			s := &writeScriptsStub{owner: tc.owner}
			_, err := New(s, writeCollabStub{role: tc.role}, nil).CreateScene(context.Background(), tc.user, "p", CreateSceneInput{Heading: "Scene"})
			if (err == nil) != tc.want {
				t.Fatalf("err=%v", err)
			}
			if tc.want && (s.creates != 1 || s.role != tc.assert) {
				t.Fatalf("creates=%d role=%s", s.creates, s.role)
			}
		})
	}
}

func TestAppendToInteractiveFictionCreatesVisibleBodyElement(t *testing.T) {
	s := &writeScriptsStub{owner: "u"}
	_, err := New(s, nil, nil).AppendToScene(context.Background(), "u", "p", "s", "Earth hangs far away.", "interactive_fiction")
	if err != nil {
		t.Fatal(err)
	}
	if s.elementType != "body" || s.elementContent != "Earth hangs far away." || s.sceneContent != "before\n\nEarth hangs far away." {
		t.Fatalf("element=(%q,%q) scene=%q", s.elementType, s.elementContent, s.sceneContent)
	}
}
