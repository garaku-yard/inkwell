package scriptreads

import (
	"context"
	"testing"

	"google.golang.org/grpc"

	scriptspb "inkwell/server/pkg/grpc/scripts"
)

type scriptsStub struct {
	scriptspb.ScriptsServiceClient
	ownerID       string
	projectID     string
	scenes        []*scriptspb.Scene
	elements      []*scriptspb.ProjectElement
	elementsCalls int
	characters    []*scriptspb.Character
	seenUser      string
	seenRole      scriptspb.CallerRole
}

func (s *scriptsStub) GetProjectCharacters(_ context.Context, req *scriptspb.GetProjectCharactersRequest, _ ...grpc.CallOption) (*scriptspb.GetProjectCharactersResponse, error) {
	s.seenUser, s.seenRole = req.UserId, req.CallerRole
	return &scriptspb.GetProjectCharactersResponse{Characters: s.characters}, nil
}

func (s *scriptsStub) GetProjectAccessMetadata(context.Context, *scriptspb.GetProjectAccessMetadataRequest, ...grpc.CallOption) (*scriptspb.GetProjectAccessMetadataResponse, error) {
	return &scriptspb.GetProjectAccessMetadataResponse{OwnerId: s.ownerID}, nil
}

func TestReadCharacterResolvesIDOrCaseInsensitiveNameWithProjectAccess(t *testing.T) {
	stub := &scriptsStub{
		ownerID: "owner-1",
		characters: []*scriptspb.Character{
			{Id: "character-1", ProjectId: "project-1", Name: "Mara"},
		},
	}
	reader := New(stub, nil, nil)

	byName, err := reader.ReadCharacter(context.Background(), "owner-1", "project-1", "mArA")
	if err != nil || byName.GetId() != "character-1" {
		t.Fatalf("character=%#v err=%v", byName, err)
	}
	byID, err := reader.ReadCharacter(context.Background(), "owner-1", "project-1", "character-1")
	if err != nil || byID.GetName() != "Mara" {
		t.Fatalf("character=%#v err=%v", byID, err)
	}
	if stub.seenUser != "owner-1" || stub.seenRole != scriptspb.CallerRole_CALLER_ROLE_OWNER {
		t.Fatalf("actor=%q role=%s", stub.seenUser, stub.seenRole)
	}
}

func (s *scriptsStub) GetProjectScenes(_ context.Context, req *scriptspb.GetProjectScenesRequest, _ ...grpc.CallOption) (*scriptspb.GetProjectScenesResponse, error) {
	s.seenUser, s.seenRole = req.UserId, req.CallerRole
	return &scriptspb.GetProjectScenesResponse{Scenes: s.scenes}, nil
}

func (s *scriptsStub) GetSceneElements(_ context.Context, req *scriptspb.GetSceneElementsRequest, _ ...grpc.CallOption) (*scriptspb.GetSceneElementsResponse, error) {
	s.elementsCalls++
	s.seenUser, s.seenRole = req.UserId, req.CallerRole
	return &scriptspb.GetSceneElementsResponse{Elements: s.elements}, nil
}

func TestReadSceneSharesAuthorizationAndChecksProjectBoundary(t *testing.T) {
	stub := &scriptsStub{
		ownerID: "owner-1", projectID: "project-1",
		scenes:   []*scriptspb.Scene{{Id: "scene-1", ProjectId: "project-1"}},
		elements: []*scriptspb.ProjectElement{{Id: "element-1", SceneId: "scene-1"}},
	}
	reader := New(stub, nil, nil)

	content, err := reader.ReadScene(context.Background(), "owner-1", "project-1", "scene-1")
	if err != nil {
		t.Fatal(err)
	}
	if content.Scene.GetId() != "scene-1" || len(content.Elements) != 1 {
		t.Fatalf("unexpected scene content: %#v", content)
	}
	if stub.seenUser != "owner-1" || stub.seenRole != scriptspb.CallerRole_CALLER_ROLE_OWNER {
		t.Fatalf("scripts assertion actor=%q role=%s", stub.seenUser, stub.seenRole)
	}

	content, err = reader.ReadScene(context.Background(), "owner-1", "project-1", "scene-from-another-project")
	if err != nil {
		t.Fatal(err)
	}
	if content.Scene != nil || stub.elementsCalls != 1 {
		t.Fatalf("foreign scene was read: content=%#v element_calls=%d", content, stub.elementsCalls)
	}
}
