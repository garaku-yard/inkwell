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
	owner    string
	creates  int
	role     scriptspb.CallerRole
	projects int
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
