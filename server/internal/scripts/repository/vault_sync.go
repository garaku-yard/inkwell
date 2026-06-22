package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"

	"inkwell/server/internal/scripts/domain"
)

// Vault file sync — a path-keyed reconcile for a vault project's files. Mirrors
// the row-based sync in sync.go (server-stamped updated_at, tombstones,
// apply-then-pull-excluding-pushed, last-sync-wins), but the identity is
// (project_id, path) rather than a UUID, and the pull is keyset-paginated by
// (updated_at, path) so a large first pull stays within the request size cap.
// See SYNC_DESIGN.md ("vault file sync").

// textArray binds a string slice as a non-null Postgres text[] for `<> ALL(...)`
// exclusion. A nil slice through pq.Array becomes SQL NULL, and `x <> ALL(NULL)`
// is NULL (not TRUE) — which would filter out every row when nothing was pushed.
// Coercing to a non-nil empty slice yields `<> ALL('{}')` ⇒ TRUE.
func textArray(s []string) any {
	if s == nil {
		s = []string{}
	}
	return pq.Array(s)
}

// UpsertProjectForVault upserts the vault project's row (create-if-absent,
// owner-guarded), reusing the row sync's project upsert so a vault project shows
// up in the user's cloud project list the same way DB-backed projects do.
func (r *SyncRepository) UpsertProjectForVault(ctx context.Context, q queryer, ownerID uuid.UUID, p *domain.Project) error {
	return r.upsertProject(ctx, q, ownerID, p)
}

// ApplyVaultFiles upserts each pushed file by (project_id, path), stamping
// updated_at = NOW() (server clock) and writing the client's deleted_at verbatim
// (a tombstone push deletes; re-pushing a path revives it). Last-sync-wins.
func (r *SyncRepository) ApplyVaultFiles(ctx context.Context, q queryer, projectID uuid.UUID, files []*domain.VaultFile) error {
	for _, f := range files {
		if _, err := q.ExecContext(ctx, `
			INSERT INTO vault_files (project_id, path, content, content_hash, updated_at, deleted_at)
			VALUES ($1, $2, $3, $4, NOW(), $5)
			ON CONFLICT (project_id, path) DO UPDATE SET
				content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
				updated_at = NOW(), deleted_at = EXCLUDED.deleted_at`,
			projectID, f.Path, f.Content, f.ContentHash, f.DeletedAt); err != nil {
			return err
		}
	}
	return nil
}

// PullVaultFiles returns one page of files changed since cursor, ordered by
// (updated_at, path), excluding the paths the caller just pushed (so the pusher
// keeps its own copy and never diverges). The page is bounded by both maxFiles
// and maxBytes; hasMore tells the caller to fetch the next page with the returned
// cursor. On the final page the cursor is the server clock, so subsequent syncs
// only see strictly newer changes. Tombstones carry no content (the caller just
// deletes the local file).
func (r *SyncRepository) PullVaultFiles(
	ctx context.Context, q queryer, projectID uuid.UUID,
	cursor domain.VaultCursor, maxFiles, maxBytes int, pushed []string,
) ([]*domain.VaultFile, bool, domain.VaultCursor, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT path, content, content_hash, updated_at, deleted_at
		FROM vault_files
		WHERE project_id = $1
		  AND (updated_at > $2 OR (updated_at = $2 AND path > $3))
		  AND path <> ALL($4::text[])
		ORDER BY updated_at, path
		LIMIT $5`,
		projectID, cursor.UpdatedAt, cursor.Path, textArray(pushed), maxFiles+1)
	if err != nil {
		return nil, false, domain.VaultCursor{}, err
	}

	var (
		out      []*domain.VaultFile
		sumBytes int
		hasMore  bool
		last     domain.VaultCursor
		count    int
	)
	for rows.Next() {
		count++
		if count > maxFiles {
			hasMore = true // the maxFiles+1 sentinel row — more remain
			break
		}
		f := &domain.VaultFile{}
		if err := rows.Scan(&f.Path, &f.Content, &f.ContentHash, &f.UpdatedAt, &f.DeletedAt); err != nil {
			_ = rows.Close()
			return nil, false, domain.VaultCursor{}, err
		}
		if f.DeletedAt != nil {
			f.Content = nil // tombstone: don't ship bytes
		}
		// Byte budget: stop before exceeding it, but always include at least one
		// file so a page can never make zero progress.
		if len(out) > 0 && sumBytes+len(f.Content) > maxBytes {
			hasMore = true
			break
		}
		out = append(out, f)
		sumBytes += len(f.Content)
		last = domain.VaultCursor{UpdatedAt: f.UpdatedAt, Path: f.Path}
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, false, domain.VaultCursor{}, err
	}
	// Close before any further query on the same tx (a tx serializes its queries).
	_ = rows.Close()

	if hasMore {
		return out, true, last, nil
	}
	now, nerr := r.ServerNow(ctx, q)
	if nerr != nil {
		return nil, false, domain.VaultCursor{}, nerr
	}
	return out, false, domain.VaultCursor{UpdatedAt: now}, nil
}

// PurgeVaultTombstones hard-deletes tombstoned vault files older than the
// retention horizon. Time-based GC, mirroring PurgeTombstones for the row tables.
func (r *SyncRepository) PurgeVaultTombstones(ctx context.Context, olderThan time.Duration) (int64, error) {
	cutoff := time.Now().Add(-olderThan)
	res, err := r.db.ExecContext(ctx,
		`DELETE FROM vault_files WHERE deleted_at IS NOT NULL AND deleted_at < $1`, cutoff)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}
