package scripts

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"google.golang.org/grpc"

	"inkwell/server/internal/gateway/contextx"
	scriptspb "inkwell/server/pkg/grpc/scripts"
)

type syncScriptsStub struct {
	scriptspb.ScriptsServiceClient
	req *scriptspb.SyncProjectRequest
}

func (s *syncScriptsStub) SyncProject(_ context.Context, req *scriptspb.SyncProjectRequest, _ ...grpc.CallOption) (*scriptspb.SyncProjectResponse, error) {
	s.req = req
	return &scriptspb.SyncProjectResponse{Changes: req.Changes}, nil
}

func TestSyncProjectPreservesOrgIDAcrossGateway(t *testing.T) {
	stub := &syncScriptsStub{}
	h := &ScriptsHandler{scriptsClient: stub}
	router := chi.NewRouter()
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(contextx.WithUserID(r.Context(), "owner-1")))
		})
	})
	router.Post("/sync/projects/{projectId}", h.SyncProject)

	req := httptest.NewRequest(http.MethodPost, "/sync/projects/project-1", strings.NewReader(
		`{"changes":{"project":{"id":"project-1","title":"Team script","org_id":"org-1"}}}`,
	))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if got := stub.req.GetChanges().GetProject().GetOrgId(); got != "org-1" {
		t.Fatalf("gRPC request org_id = %q, want org-1", got)
	}
	if !strings.Contains(rec.Body.String(), `"org_id":"org-1"`) {
		t.Fatalf("response dropped org_id: %s", rec.Body.String())
	}
}
