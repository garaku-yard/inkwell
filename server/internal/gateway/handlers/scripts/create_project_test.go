package scripts

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"google.golang.org/grpc"

	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/pkg/grpc/collab"
	scriptspb "inkwell/server/pkg/grpc/scripts"
)

type createProjectScriptsStub struct {
	scriptspb.ScriptsServiceClient
}

func (createProjectScriptsStub) CreateProject(_ context.Context, req *scriptspb.CreateProjectRequest, _ ...grpc.CallOption) (*scriptspb.CreateProjectResponse, error) {
	return &scriptspb.CreateProjectResponse{Project: &scriptspb.Project{
		Id: "project-1", Title: req.Title, OwnerId: req.OwnerId, Category: req.Category,
	}}, nil
}

type unavailableCollabStub struct {
	collab.CollaborationServiceClient
	called bool
}

func (s *unavailableCollabStub) AddCollaboratorDirect(context.Context, *collab.AddCollaboratorDirectRequest, ...grpc.CallOption) (*collab.AddCollaboratorDirectResponse, error) {
	s.called = true
	return nil, context.DeadlineExceeded
}

func TestCreateProjectDoesNotDependOnCollab(t *testing.T) {
	cc := &unavailableCollabStub{}
	h := &ScriptsHandler{scriptsClient: createProjectScriptsStub{}, collabClient: cc}
	req := httptest.NewRequest(http.MethodPost, "/projects", strings.NewReader(`{"title":"Independent project","category":"prose"}`))
	req = req.WithContext(contextx.WithUserID(req.Context(), "owner-1"))
	rec := httptest.NewRecorder()

	h.CreateProject(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	if cc.called {
		t.Fatal("project creation called collab-service")
	}
}
