//go:build dbintegration

package patch_test

import (
	"context"
	"database/sql"
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

func TestBeatPatchHTTPThroughGRPCPersistsZeroEmptyAndOmission(t *testing.T) {
	db := patchDatabase(t)
	projectID, beatID, ownerID := uuid.New(), uuid.New(), uuid.New()
	if _, err := db.Exec(`INSERT INTO projects (project_id,title,description,owner_id,category) VALUES ($1,'Project','',$2,'screenplay')`, projectID, ownerID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO beats (beat_id,project_id,title,description,scene_numbers,color,position_x,position_y,width,height,act_number,beat_order,start_page,end_page) VALUES ($1,$2,'Original','Description','','blue',25,30,180,100,1,9,1,2)`, beatID, projectID); err != nil {
		t.Fatal(err)
	}

	repo := repository.NewRepository(db)
	scriptsSvc := service.NewScriptsService(db, repo, outbox.NewPostgresStore(db, "scripts_outbox"), nil, &events.NoopPublisher{}, nil)
	grpcHandler := scriptshandler.NewScriptsHandler(scriptsSvc, service.NewBeatBoardService(repo))
	listener := bufconn.Listen(1024 * 1024)
	server := grpc.NewServer(grpc.UnaryInterceptor(grpcmeta.ServerInterceptor("scripts")))
	scriptspb.RegisterScriptsServiceServer(server, grpcHandler)
	go server.Serve(listener)
	t.Cleanup(func() { server.Stop(); listener.Close() })
	conn, err := grpc.NewClient("passthrough:///bufnet", grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) { return listener.Dial() }), grpc.WithTransportCredentials(insecure.NewCredentials()), grpc.WithUnaryInterceptor(grpcmeta.ClientInterceptor("scripts")))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	h := gateway.NewScriptsHandler(&grpcclient.Registry{Scripts: scriptspb.NewScriptsServiceClient(conn)})
	router := chi.NewRouter()
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(contextx.WithUserID(grpcmeta.WithCorrelationID(r.Context(), "patch-boundary"), ownerID.String())))
		})
	})
	router.Patch("/beats/{beatId}", h.UpdateBeat)
	req := httptest.NewRequest(http.MethodPatch, "/beats/"+beatID.String(), strings.NewReader(`{"title":"","positionX":0,"order":0}`))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var title string
	var x, width, order int
	if err := db.QueryRow(`SELECT title,position_x,width,beat_order FROM beats WHERE beat_id=$1`, beatID).Scan(&title, &x, &width, &order); err != nil {
		t.Fatal(err)
	}
	if title != "" || x != 0 || order != 0 || width != 180 {
		t.Fatalf("stored title=%q x=%d order=%d width=%d", title, x, order, width)
	}
}

func patchDatabase(t *testing.T) *sql.DB {
	dsn := os.Getenv("PATCH_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("PATCH_TEST_DATABASE_URL is required")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	schema := "patch_" + strings.ReplaceAll(uuid.NewString(), "-", "")
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
	for _, path := range files {
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(string(body)); err != nil {
			t.Fatalf("apply %s: %v", path, err)
		}
	}
	t.Cleanup(func() { db.Exec(`DROP SCHEMA ` + schema + ` CASCADE`); db.Close() })
	return db
}
