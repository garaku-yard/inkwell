// Package reaper periodically hard-deletes accounts that have been soft-deleted
// longer than the deletion grace period. Soft delete (DeleteAccount) makes an
// account immediately unusable; this reaper is the second half — permanent
// removal after the grace window, giving a recovery/audit buffer in between.
package reaper

import (
	"context"
	"log/slog"
	"time"
)

// Purger hard-deletes accounts soft-deleted longer ago than retention.
// Implemented by the identity AuthService.
type Purger interface {
	PurgeExpiredAccounts(ctx context.Context, retention time.Duration) (int64, error)
}

// Reaper runs Purger on an interval. Lifecycle mirrors the outbox Poller:
// Run(ctx) loops until ctx is cancelled, Wait() joins the goroutine on shutdown.
type Reaper struct {
	purger    Purger
	interval  time.Duration
	retention time.Duration
	log       *slog.Logger
	done      chan struct{}
}

// New builds a Reaper that purges accounts past retention every interval.
func New(p Purger, interval, retention time.Duration) *Reaper {
	return &Reaper{
		purger:    p,
		interval:  interval,
		retention: retention,
		log:       slog.Default().With("component", "account_reaper"),
		done:      make(chan struct{}),
	}
}

// Run sweeps once on start, then every interval until ctx is cancelled.
func (r *Reaper) Run(ctx context.Context) {
	defer close(r.done)
	r.log.Info("account deletion reaper started", "interval", r.interval, "retention", r.retention)
	r.purge(ctx)
	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.purge(ctx)
		}
	}
}

func (r *Reaper) purge(ctx context.Context) {
	n, err := r.purger.PurgeExpiredAccounts(ctx, r.retention)
	if err != nil {
		r.log.Error("account purge failed", "error", err)
		return
	}
	if n > 0 {
		r.log.Info("purged expired accounts", "count", n)
	}
}

// Wait blocks until Run has returned (call after cancelling its context).
func (r *Reaper) Wait() { <-r.done }
