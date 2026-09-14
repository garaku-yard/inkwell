//go:build dbintegration

package outbox_test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"

	"inkwell/server/pkg/outbox"
)

func TestTwoPollersLeaseEachEventOnceAndRecoverExpiredClaims(t *testing.T) {
	db, table := openDatabase(t)
	store := outbox.NewPostgresStore(db, table)
	ctx := context.Background()
	for i := 0; i < 20; i++ {
		_, err := db.Exec(fmt.Sprintf(`INSERT INTO %s (id,event_type,payload) VALUES ($1,'test.event',$2)`, table), uuid.New(), []byte(`{"n":1}`))
		if err != nil {
			t.Fatal(err)
		}
	}

	start := make(chan struct{})
	var wg sync.WaitGroup
	claimed := make(chan outbox.Event, 40)
	for _, claimant := range []string{"poller-a", "poller-b"} {
		wg.Add(1)
		go func(claimant string) {
			defer wg.Done()
			<-start
			events, err := store.ClaimPending(ctx, claimant, 20, time.Minute)
			if err != nil {
				t.Error(err)
				return
			}
			for _, event := range events {
				claimed <- event
			}
		}(claimant)
	}
	close(start)
	wg.Wait()
	close(claimed)
	seen := map[uuid.UUID]string{}
	for event := range claimed {
		if prior, ok := seen[event.ID]; ok {
			t.Fatalf("event %s claimed concurrently by %s and %s", event.ID, prior, event.ClaimedBy)
		}
		seen[event.ID] = event.ClaimedBy
	}
	if len(seen) != 20 {
		t.Fatalf("claimed %d events, want 20", len(seen))
	}

	var abandoned uuid.UUID
	for id := range seen {
		abandoned = id
		break
	}
	if _, err := db.Exec(fmt.Sprintf(`UPDATE %s SET claimed_at=NOW()-INTERVAL '2 minutes' WHERE id=$1`, table), abandoned); err != nil {
		t.Fatal(err)
	}
	reclaimed, err := store.ClaimPending(ctx, "recovery", 1, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if len(reclaimed) != 1 || reclaimed[0].ID != abandoned || reclaimed[0].Attempt != 2 {
		t.Fatalf("reclaimed = %+v, want abandoned event on attempt 2", reclaimed)
	}
}

func TestFailureMetadataAndPoisonVisibility(t *testing.T) {
	db, table := openDatabase(t)
	store := outbox.NewPostgresStore(db, table)
	id := uuid.New()
	if _, err := db.Exec(fmt.Sprintf(`INSERT INTO %s (id,event_type,payload) VALUES ($1,'poison.event',$2)`, table), id, []byte(`{}`)); err != nil {
		t.Fatal(err)
	}
	for attempt := 1; attempt <= 3; attempt++ {
		events, err := store.ClaimPending(context.Background(), "poller", 1, time.Minute)
		if err != nil || len(events) != 1 {
			t.Fatalf("claim %d: events=%d err=%v", attempt, len(events), err)
		}
		if err := store.MarkFailed(context.Background(), id, "poller", "schema rejected", 3); err != nil {
			t.Fatal(err)
		}
	}
	var attempts int
	var lastError string
	var deadLettered bool
	if err := db.QueryRow(fmt.Sprintf(`SELECT attempts,last_error,dead_lettered_at IS NOT NULL FROM %s WHERE id=$1`, table), id).Scan(&attempts, &lastError, &deadLettered); err != nil {
		t.Fatal(err)
	}
	if attempts != 3 || lastError != "schema rejected" || !deadLettered {
		t.Fatalf("attempts=%d error=%q dead=%v", attempts, lastError, deadLettered)
	}
	events, err := store.ClaimPending(context.Background(), "other", 1, 0)
	if err != nil || len(events) != 0 {
		t.Fatalf("poison event was claimable: events=%d err=%v", len(events), err)
	}
}

func TestOutboxMigrationsUpAndDown(t *testing.T) {
	dsn := os.Getenv("OUTBOX_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("OUTBOX_TEST_DATABASE_URL is required")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	cases := []struct{ table, base, up, correlationUp, correlationDown, down string }{
		{"identity_outbox", "../../internal/identity/migrations/000002_add_outbox.up.sql", "../../internal/identity/migrations/000006_harden_outbox.up.sql", "../../internal/identity/migrations/000007_outbox_correlation.up.sql", "../../internal/identity/migrations/000007_outbox_correlation.down.sql", "../../internal/identity/migrations/000006_harden_outbox.down.sql"},
		{"collab_outbox", "../../internal/collab/migrations/000002_add_outbox.up.sql", "../../internal/collab/migrations/000005_harden_outbox.up.sql", "../../internal/collab/migrations/000006_outbox_correlation.up.sql", "../../internal/collab/migrations/000006_outbox_correlation.down.sql", "../../internal/collab/migrations/000005_harden_outbox.down.sql"},
		{"scripts_outbox", "../../internal/scripts/migrations/000003_add_outbox.up.sql", "../../internal/scripts/migrations/000009_harden_outbox.up.sql", "../../internal/scripts/migrations/000010_outbox_correlation.up.sql", "../../internal/scripts/migrations/000010_outbox_correlation.down.sql", "../../internal/scripts/migrations/000009_harden_outbox.down.sql"},
		{"billing_outbox", "../../internal/billing/migrations/000003_add_outbox.up.sql", "../../internal/billing/migrations/000008_harden_outbox.up.sql", "../../internal/billing/migrations/000009_outbox_correlation.up.sql", "../../internal/billing/migrations/000009_outbox_correlation.down.sql", "../../internal/billing/migrations/000008_harden_outbox.down.sql"},
	}
	for _, tc := range cases {
		t.Run(tc.table, func(t *testing.T) {
			tx, err := db.Begin()
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback()
			schema := "migration_" + strings.ReplaceAll(uuid.NewString(), "-", "")
			if _, err := tx.Exec(`CREATE SCHEMA ` + schema + `; SET LOCAL search_path TO ` + schema + `, public`); err != nil {
				t.Fatal(err)
			}
			for _, path := range []string{tc.base, tc.up, tc.correlationUp} {
				sqlBytes, err := os.ReadFile(path)
				if err != nil {
					t.Fatal(err)
				}
				if _, err := tx.Exec(string(sqlBytes)); err != nil {
					t.Fatalf("apply %s: %v", path, err)
				}
			}
			var columns int
			if err := tx.QueryRow(`SELECT count(*) FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name IN ('claimed_at','claimed_by','attempts','last_error','dead_lettered_at')`, schema, tc.table).Scan(&columns); err != nil {
				t.Fatal(err)
			}
			if columns != 5 {
				t.Fatalf("hardened columns=%d, want 5", columns)
			}
			if err := tx.QueryRow(`SELECT count(*) FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name='correlation_id'`, schema, tc.table).Scan(&columns); err != nil {
				t.Fatal(err)
			}
			if columns != 1 {
				t.Fatal("correlation_id migration was not applied")
			}
			correlationDownSQL, err := os.ReadFile(tc.correlationDown)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := tx.Exec(string(correlationDownSQL)); err != nil {
				t.Fatalf("down %s: %v", tc.correlationDown, err)
			}
			downSQL, err := os.ReadFile(tc.down)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := tx.Exec(string(downSQL)); err != nil {
				t.Fatalf("down %s: %v", tc.down, err)
			}
			if err := tx.QueryRow(`SELECT count(*) FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name IN ('claimed_at','claimed_by','attempts','last_error','dead_lettered_at')`, schema, tc.table).Scan(&columns); err != nil {
				t.Fatal(err)
			}
			if columns != 0 {
				t.Fatalf("columns after down=%d, want 0", columns)
			}
		})
	}
}

func openDatabase(t *testing.T) (*sql.DB, string) {
	t.Helper()
	dsn := os.Getenv("OUTBOX_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("OUTBOX_TEST_DATABASE_URL is required")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	schema := "outbox_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err := db.Exec(`CREATE SCHEMA ` + schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(`DROP SCHEMA ` + schema + ` CASCADE`) })
	table := schema + ".test_outbox"
	_, err = db.Exec(`CREATE TABLE ` + table + ` (
		id UUID PRIMARY KEY, event_type TEXT NOT NULL, payload JSONB NOT NULL,
		published_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		claimed_at TIMESTAMPTZ, claimed_by TEXT, attempts INTEGER NOT NULL DEFAULT 0,
		last_error TEXT, dead_lettered_at TIMESTAMPTZ, correlation_id TEXT)`)
	if err != nil {
		t.Fatal(err)
	}
	return db, table
}
