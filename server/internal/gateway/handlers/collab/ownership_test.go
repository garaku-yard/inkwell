package collab

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"google.golang.org/grpc"

	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/pkg/grpc/collab"
	"inkwell/server/pkg/grpc/identity"
	"inkwell/server/pkg/grpc/scripts"
)

type ownershipScriptsStub struct {
	scripts.ScriptsServiceClient
	ownerID string
}

func (s ownershipScriptsStub) GetProjectAccessMetadata(context.Context, *scripts.GetProjectAccessMetadataRequest, ...grpc.CallOption) (*scripts.GetProjectAccessMetadataResponse, error) {
	return &scripts.GetProjectAccessMetadataResponse{OwnerId: s.ownerID}, nil
}

type ownershipIdentityStub struct {
	identity.IdentityServiceClient
}

func (ownershipIdentityStub) GetUser(_ context.Context, req *identity.GetUserRequest, _ ...grpc.CallOption) (*identity.GetUserResponse, error) {
	return &identity.GetUserResponse{User: &identity.User{Id: req.UserId, Username: req.UserId}}, nil
}

type ownershipCollabStub struct {
	collab.CollaborationServiceClient
	projectID    string
	ownerID      string
	removeCalled bool
}

func (s *ownershipCollabStub) GetProjectCollaborators(context.Context, *collab.GetProjectCollaboratorsRequest, ...grpc.CallOption) (*collab.GetProjectCollaboratorsResponse, error) {
	return &collab.GetProjectCollaboratorsResponse{Collaborators: []*collab.Collaborator{
		{Id: "legacy-owner-row", ProjectId: s.projectID, UserId: s.ownerID, Role: "owner", Status: "active"},
		{Id: "editor-row", ProjectId: s.projectID, UserId: "editor-1", Role: "editor", Status: "active"},
	}}, nil
}

func (s *ownershipCollabStub) GetResourceProject(context.Context, *collab.GetResourceProjectRequest, ...grpc.CallOption) (*collab.GetResourceProjectResponse, error) {
	return &collab.GetResourceProjectResponse{ProjectId: s.projectID, OwnerUserId: s.ownerID}, nil
}

func (s *ownershipCollabStub) RemoveCollaborator(context.Context, *collab.RemoveCollaboratorRequest, ...grpc.CallOption) (*collab.RemoveCollaboratorResponse, error) {
	s.removeCalled = true
	return &collab.RemoveCollaboratorResponse{Success: true}, nil
}

func ownershipRequest(method, path, userID string) *http.Request {
	req := httptest.NewRequest(method, path, nil)
	return req.WithContext(contextx.WithUserID(req.Context(), userID))
}

func TestCollaboratorListSynthesizesAuthoritativeOwner(t *testing.T) {
	cc := &ownershipCollabStub{projectID: "project-1", ownerID: "owner-1"}
	h := &CollaborationHandler{client: cc, scriptsClient: ownershipScriptsStub{ownerID: cc.ownerID}, identityClient: ownershipIdentityStub{}}
	rec := httptest.NewRecorder()
	h.GetProjectCollaborators(rec, ownershipRequest(http.MethodGet, "/collaborators?project_id=project-1", cc.ownerID))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	var body []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body) != 2 {
		t.Fatalf("collaborators = %v, want synthesized owner plus editor without legacy duplicate", body)
	}
	if body[0]["user_id"] != cc.ownerID || body[0]["role"] != "owner" {
		t.Fatalf("first collaborator = %v, want authoritative owner", body[0])
	}
}

func TestLegacyOwnerProjectionCannotBeRemoved(t *testing.T) {
	cc := &ownershipCollabStub{projectID: "project-1", ownerID: "owner-1"}
	h := &CollaborationHandler{client: cc, scriptsClient: ownershipScriptsStub{ownerID: cc.ownerID}}
	rec := httptest.NewRecorder()
	h.RemoveCollaborator(rec, ownershipRequest(http.MethodDelete, "/collaborators/legacy-owner-row", cc.ownerID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422; body=%s", rec.Code, rec.Body.String())
	}
	if cc.removeCalled {
		t.Fatal("legacy owner projection reached removal RPC")
	}
}
