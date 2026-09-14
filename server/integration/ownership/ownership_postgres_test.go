//go:build dbintegration

package ownership_test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	_ "github.com/lib/pq"

	"inkwell/server/internal/collab/repository"
)

func TestOwnerMigrationAndIdempotentProjectCleanup(t *testing.T) {
	dsn := os.Getenv("COLLAB_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("COLLAB_TEST_DATABASE_URL is required")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)

	schema := "ownership_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err := db.Exec(`CREATE SCHEMA ` + schema); err != nil {
		t.Fatal(err)
	}
	defer db.Exec(`DROP SCHEMA ` + schema + ` CASCADE`)
	if _, err := db.Exec(`SET search_path TO ` + schema + `, public`); err != nil {
		t.Fatal(err)
	}

	applySQL(t, db, "../../internal/collab/migrations/000001_init_schema.up.sql")
	projectID := uuid.New()
	ownerID := uuid.New()
	editorID := uuid.New()
	if _, err := db.Exec(`INSERT INTO collaborators (project_id,user_id,role,status,invited_by) VALUES ($1,$2,'owner','active',$2),($1,$3,'editor','active',$2)`, projectID, ownerID, editorID); err != nil {
		t.Fatal(err)
	}
	applySQL(t, db, "../../internal/collab/migrations/000004_remove_owner_collaborators.up.sql")

	var ownerRows, editorRows int
	if err := db.QueryRow(`SELECT count(*) FILTER (WHERE role='owner'), count(*) FILTER (WHERE role='editor') FROM collaborators WHERE project_id=$1`, projectID).Scan(&ownerRows, &editorRows); err != nil {
		t.Fatal(err)
	}
	if ownerRows != 0 || editorRows != 1 {
		t.Fatalf("after migration owner=%d editor=%d, want owner=0 editor=1", ownerRows, editorRows)
	}
	if _, err := db.Exec(`INSERT INTO collaborators (project_id,user_id,role,status,invited_by) VALUES ($1,$2,'owner','active',$2)`, projectID, ownerID); err == nil {
		t.Fatal("owner projection insert succeeded after migration")
	}

	if _, err := db.Exec(`INSERT INTO invitations (project_id,inviter_id,email,role,token,expires_at) VALUES ($1,$2,'invite@example.com','viewer',$3,NOW()+INTERVAL '1 day')`, projectID, ownerID, uuid.NewString()); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO comments (project_id,user_id,content) VALUES ($1,$2,'comment')`, projectID, editorID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO edit_sessions (project_id,user_id) VALUES ($1,$2)`, projectID, editorID); err != nil {
		t.Fatal(err)
	}

	repo := repository.NewPostgresCollaborationRepository(db)
	for i := 0; i < 2; i++ {
		if err := repo.DeleteProjectData(context.Background(), projectID); err != nil {
			t.Fatalf("cleanup attempt %d: %v", i+1, err)
		}
	}
	for _, table := range []string{"collaborators", "invitations", "comments", "edit_sessions"} {
		var count int
		if err := db.QueryRow(fmt.Sprintf(`SELECT count(*) FROM %s WHERE project_id=$1`, table), projectID).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("%s rows after repeated cleanup = %d, want 0", table, count)
		}
	}
}

func applySQL(t *testing.T, db *sql.DB, path string) {
	t.Helper()
	sqlBytes, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(sqlBytes)); err != nil {
		t.Fatalf("apply %s: %v", path, err)
	}
}
