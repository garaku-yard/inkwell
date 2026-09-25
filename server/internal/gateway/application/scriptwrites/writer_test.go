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
	characters                                []*scriptspb.Character
	characterCreate                           *scriptspb.CreateCharacterRequest
	characterUpdate                           *scriptspb.UpdateCharacterRequest
	scenes                                    []*scriptspb.Scene
	elements                                  map[string][]*scriptspb.ProjectElement
	updatedElement                            *scriptspb.UpdateElementRequest
}

func (s *writeScriptsStub) GetProjectCharacters(context.Context, *scriptspb.GetProjectCharactersRequest, ...grpc.CallOption) (*scriptspb.GetProjectCharactersResponse, error) {
	return &scriptspb.GetProjectCharactersResponse{Characters: s.characters}, nil
}

func (s *writeScriptsStub) CreateCharacter(_ context.Context, r *scriptspb.CreateCharacterRequest, _ ...grpc.CallOption) (*scriptspb.CreateCharacterResponse, error) {
	s.characterCreate = r
	return &scriptspb.CreateCharacterResponse{Character: &scriptspb.Character{Id: "c1", ProjectId: r.ProjectId, Name: r.Name}}, nil
}

func (s *writeScriptsStub) UpdateCharacter(_ context.Context, r *scriptspb.UpdateCharacterRequest, _ ...grpc.CallOption) (*scriptspb.UpdateCharacterResponse, error) {
	s.characterUpdate = r
	return &scriptspb.UpdateCharacterResponse{Character: &scriptspb.Character{Id: r.CharacterId, ProjectId: "p"}}, nil
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
	if s.scenes != nil {
		return &scriptspb.GetProjectScenesResponse{Scenes: s.scenes}, nil
	}
	return &scriptspb.GetProjectScenesResponse{Scenes: []*scriptspb.Scene{{Id: "s", ProjectId: "p", Content: "before"}}}, nil
}
func (s *writeScriptsStub) GetSceneElements(_ context.Context, request *scriptspb.GetSceneElementsRequest, _ ...grpc.CallOption) (*scriptspb.GetSceneElementsResponse, error) {
	if s.elements != nil {
		return &scriptspb.GetSceneElementsResponse{Elements: s.elements[request.SceneId]}, nil
	}
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
func (s *writeScriptsStub) UpdateElement(_ context.Context, r *scriptspb.UpdateElementRequest, _ ...grpc.CallOption) (*scriptspb.UpdateElementResponse, error) {
	s.updatedElement = r
	return &scriptspb.UpdateElementResponse{Element: &scriptspb.ProjectElement{Id: r.ElementId, Content: r.GetContent()}}, nil
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

func TestCharacterWritesPreventDuplicatesAndPreserveEmptyAttributePatch(t *testing.T) {
	s := &writeScriptsStub{owner: "u", characters: []*scriptspb.Character{{Id: "c1", ProjectId: "p", Name: "Mara"}}}
	w := New(s, nil, nil)
	if _, err := w.CreateCharacter(context.Background(), "u", "p", CreateCharacterInput{Name: " mara "}); err == nil {
		t.Fatal("case-insensitive duplicate character was accepted")
	}
	if s.characterCreate != nil {
		t.Fatal("duplicate reached CreateCharacter")
	}

	empty := map[string]string{}
	if _, err := w.UpdateCharacter(context.Background(), "u", "p", "mArA", UpdateCharacterInput{Attributes: &empty}); err != nil {
		t.Fatal(err)
	}
	if s.characterUpdate == nil || !s.characterUpdate.AttributesSet || s.characterUpdate.Attributes == nil || s.characterUpdate.CharacterId != "c1" {
		t.Fatalf("update request=%#v", s.characterUpdate)
	}
}

func TestRenameInteractiveFictionPassageUpdatesExactLinkTargets(t *testing.T) {
	s := &writeScriptsStub{
		owner: "u",
		scenes: []*scriptspb.Scene{
			{Id: "old", ProjectId: "p", SceneHeading: "Old"},
			{Id: "other", ProjectId: "p", SceneHeading: "Other"},
		},
		elements: map[string][]*scriptspb.ProjectElement{
			"other": {{Id: "linked", SceneId: "other", Content: "[[Open -> Old]] and [[Older]]"}},
		},
	}
	if _, err := New(s, nil, nil).RenameScene(context.Background(), "u", "p", "old", "New", "interactive_fiction"); err != nil {
		t.Fatal(err)
	}
	if s.updatedElement == nil || s.updatedElement.GetContent() != "[[Open -> New]] and [[Older]]" {
		t.Fatalf("updated element=%#v", s.updatedElement)
	}
}
