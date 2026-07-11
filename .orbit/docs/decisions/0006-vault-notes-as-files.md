# 0006 — Vault notes are real `.md` files on disk

**Status:** Accepted

## Context

The vault category is an Obsidian-adjacent markdown note surface. The core promise
is interoperability: a writer should be able to point vim, git, or another tool at
the same notes, and rename or back up the folder however they like.

## Decision

Store vault notes as **real `.md` files** inside a user-picked folder
(`projects.vault_path`). The app reads and writes them directly. Only *derived
indexes* — `note_links` (backlinks), `note_tags`, `note_embeddings` (RAG),
`project_knowledge` — live in SQLite, rebuildable from the files. A recursive
**filesystem watcher** flows external edits (vim/git/other apps) back into the
sidebar and indexes; an orphaned-index reconcile sweeps rows for files gone from
disk.

## Alternatives considered & why not

- **Store notes as rows in SQLite** (like non-vault projects). Rejected: kills the
  whole interop story — no git history, no editing in another app, not
  Obsidian-adjacent.
- **A proprietary bundle/format.** Rejected: same reason; the files must be plain
  markdown a human and other tools can read.

## Consequences

- Requires the filesystem watcher, the orphaned-index reconcile, and careful
  handling of external edits during an in-flight write.
- **Desktop-only** — the hosted web build can't reach the filesystem, so vault
  projects don't exist there (the `ai.knowledge` capability is desktop-only too).
- Vault sync needs a **separate path-keyed engine** (files, not UUID rows) — see
  [reference/sync-engine.md](../reference/sync-engine.md) and
  [0013](./0013-sync-client-uuid-lww.md).
- Indexes are cheap to regenerate, so they're deliberately excluded from sync.
