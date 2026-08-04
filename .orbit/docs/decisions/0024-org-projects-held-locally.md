# 0024 — Org-owned projects are held locally on the desktop

**Status:** Accepted · 2026-08-04

## Context

[0018](./0018-org-model-option-b.md) chose Option B — the org owns its projects —
and put that pool on the server, which was the only place an org existed at the
time. [0023](./0023-orgs-in-desktop-hybrid-storage.md) then made orgs reachable
from the desktop but explicitly kept project tenancy server-side, so the desktop
could create an org and administer its members and immediately do nothing else
with it.

That produced a genuinely bad surface. The local `projects` table had no org
column, so `local/projects.ts` silently discarded the `org_id` the dialog handed
it: selecting an org and creating a project wrote a *personal* row that never
appeared in the org it was made from. It looked exactly like the app failing to
save. Gating the affordance off (as 0023's follow-up did) stopped the data going
astray but left the honest version of the same dead end — an org you cannot put
work into.

The justification for server-side-only does not survive contact with this app.
Inkwell is local-first ([0001](./0001-local-first-architecture.md)): projects,
scenes and elements are rows in the on-disk SQLite database, and the desktop is
expected to work with no server at all. An org project is still just a project on
this disk. Requiring a running gateway to create one contradicts everything else
the desktop does, and — with no hosted deployment — meant it could not be done at
all.

## Decision

**The desktop creates, lists and edits org-owned projects locally.** Migration
0015 adds a nullable `projects.org_id`; NULL means personal, which is what every
pre-existing row is. `local/projects.ts` persists the id instead of dropping it,
`listOwned` filters to `org_id IS NULL` so org work does not leak into personal
workspaces, and `OrganizationStorage.listProjects` on the desktop answers from
SQLite rather than the gateway — so it works signed out and offline like the rest
of the build.

Org projects reach other members through the **existing per-project sync**
([0013](./0013-sync-client-uuid-lww.md),
[0014](./0014-sync-incremental-outbox.md)), not through a separate code path. The
outbox already pushes the whole row, so `org_id` rides along; the pull side now
round-trips it explicitly so a synced-down project cannot quietly turn personal.

Org *administration* — members, seats, invites — stays gateway-backed per 0023.
That genuinely needs a server, because it is about other people.

No capability gates this. Both builds can put a project in an org; they differ
only in where it is stored, which is the difference the `Storage` split
([0004](./0004-storage-abstraction.md)) exists to hide. The
`organizations.projects` capability introduced days earlier is removed — it
described a limitation, not a capability.

## Alternatives considered & why not

- **Leave it server-side and keep the affordance hidden** (0023's position).
  Rejected by the product owner on the plain reading that a local-first app
  should not need a server to make a local file: an org you cannot put projects
  in is not worth having on the desktop.
- **Create org projects through the gateway from the desktop.** Rejected: the
  editor reads local SQLite, so a gateway-only project would list but refuse to
  open. Making it work means routing projects, scenes and elements remotely for
  those projects — abandoning local-first exactly where the work happens.
- **A separate `org_projects` table.** Rejected: an org project differs from a
  personal one by ownership alone. A parallel table would fork every query,
  editor load and sync path in the app to express one nullable field.
- **Mirror the server's org membership locally to validate `org_id`.** Rejected:
  this device has no authority over membership or seats, and a stale local copy
  would be worse than no copy. `org_id` stays a bare TEXT with no local
  foreign key.

## Consequences

- **0018's "the org owns projects" now means different storage per surface.** The
  server keeps its pool for the hosted build; the desktop keeps org projects on
  disk. Both are still org-owned — 0018's model holds, its storage assumption
  does not.
- **An org project is only as shared as sync makes it.** Created offline it is
  visible to its author alone until that project syncs; other members' projects
  appear only once pulled. The org view on the desktop is therefore "this org's
  work *on this device*", which is the honest local-first reading but is not what
  a web user sees.
- Whether the gateway actually persists `org_id` on push is **unverified** —
  scripts-service has the column, but the write path has not been exercised
  end-to-end from the desktop. Until it is, treat cross-device org projects as
  unproven rather than working.
- `listOwned` filtering on `org_id IS NULL` is now load-bearing: any future query
  of personal projects must carry the same filter or org work will surface in
  personal workspaces.
