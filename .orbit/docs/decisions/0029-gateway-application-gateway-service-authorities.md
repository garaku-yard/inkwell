# 0029 — Gateway as application gateway; one authority per fact

**Status:** Accepted · 2026-09-08

## Context

[0007](./0007-gateway-thin-proxy-db-per-service.md) called the gateway a "thin
HTTP↔gRPC proxy" with "no business logic," and that phrase is what every later
description of the gateway (architecture.md, the glossary, CONTRIBUTING.md)
copied. It was never quite true — the gateway resolves project access
(`ResolveProjectAccess`), makes coarse authorization decisions, composes
responses out of two or three services (e.g. enriching a collaborator list with
identity lookups), and decides how to degrade when a dependency is down. None of
that is "no business logic"; it's orchestration and policy, which is a real and
necessary job at a public edge.

The vague description was not free. `ResolveProjectAccess` returns one of two
things for a caller who isn't the owner: no access, or an empty-string "bypass
sentinel" that tells scripts-service "the gateway already authorized this,
skip your ownership check." That sentinel carries no role — an org member and
an active collaborator get it whether they're a viewer or an editor, so a
viewer today reaches scripts with the same effective access as an editor.
Nothing in 0007 or its descendants ever wrote down that project roles are a
gateway responsibility, so nothing caught the gap between "the gateway grants
access" and "the gateway grants *this* access." Two smaller instances of the
same root cause: `CreateProject` registers the owner as a collab-service
collaborator row as a fire-and-forget follow-up call (logged, never retried —
if it fails, the owner doesn't appear in their own project's collaborator
list), and `DeleteProject` durably publishes `project.deleted` to the scripts
outbox but nothing currently consumes it, so collab-owned rows (collaborators,
invitations, comments, edit sessions) outlive a deleted project.

This ADR does not fix any of that — it is docs-only, recorded first so the
fixes in #359–#365 implement one agreed contract instead of five independent
guesses. It supersedes only 0007's "thin proxy" characterization;
database-per-service stands unchanged.

## Decision

**The gateway is the public application gateway (BFF)**, not a passthrough:
HTTP and WebSocket transport, request orchestration across services, coarse
policy evaluation (who may do what, resolved from identity/org/collab state),
response composition, and the decision of how to degrade when a dependency is
unavailable. It still holds no *domain* logic — it does not decide what a
valid scene looks like or what an outline item's fields mean — but "no
business logic" stops being an accurate summary of what it does.

**One authority per fact.** Each service is the single source of truth for
what it owns; nothing else is allowed to hold a conflicting copy:

| Service | Owns |
|---|---|
| identity | user identity, credentials, sessions, 2FA |
| scripts | project owner, project metadata, writing content, sync state |
| collab | non-owner project roles, invitations, comments, edit sessions |
| workspace | organizations, org membership and org role, categories |
| billing | tiers, subscriptions, usage/entitlements |
| aisettings | encrypted hosted-provider configuration |
| notifications | preferences, feed, delivery history |

**Projections are allowed, but not silently.** A service may hold a copy of
another service's fact (a projection, not a second authority) only when its
source, triggering event, consistency model, idempotency key, and
reconciliation path are written down where the projection lives. The owner
row `AddCollaboratorDirect` writes into collab is exactly this kind of
projection and is currently undocumented as one — #362 either documents it
properly or removes it in favor of composing the response at read time.

**Missing actor identity is never proof of authorization.** An empty or
absent user ID must never be interpreted downstream as "already checked."
Today it is (`ResolveProjectAccess`'s bypass sentinel, read by scripts as
"skip the ownership check"); #360 replaces that sentinel with an explicit,
typed access decision.

**Cross-service interactions, classified as they exist today** — not the
target state, so the gaps below are named rather than fixed here:

| Interaction | Classification | Current behavior when the dependency is unavailable or fails |
|---|---|---|
| Auth validation (JWT → identity, Redis blocklist) | required · fail-closed | request rejected, not silently admitted |
| Project authorization (`ResolveProjectAccess`: owner → org membership → collaborator) | required for *whether* access exists · fail-closed | a resolved org-member or collaborator of **any** role returns the same bypass sentinel; role is not carried past the gateway today (#359, #360) |
| Sub-resource authorization (`GetResourceProject` → `ResolveProjectAccess`) | required · fail-closed | same role-collapse as above; resource-id spoofing was already closed by 0007 |
| Quota check at write time (`quota.Require`, scripts → billing) | required · fail-closed when a quota client is wired | billing unreachable blocks the write in a wired deployment; enforcement is skipped outright, by design, when no client is wired (local dev) |
| Quota bookkeeping after write (`quota.Track`) | optional · degraded | logged and dropped; usage reconciled out of band, the write already succeeded |
| Collaborator-list enrichment (identity lookup for name/email) | optional · degraded | identity unreachable → placeholder text, the list still returns |
| Owner registered as a collaborator row (`AddCollaboratorDirect` after `CreateProject`) | eventual · best-effort, unretried | logged warning only; a failure means the owner is missing from their own project's collaborator list until repaired (#362) |
| Project deletion cascade into collab-owned data | eventual · **not yet consumed** | `project.deleted` is durably published to the scripts outbox; no service subscribes today, so collaborators/invitations/comments/edit_sessions outlive the deleted project (#362) |
| Invitations (create/accept/revoke) | collab-owned directly, no cross-service read on the write path | n/a |
| Notifications (in-app feed + email) | eventual · retried | Kafka outbox + poller, consumed by notifications-service, at-least-once; hardened further by #363 |

### Ownership implementation status (2026-09-14)

#362 chose read-time composition instead of retaining an owner projection.
`scripts.projects.owner_id` is the only stored project-ownership fact. Project
creation no longer calls `AddCollaboratorDirect`; collaborator-list responses
synthesize the owner from scripts metadata and filter legacy owner rows during
rolling deployment. Collab migration 000004 removes those rows and prevents new
ones. Collab also consumes `project.deleted` with manual Kafka commits and
idempotently deletes its project-scoped rows before acknowledging the event.

## Alternatives considered & why not

- **Leave the "thin proxy" wording and treat the sentinel bug as one call site
  to fix.** Rejected: the wording is *why* nobody noticed a role-blind
  sentinel was load-bearing for authorization. Fixing the call without
  fixing the description leaves the same blind spot for the next handler.
- **A dedicated authorization/policy microservice.** Rejected (non-goal of
  #358–#360 as scoped): the inputs to the policy decision already live in
  identity/workspace/collab; a new service adds another authority to keep in
  sync for no isolation benefit at this scale.
- **Merge services or share a database so authority is trivially consistent.**
  Rejected: this is the coupling 0007 exists to avoid, and nothing here
  argues otherwise — the DB-per-service half of 0007 is unchanged.
- **Let scripts cache or duplicate collaborator role state so it can
  self-authorize without the gateway.** Rejected: a second copy of role state
  drifts from collab's, and "scripts trusts a shortcut instead of checking"
  is the shape of the bug being closed, not a pattern to repeat.

## Consequences

- 0007's status is marked partially superseded — only its "thin proxy"
  characterization; database-per-service is unchanged and this ADR does not
  revisit it.
- architecture.md's gateway section, the glossary's "Gateway" entry, and
  CONTRIBUTING.md's service-boundaries paragraph are reworded to match (same
  commit as this ADR) — no behavior changed, only the description.
- #359, #360, #362, and #365 implement this decision; #358 itself is docs-only
  and changes no code or protobuf.
- The two gaps this ADR names but does not fix — the role-blind bypass
  sentinel and the unconsumed `project.deleted` event — are now written down
  as known behavior, not undiscovered behavior, until #359/#360 and #362 land.
