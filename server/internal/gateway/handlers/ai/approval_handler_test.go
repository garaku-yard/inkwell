package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"google.golang.org/grpc"
	"inkwell/server/internal/gateway/application/scriptreads"
	"inkwell/server/internal/gateway/application/scriptwrites"
	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/internal/gateway/handlers/ai/approval"
	"inkwell/server/pkg/aiadapter"
	scriptspb "inkwell/server/pkg/grpc/scripts"
)

type memoryApprovals struct {
	mu     sync.Mutex
	values map[string]approval.Checkpoint
	audits []approval.AuditRecord
}

func (m *memoryApprovals) Create(_ context.Context, c approval.Checkpoint, ttl time.Duration) (approval.Checkpoint, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.values == nil {
		m.values = map[string]approval.Checkpoint{}
	}
	if c.ID == "" {
		c.ID = "cp1"
	}
	c.ExpiresAt = time.Now().Add(ttl)
	m.values[c.ID] = c
	return c, nil
}
func (m *memoryApprovals) take(id, user, project string) (approval.Checkpoint, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.values[id]
	if !ok || c.UserID != user || c.ProjectID != project || (!c.ExpiresAt.IsZero() && time.Now().After(c.ExpiresAt)) {
		return c, approval.ErrNotFound
	}
	delete(m.values, id)
	return c, nil
}
func (m *memoryApprovals) Consume(_ context.Context, id, u, p string) (approval.Checkpoint, error) {
	return m.take(id, u, p)
}
func (m *memoryApprovals) Deny(_ context.Context, id, u, p string) (approval.Checkpoint, error) {
	return m.take(id, u, p)
}
func (m *memoryApprovals) Audit(_ context.Context, a approval.AuditRecord) error {
	m.audits = append(m.audits, a)
	return nil
}

type destructiveScripts struct {
	scriptspb.ScriptsServiceClient
	owner            string
	content          string
	elementType      string
	elementContent   string
	updates, deletes int
}

func (s *destructiveScripts) GetProjectAccessMetadata(context.Context, *scriptspb.GetProjectAccessMetadataRequest, ...grpc.CallOption) (*scriptspb.GetProjectAccessMetadataResponse, error) {
	return &scriptspb.GetProjectAccessMetadataResponse{OwnerId: s.owner}, nil
}
func (s *destructiveScripts) GetResourceProject(context.Context, *scriptspb.GetResourceProjectRequest, ...grpc.CallOption) (*scriptspb.GetResourceProjectResponse, error) {
	return &scriptspb.GetResourceProjectResponse{ProjectId: "p1"}, nil
}
func (s *destructiveScripts) GetProjectScenes(context.Context, *scriptspb.GetProjectScenesRequest, ...grpc.CallOption) (*scriptspb.GetProjectScenesResponse, error) {
	return &scriptspb.GetProjectScenesResponse{Scenes: []*scriptspb.Scene{{Id: "s1", ProjectId: "p1", Content: s.content}}}, nil
}
func (s *destructiveScripts) GetSceneElements(context.Context, *scriptspb.GetSceneElementsRequest, ...grpc.CallOption) (*scriptspb.GetSceneElementsResponse, error) {
	return &scriptspb.GetSceneElementsResponse{}, nil
}
func (s *destructiveScripts) CreateElement(_ context.Context, r *scriptspb.CreateElementRequest, _ ...grpc.CallOption) (*scriptspb.CreateElementResponse, error) {
	s.elementType, s.elementContent = r.ElementType, r.Content
	return &scriptspb.CreateElementResponse{Element: &scriptspb.ProjectElement{Id: "e1", SceneId: r.SceneId, Type: r.ElementType, Content: r.Content}}, nil
}
func (s *destructiveScripts) UpdateScene(_ context.Context, r *scriptspb.UpdateSceneRequest, _ ...grpc.CallOption) (*scriptspb.UpdateSceneResponse, error) {
	s.updates++
	s.content = r.GetContent()
	return &scriptspb.UpdateSceneResponse{Scene: &scriptspb.Scene{Id: "s1", ProjectId: "p1", Content: s.content}}, nil
}
func (s *destructiveScripts) DeleteScene(context.Context, *scriptspb.DeleteSceneRequest, ...grpc.CallOption) (*scriptspb.DeleteSceneResponse, error) {
	s.deletes++
	return &scriptspb.DeleteSceneResponse{Success: true}, nil
}

func approvalRequest(h *AIHandler, id, user, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/ai/approvals/"+id, strings.NewReader(body))
	r = r.WithContext(contextx.WithUserID(r.Context(), user))
	rc := chi.NewRouteContext()
	rc.URLParams.Add("checkpointId", id)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rc))
	w := httptest.NewRecorder()
	h.DecideApproval(w, r)
	return w
}

func TestApprovalApproveReplayWrongUserAndAuthorizationChange(t *testing.T) {
	store := &memoryApprovals{values: map[string]approval.Checkpoint{}}
	scripts := &destructiveScripts{owner: "u1", content: "before"}
	h := &AIHandler{approvals: store, reads: scriptreads.New(scripts, nil, nil), writes: scriptwrites.New(scripts, nil, nil)}
	cp, _ := store.Create(context.Background(), approval.Checkpoint{ID: "cp", UserID: "u1", ProjectID: "p1", Category: "interactive_fiction", Tool: aiadapter.ToolCall{Name: "rewrite_scene", Arguments: `{"scene_id":"s1","content":"after"}`}}, time.Minute)
	if w := approvalRequest(h, cp.ID, "attacker", `{"decision":"approve","projectId":"p1"}`); w.Code != http.StatusNotFound {
		t.Fatalf("wrong user status=%d", w.Code)
	}
	if w := approvalRequest(h, cp.ID, "u1", `{"decision":"approve","projectId":"other"}`); w.Code != http.StatusNotFound {
		t.Fatalf("wrong project status=%d", w.Code)
	}
	// A second handler sharing the durable store models restart/other-replica routing.
	h2 := &AIHandler{approvals: store, reads: scriptreads.New(scripts, nil, nil), writes: scriptwrites.New(scripts, nil, nil)}
	if w := approvalRequest(h2, cp.ID, "u1", `{"decision":"approve","projectId":"p1"}`); w.Code != http.StatusOK {
		t.Fatalf("approve status=%d body=%s", w.Code, w.Body.String())
	}
	if scripts.updates != 1 || scripts.content != "after" || scripts.elementType != "body" || scripts.elementContent != "after" || len(store.audits) != 1 {
		t.Fatalf("updates=%d content=%q element=(%q,%q) audits=%d", scripts.updates, scripts.content, scripts.elementType, scripts.elementContent, len(store.audits))
	}
	if w := approvalRequest(h, cp.ID, "u1", `{"decision":"approve","projectId":"p1"}`); w.Code != http.StatusNotFound || scripts.updates != 1 {
		t.Fatalf("replay status=%d updates=%d", w.Code, scripts.updates)
	}
	cp, _ = store.Create(context.Background(), approval.Checkpoint{ID: "changed", UserID: "u1", ProjectID: "p1", Tool: aiadapter.ToolCall{Name: "delete_scene", Arguments: `{"scene_id":"s1"}`}}, time.Minute)
	scripts.owner = "other"
	if w := approvalRequest(h, cp.ID, "u1", `{"decision":"approve","projectId":"p1"}`); w.Code != http.StatusForbidden || scripts.deletes != 0 {
		t.Fatalf("changed auth status=%d deletes=%d", w.Code, scripts.deletes)
	}
}

func TestApprovalDenyAndExpiry(t *testing.T) {
	store := &memoryApprovals{values: map[string]approval.Checkpoint{}}
	h := &AIHandler{approvals: store}
	store.values["deny"] = approval.Checkpoint{ID: "deny", UserID: "u", ProjectID: "p"}
	if w := approvalRequest(h, "deny", "u", `{"decision":"deny","projectId":"p"}`); w.Code != 200 {
		t.Fatal(w.Code)
	}
	store.values["old"] = approval.Checkpoint{ID: "old", UserID: "u", ProjectID: "p", ExpiresAt: time.Now().Add(-time.Second)}
	if w := approvalRequest(h, "old", "u", `{"decision":"approve","projectId":"p"}`); w.Code != 404 {
		t.Fatal(w.Code)
	}
	_, _ = json.Marshal(store.audits)
}
