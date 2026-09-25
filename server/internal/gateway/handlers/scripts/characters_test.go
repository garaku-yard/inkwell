package scripts

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"google.golang.org/grpc"

	"inkwell/server/internal/gateway/contextx"
	scriptspb "inkwell/server/pkg/grpc/scripts"
)

type characterScriptsStub struct {
	scriptspb.ScriptsServiceClient
	ownerID, projectID string
	characters         []*scriptspb.Character
	created            *scriptspb.CreateCharacterRequest
	updated            *scriptspb.UpdateCharacterRequest
	deleted            *scriptspb.DeleteCharacterRequest
}

func (s *characterScriptsStub) GetProjectAccessMetadata(context.Context, *scriptspb.GetProjectAccessMetadataRequest, ...grpc.CallOption) (*scriptspb.GetProjectAccessMetadataResponse, error) {
	return &scriptspb.GetProjectAccessMetadataResponse{OwnerId: s.ownerID}, nil
}

func (s *characterScriptsStub) GetResourceProject(_ context.Context, req *scriptspb.GetResourceProjectRequest, _ ...grpc.CallOption) (*scriptspb.GetResourceProjectResponse, error) {
	if req.ResourceType != scriptspb.ResourceType_RESOURCE_TYPE_CHARACTER {
		panic("character route used the wrong resource type")
	}
	return &scriptspb.GetResourceProjectResponse{ProjectId: s.projectID}, nil
}

func (s *characterScriptsStub) CreateCharacter(_ context.Context, req *scriptspb.CreateCharacterRequest, _ ...grpc.CallOption) (*scriptspb.CreateCharacterResponse, error) {
	s.created = req
	character := &scriptspb.Character{Id: "character-1", ProjectId: req.ProjectId, Name: req.Name, Description: req.Description, Role: req.Role, Attributes: req.Attributes}
	s.characters = append(s.characters, character)
	return &scriptspb.CreateCharacterResponse{Character: character}, nil
}

func (s *characterScriptsStub) GetProjectCharacters(_ context.Context, req *scriptspb.GetProjectCharactersRequest, _ ...grpc.CallOption) (*scriptspb.GetProjectCharactersResponse, error) {
	if req.UserId != s.ownerID || req.CallerRole != scriptspb.CallerRole_CALLER_ROLE_OWNER {
		panic("list lost the authenticated actor or resolved role")
	}
	return &scriptspb.GetProjectCharactersResponse{Characters: s.characters}, nil
}

func (s *characterScriptsStub) UpdateCharacter(_ context.Context, req *scriptspb.UpdateCharacterRequest, _ ...grpc.CallOption) (*scriptspb.UpdateCharacterResponse, error) {
	s.updated = req
	return &scriptspb.UpdateCharacterResponse{Character: &scriptspb.Character{Id: req.CharacterId, ProjectId: s.projectID, Name: req.GetName(), Attributes: req.Attributes}}, nil
}

func (s *characterScriptsStub) DeleteCharacter(_ context.Context, req *scriptspb.DeleteCharacterRequest, _ ...grpc.CallOption) (*scriptspb.DeleteCharacterResponse, error) {
	s.deleted = req
	return &scriptspb.DeleteCharacterResponse{Success: true}, nil
}

func characterRouter(h *ScriptsHandler, actor string) *chi.Mux {
	router := chi.NewRouter()
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(contextx.WithUserID(r.Context(), actor)))
		})
	})
	router.Route("/characters", func(r chi.Router) {
		r.Get("/", h.GetProjectCharacters)
		r.Post("/", h.CreateCharacter)
		r.Patch("/{characterId}", h.UpdateCharacter)
		r.Delete("/{characterId}", h.DeleteCharacter)
	})
	return router
}

func TestCharacterHTTPCRUDPreservesActorRoleAndPatchPresence(t *testing.T) {
	stub := &characterScriptsStub{ownerID: "owner-1", projectID: "project-1"}
	h := &ScriptsHandler{scriptsClient: stub, collabClient: &fakeCollabClient{}}
	router := characterRouter(h, stub.ownerID)

	req := httptest.NewRequest(http.MethodPost, "/characters/", strings.NewReader(`{"project_id":"project-1","name":"Mara","role":"protagonist","attributes":{"voice":"terse"}}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", rec.Code, rec.Body.String())
	}
	if stub.created.UserId != stub.ownerID || stub.created.CallerRole != scriptspb.CallerRole_CALLER_ROLE_OWNER || stub.created.Attributes["voice"] != "terse" {
		t.Fatalf("create request lost authorization/profile data: %#v", stub.created)
	}

	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/characters/?project_id=project-1", nil))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"name":"Mara"`) {
		t.Fatalf("list status=%d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/characters/character-1", strings.NewReader(`{"description":"","attributes":{}}`))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("update status=%d body=%s", rec.Code, rec.Body.String())
	}
	if stub.updated.Description == nil || *stub.updated.Description != "" || !stub.updated.AttributesSet || stub.updated.Attributes == nil || stub.updated.Name != nil {
		t.Fatalf("patch presence was not preserved: %#v", stub.updated)
	}

	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/characters/character-1", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("delete status=%d body=%s", rec.Code, rec.Body.String())
	}
	if stub.deleted.UserId != stub.ownerID || stub.deleted.CallerRole != scriptspb.CallerRole_CALLER_ROLE_OWNER {
		t.Fatalf("delete lost actor/role: %#v", stub.deleted)
	}
	var body map[string]bool
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || !body["success"] {
		t.Fatalf("delete response=%s err=%v", rec.Body.String(), err)
	}
}

func TestCharacterMutationRejectsNonMemberBeforeDispatch(t *testing.T) {
	stub := &characterScriptsStub{ownerID: "owner-1", projectID: "project-1"}
	h := &ScriptsHandler{scriptsClient: stub, collabClient: &fakeCollabClient{}}
	rec := httptest.NewRecorder()
	characterRouter(h, "intruder").ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/characters/character-1", nil))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if stub.deleted != nil {
		t.Fatal("unauthorized delete reached scripts service")
	}
}
