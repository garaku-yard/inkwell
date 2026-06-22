package domain

import "time"

// VaultFile is one file in a vault project, keyed by its vault-relative path
// (forward-slash separated). Content holds the raw bytes — markdown as UTF-8,
// attachments as their binary. A non-nil DeletedAt is a tombstone. UpdatedAt is
// server-stamped and only meaningful on a pull. See SYNC_DESIGN.md.
type VaultFile struct {
	Path        string
	Content     []byte
	ContentHash string
	UpdatedAt   time.Time
	DeletedAt   *time.Time
}

// VaultCursor is a keyset position into a vault project's files, ordered by
// (UpdatedAt, Path). The pull pages from here, so a large first sync never skips
// files that share an UpdatedAt. A zero value means "from the beginning".
type VaultCursor struct {
	UpdatedAt time.Time
	Path      string
}
