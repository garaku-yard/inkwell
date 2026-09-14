//go:build dbintegration

package sync_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"

	"inkwell/server/internal/gateway/contextx"
	"inkwell/server/internal/gateway/grpcclient"
	gateway "inkwell/server/internal/gateway/handlers/scripts"
	scriptshandler "inkwell/server/internal/scripts/handler"
	"inkwell/server/internal/scripts/repository"
	"inkwell/server/internal/scripts/service"
	"inkwell/server/pkg/events"
	scriptspb "inkwell/server/pkg/grpc/scripts"
	"inkwell/server/pkg/grpcmeta"
	"inkwell/server/pkg/outbox"
)

func TestOrgProjectSyncPersistsAndReturnsOrgID(t *testing.T) {
	db := syncDatabase(t)
	projectID, ownerID, orgID := uuid.New(), uuid.New(), uuid.New()

	repo := repository.NewRepository(db)
	scriptsSvc := service.NewScriptsService(db, repo, outbox.NewPostgresStore(db, "scripts_outbox"), nil, &events.NoopPublisher{}, nil)
	grpcHandler := scriptshandler.NewScriptsHandler(scriptsSvc, service.NewBeatBoardService(repo))
	listener := bufconn.Listen(1024 * 1024)
	grpcServer := grpc.NewServer(grpc.UnaryInterceptor(grpcmeta.ServerInterceptor("scripts")))
	scriptspb.RegisterScriptsServiceServer(grpcServer, grpcHandler)
	go grpcServer.Serve(listener)
	t.Cleanup(func() { grpcServer.Stop(); listener.Close() })
	conn, err := grpc.NewClient("passthrough:///bufnet", grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) { return listener.Dial() }), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	h := gateway.NewScriptsHandler(&grpcclient.Registry{Scripts: scriptspb.NewScriptsServiceClient(conn)})
	router := chi.NewRouter()
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(contextx.WithUserID(r.Context(), ownerID.String())))
		})
	})
	router.Post("/sync/projects/{projectId}", h.SyncProject)

	push := `{"changes":{"project":{"id":"` + projectID.String() + `","title":"Team script","category":"screenplay","status":"draft","org_id":"` + orgID.String() + `"}}}`
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/sync/projects/"+projectID.String(), strings.NewReader(push)))
	if rec.Code != http.StatusOK {
		t.Fatalf("push status=%d body=%s", rec.Code, rec.Body.String())
	}
	var storedOrgID uuid.UUID
	if err := db.QueryRow(`SELECT org_id FROM projects WHERE project_id=$1`, projectID).Scan(&storedOrgID); err != nil {
		t.Fatal(err)
	}
	if storedOrgID != orgID {
		t.Fatalf("stored org_id=%s, want %s", storedOrgID, orgID)
	}

	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/sync/projects/"+projectID.String(), strings.NewReader(`{}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("pull status=%d body=%s", rec.Code, rec.Body.String())
	}
	var response struct {
		Changes struct {
			Project struct {
				OrgID string `json:"org_id"`
			} `json:"project"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Changes.Project.OrgID != orgID.String() {
		t.Fatalf("pulled org_id=%q, want %s; body=%s", response.Changes.Project.OrgID, orgID, rec.Body.String())
	}
}

func syncDatabase(t *testing.T) *sql.DB {
	dsn := os.Getenv("SYNC_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("SYNC_TEST_DATABASE_URL is required")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	schema := "sync_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err := db.Exec(`CREATE SCHEMA ` + schema); err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`SET search_path TO ` + schema + `, public`); err != nil {
		t.Fatal(err)
	}
	files, err := filepath.Glob("../../internal/scripts/migrations/*.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range files {
		sqlBytes, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(string(sqlBytes)); err != nil {
			t.Fatalf("apply %s: %v", file, err)
		}
	}
	t.Cleanup(func() {
		db.Exec(`DROP SCHEMA ` + schema + ` CASCADE`)
		db.Close()
	})
	return db
}
