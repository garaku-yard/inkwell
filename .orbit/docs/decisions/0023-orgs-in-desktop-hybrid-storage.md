# 0023 — Organizations in the desktop build; hybrid local+remote `Storage`

**Status:** Accepted · 2026-08-04

## Context

[0020](./0020-monetization-open-core-paddle.md) drew the open-core line so the
desktop app stays free and the **hosted** product sells collaboration, sync,
managed AI and **org tenancy**. [0004](./0004-storage-abstraction.md) binds
exactly one implementation per surface — `local/` on Tauri, `remote/` on web —
so `lib/storage/local/organizations.ts` rejects every org call with
`NotSupportedError`.

What that produces in the shipped desktop app: the workspace dialog offers
"Create an organization instead", accepts a name and a description, and only
then dead-ends on *This build does not support the "organizations" feature.* The
feature itself is complete — `remote/organizations.ts` plus the gateway routes
in `internal/gateway/router/router.go` cover create/update/delete, members,
invites, roles and seats — but it is unreachable from the surface the maintainer
actually works in. Offering a form that cannot be submitted also contradicts the
project's own "honesty over fake success" guardrail.

## Decision

Organizations are **available in the desktop build**. The Tauri build keeps
`local/` for every other domain and delegates the `organizations` domain to
`remote/`, reusing the desktop's existing auth transport
([0017](./0017-optional-desktop-login.md): stored gateway URL + keychain bearer
token). The desktop `Storage` therefore becomes a **composition** rather than a
single implementation.

Availability uses the **same two-step gate as `sync`**, rather than inventing a
new one: `organizations` joins the desktop capability set *statically* (the
build does support orgs), and the linked-account question is answered at call
time by `OrganizationStorage.isAvailable()` — the mirror of
`SyncStorage.isAvailable`. UI must check both. A static capability plus a
runtime probe is what keeps the answer correct after a user links an account
mid-session, which a bind-time-only decision would get wrong until restart.

Because the desktop is commonly used signed out, the desktop binding degrades
rather than throws: **list-shaped reads return empty** when no account is
linked (preserving the old "no org zone in the rail" behaviour and avoiding an
unauthenticated request on every boot), while **writes refuse locally** with
`UnauthenticatedError` instead of sending a request that could only 401.

Org **tenancy of projects** ([0018](./0018-org-model-option-b.md), Option B: the
org owns projects) is unchanged and stays server-side. Desktop-local projects are
not org-owned. Orgs on the desktop mean creating and administering the org, its
members, invites and seats.

## Alternatives considered & why not

- **Leave it hosted-only and just hide the button.** Rejected by the product
  owner: the desktop is the surface in daily use and orgs are wanted there. (This
  was the option that preserved 0020 intact.)
- **Bind the whole desktop to `remote/` once signed in.** Rejected: it would move
  projects, scenes and the vault onto the gateway, discarding local-first
  ([0001](./0001-local-first-architecture.md)) and the entire sync design
  ([0013](./0013-sync-client-uuid-lww.md),
  [0014](./0014-sync-incremental-outbox.md)) the moment a user logs in.
- **Reimplement orgs against local SQLite.** Rejected: an org is a shared
  multi-user tenancy with seats and invites — there is nothing coherent to model
  in a single-user local database, and it would fork the org model from 0018.
- **Supersede 0020 wholesale.** Rejected: open-core, Paddle MoR and the per-seat
  tier structure all stand. Only the "org tenancy is hosted-only" boundary moves,
  so 0020 is marked *partially* superseded.

## Consequences

- **The open-core boundary moves.** Org administration is no longer hosted-only.
  Business per-seat billing (0020) still runs through the gateway, so the paid
  surface is billing and hosted tenancy — not the org UI itself.
- The desktop gains an explicitly **online-only island** in an otherwise
  local-first app (0001). Org screens must degrade honestly when offline or
  signed out: capability absent, affordance hidden, no dead-end forms.
- **0004 is refined, not reversed.** The single interface, the capability gating
  and `services → getStorage()` all still hold; what changes is that the desktop
  binds a *composed* `Storage`. Any future cross-surface domain should follow this
  composition pattern rather than reintroducing `isTauri()` checks in components.
- Org calls from the desktop are subject to network failure in a way no other
  desktop domain is. Failures surface as errors in the org UI only, and never
  block app boot — the composition is built after `initDesktopAuth()` resolves.
