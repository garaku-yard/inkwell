// Package outbox implements the transactional outbox pattern for reliable
// domain-event publishing.
//
// The pattern solves a single problem: when a service mutates its database
// and then publishes a domain event to Kafka, the service may crash between
// those two steps and lose the event. The outbox pattern fixes this by
// writing the event to an "outbox" table inside the same database transaction
// as the business mutation, then having a background poller read unpublished
// rows, emit them to Kafka, and mark them published.
//
// Each service owns its own outbox table (e.g. billing_outbox, scripts_outbox).
// Table schemas share the same columns so one reusable Store implementation
// serves every service:
//
//	CREATE TABLE <service>_outbox (
//	    id           UUID        PRIMARY KEY,
//	    event_type   TEXT        NOT NULL,
//	    payload      JSONB       NOT NULL,
//	    published_at TIMESTAMPTZ,
//	    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
//	);
//	CREATE INDEX <service>_outbox_unpublished_idx ON <service>_outbox (created_at)
//	    WHERE published_at IS NULL;
//
// Typical usage in a service:
//
//	store := outbox.NewPostgresStore(db, "billing_outbox")
//	poller := outbox.NewPoller(store, kafkaPublisher, 10*time.Second, 50)
//	go poller.Run(ctx)
//
//	// Inside a business mutation:
//	err := runTx(ctx, db, func(tx *sql.Tx) error {
//	    if err := repo.CreateSubscriptionTx(ctx, tx, sub); err != nil {
//	        return err
//	    }
//	    return store.EnqueueTx(ctx, tx, outbox.Event{Type: "billing.updated", Payload: payload})
//	})
package outbox

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"inkwell/server/pkg/events"
)

var ErrClaimLost = fmt.Errorf("outbox: claim no longer owned")

// Event is a single domain event waiting to be published. Payload is a raw JSON
// document; the event type determines how consumers deserialise it.
type Event struct {
	// ID uniquely identifies the event within its outbox table. If left as the
	// zero UUID, Store implementations generate a fresh value on enqueue.
	ID uuid.UUID
	// Type is the event name (e.g. "project.created", "billing.updated"). It
	// routes the event to the appropriate Kafka topic at publish time.
	Type string
	// Payload is the raw JSON body persisted and later re-emitted verbatim.
	Payload json.RawMessage
	// CreatedAt is set by Store.EnqueueTx; callers should leave it zero.
	CreatedAt time.Time
	Attempt   int
	ClaimedBy string
}

// Store is the minimum interface an outbox implementation must provide.
// Implementations are expected to be safe for concurrent use.
type Store interface {
	// EnqueueTx persists the event inside the given database transaction.
	// The caller commits or rolls back the transaction; on rollback the event
	// is not persisted, giving atomicity with the business mutation.
	EnqueueTx(ctx context.Context, tx *sql.Tx, event Event) error

	// ClaimPending atomically leases pending events. Publication occurs after
	// the claim transaction commits, and an expired lease may be reclaimed.
	ClaimPending(ctx context.Context, claimant string, limit int, lease time.Duration) ([]Event, error)

	// MarkPublished stamps the event as delivered so it will not be re-emitted.
	MarkPublished(ctx context.Context, id uuid.UUID, claimant string) error
	MarkFailed(ctx context.Context, id uuid.UUID, claimant, failure string, maxAttempts int) error
}

// PostgresStore implements Store on top of a PostgreSQL outbox table. A single
// instance is bound to a single table name so multiple Stores can coexist in
// the same service (rare, but supported).
type PostgresStore struct {
	db        *sql.DB
	tableName string
}

// NewPostgresStore binds a PostgresStore to the given table. The table must
// follow the schema documented on the package comment.
func NewPostgresStore(db *sql.DB, tableName string) *PostgresStore {
	return &PostgresStore{db: db, tableName: tableName}
}

// EnqueueTx inserts the event into the outbox table within the given transaction.
// If event.ID is the zero UUID a fresh value is generated; CreatedAt is always
// overwritten with the current time.
func (s *PostgresStore) EnqueueTx(ctx context.Context, tx *sql.Tx, event Event) error {
	if event.ID == uuid.Nil {
		event.ID = uuid.New()
	}
	event.CreatedAt = time.Now()

	// #nosec G201 — tableName is service-owned configuration, not user input.
	query := fmt.Sprintf(
		`INSERT INTO %s (id, event_type, payload, created_at) VALUES ($1, $2, $3, $4)`,
		s.tableName,
	)
	if _, err := tx.ExecContext(ctx, query, event.ID, event.Type, []byte(event.Payload), event.CreatedAt); err != nil {
		return fmt.Errorf("outbox: enqueue to %s: %w", s.tableName, err)
	}
	return nil
}

// ClaimPending leases the oldest available events in a short transaction.
func (s *PostgresStore) ClaimPending(ctx context.Context, claimant string, limit int, lease time.Duration) ([]Event, error) {
	// #nosec G201 — tableName is service-owned configuration.
	query := fmt.Sprintf(`WITH candidates AS (
		SELECT id FROM %s
		WHERE published_at IS NULL AND dead_lettered_at IS NULL
		  AND (claimed_at IS NULL OR claimed_at < NOW() - ($1 * interval '1 second'))
		ORDER BY created_at ASC
		FOR UPDATE SKIP LOCKED
		LIMIT $2
	)
	UPDATE %s o SET claimed_at = NOW(), claimed_by = $3, attempts = o.attempts + 1
	FROM candidates c WHERE o.id = c.id
	RETURNING o.id, o.event_type, o.payload, o.created_at, o.attempts, o.claimed_by`, s.tableName, s.tableName)
	rows, err := s.db.QueryContext(ctx, query, lease.Seconds(), limit, claimant)
	if err != nil {
		return nil, fmt.Errorf("outbox: list pending from %s: %w", s.tableName, err)
	}
	defer rows.Close()

	var out []Event
	for rows.Next() {
		var e Event
		var payload []byte
		if err := rows.Scan(&e.ID, &e.Type, &payload, &e.CreatedAt, &e.Attempt, &e.ClaimedBy); err != nil {
			return nil, fmt.Errorf("outbox: scan row from %s: %w", s.tableName, err)
		}
		e.Payload = payload
		out = append(out, e)
	}
	return out, rows.Err()
}

// MarkPublished stamps `id` with the current timestamp in `published_at`.
func (s *PostgresStore) MarkPublished(ctx context.Context, id uuid.UUID, claimant string) error {
	// #nosec G201 — tableName is service-owned configuration.
	query := fmt.Sprintf(`UPDATE %s SET published_at = $1, claimed_at = NULL, claimed_by = NULL, last_error = NULL WHERE id = $2 AND claimed_by = $3`, s.tableName)
	result, err := s.db.ExecContext(ctx, query, time.Now(), id, claimant)
	if err != nil {
		return fmt.Errorf("outbox: mark published in %s: %w", s.tableName, err)
	}
	if rows, err := result.RowsAffected(); err != nil || rows != 1 {
		return ErrClaimLost
	}
	return nil
}

// MarkFailed releases a failed claim and retains diagnostic state. Once the
// bounded attempt count is reached the row remains visible as dead-lettered.
func (s *PostgresStore) MarkFailed(ctx context.Context, id uuid.UUID, claimant, failure string, maxAttempts int) error {
	query := fmt.Sprintf(`UPDATE %s SET last_error = $1,
		dead_lettered_at = CASE WHEN attempts >= $2 THEN NOW() ELSE dead_lettered_at END,
		claimed_at = NULL, claimed_by = NULL WHERE id = $3 AND claimed_by = $4`, s.tableName)
	result, err := s.db.ExecContext(ctx, query, failure, maxAttempts, id, claimant)
	if err != nil {
		return fmt.Errorf("outbox: mark failed in %s: %w", s.tableName, err)
	}
	if rows, err := result.RowsAffected(); err != nil || rows != 1 {
		return ErrClaimLost
	}
	return nil
}

// Poller reads pending events from a Store on a fixed interval and publishes
// them via the provided events.Publisher. Failed publishes are retried on the
// next tick because the event remains unpublished.
type Poller struct {
	store       Store
	publisher   events.Publisher
	interval    time.Duration
	batchSize   int
	logger      *slog.Logger
	claimant    string
	lease       time.Duration
	maxAttempts int
	done        chan struct{}
}

// NewPoller constructs a Poller. interval is how often pending events are read;
// batchSize is the maximum rows read per tick. The returned poller uses the
// default slog logger.
func NewPoller(store Store, publisher events.Publisher, interval time.Duration, batchSize int) *Poller {
	return &Poller{
		store:       store,
		publisher:   publisher,
		interval:    interval,
		batchSize:   batchSize,
		logger:      slog.Default(),
		claimant:    uuid.NewString(),
		lease:       time.Minute,
		maxAttempts: 10,
		done:        make(chan struct{}),
	}
}

// WithLogger returns a copy of p that uses the given slog.Logger instead of
// the default. Pass a logger scoped with the service name to get attribution
// in log output.
func (p *Poller) WithLogger(logger *slog.Logger) *Poller {
	cp := *p
	cp.logger = logger
	return &cp
}

// Run blocks until ctx is cancelled, draining pending events every `interval`.
// It is safe to call Run in its own goroutine. Individual publish/mark errors
// are logged and the poller continues — failed events are retried on the next
// tick since their published_at remains null. On return Run closes the done
// channel so callers can join via Wait.
func (p *Poller) Run(ctx context.Context) {
	defer close(p.done)
	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.drain(ctx)
		}
	}
}

// Wait blocks until a previously started Run has fully returned. Call it after
// cancelling the poller's context and before closing the publisher, so no
// in-flight drain races writer shutdown.
func (p *Poller) Wait() {
	<-p.done
}

// drain performs a single poll cycle.
func (p *Poller) drain(ctx context.Context) {
	pending, err := p.store.ClaimPending(ctx, p.claimant, p.batchSize, p.lease)
	if err != nil {
		p.logger.Warn("outbox poller: list pending failed", "error", err)
		return
	}
	for _, e := range pending {
		envelope := events.Event{ID: e.ID.String(), Type: e.Type, OccurredAt: e.CreatedAt.UTC(), Payload: e.Payload}
		if err := events.PublishEvent(ctx, p.publisher, envelope); err != nil {
			p.logger.Warn("outbox publish failed", "event_id", e.ID, "event_type", e.Type, "attempt", e.Attempt, "age", time.Since(e.CreatedAt), "claimed_by", p.claimant, "result", "retry", "error", err)
			if markErr := p.store.MarkFailed(ctx, e.ID, p.claimant, err.Error(), p.maxAttempts); markErr != nil {
				p.logger.Error("outbox failure recording failed", "event_id", e.ID, "event_type", e.Type, "attempt", e.Attempt, "claimed_by", p.claimant, "result", "claim_expires", "error", markErr)
			}
			continue
		}
		if err := p.store.MarkPublished(ctx, e.ID, p.claimant); err != nil {
			p.logger.Warn("outbox mark published failed", "event_id", e.ID, "event_type", e.Type, "attempt", e.Attempt, "age", time.Since(e.CreatedAt), "claimed_by", p.claimant, "result", "lease_retry", "error", err)
			continue
		}
		p.logger.Info("outbox event published", "event_id", e.ID, "event_type", e.Type, "attempt", e.Attempt, "age", time.Since(e.CreatedAt), "claimed_by", p.claimant, "result", "published")
	}
}

// RunInTx opens a new transaction on db, executes fn, and commits on success.
// Rolls back automatically on any error or panic. This is a convenience for
// service code that needs to pair a business write with an outbox EnqueueTx.
func RunInTx(ctx context.Context, db *sql.DB, fn func(tx *sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p)
		}
	}()
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}
