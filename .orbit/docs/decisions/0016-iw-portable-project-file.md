# 0016 — `.iw` portable project file — import/export only

**Status:** Accepted

## Context

Vault projects live on disk as files ([0006](./0006-vault-notes-as-files.md)), but
non-vault projects (screenplay/prose/poetry/comic/ttrpg/if/memoir/lyrics) live in
SQLite. Users want a portable, backup-able, restore-able artefact for those too —
and there's a longer-term vision of non-vault projects living on disk like the
vault.

## Decision

Ship **`.iw` as a lossless single-JSON envelope** — project + scenes/elements +
characters/locations + full beat board — that exports from any non-vault editor
and imports as a new project from the dashboard. **Scope it to import/export
only** for now; explicitly **defer** making `.iw` the on-disk *source of truth*
(replacing SQLite).

## Alternatives considered & why not

- **Make `.iw` the on-disk source of truth now.** Deferred: replacing SQLite as
  the store for non-vault projects is a much larger rewrite; the import/export
  slice delivers portability + backup today without it.
- **A binary container format.** Rejected: non-vault data has no binary blobs
  (beat images are gateway URL references), so plain JSON is lossless and
  human-inspectable.

## Consequences

- The same envelope is reused by the Google Drive backup design
  ([0021](./0021-drive-backup-google-only.md)) as the lossless `.inkwell.json`
  snapshot.
- SQLite stays authoritative for non-vault projects; the on-disk-source-of-truth
  ambition remains on the [roadmap](../roadmap.md).
