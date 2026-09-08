# 0030 — Role-aware project authorization: a typed policy, not a bypass sentinel

**Status:** Accepted · 2026-09-08

## Context

[0029](./0029-gateway-application-gateway-service-authorities.md) named the
gap this ADR closes: `ResolveProjectAccess` collapsed every non-owner
relationship to a project — org owner, org admin, org editor, org viewer,
direct-collaborator editor, direct-collaborator viewer — into one
empty-string "bypass sentinel" that scripts-service read as "the gateway
already authorized this, skip the ownership check." Role never survived the
trip. A viewer reached scripts-service with the same effective access as an
editor.

Auditing every call site to fix that (Orbit #359) found the actual state was
worse than "role is too coarse." A working set of gateway endpoints ran **no
project-access check at all** and forwarded the raw authenticated caller
straight to a downstream service:

- `collab` handlers `AddCollaborator`, `GetProjectCollaborators`, `AddComment`,
  `UpdateCollaboratorRole`, `RemoveCollaborator`, `UpdateComment`,
  `DeleteComment`, `UpdatePresence` — no gateway check.
- `scripts` handlers `CreateScene`, `UpdateScene`, `DeleteScene`,
  `CreateElement` — no gateway check.
- `GetSceneElements` — deliberately retried with the full bypass sentinel on
  *any* failure, on the theory that knowing a `scene_id` was proof enough.

Combined with a real bug in `CollaborationService.CheckPermission` — a caller
with no collaborator row is assumed to be "the owner, already verified by the
gateway" and let through, for *any* required role — the `collab` gaps were a
genuine, currently-exploitable hole: an authenticated stranger with no
relationship to a project could read its collaborator list (including real
emails), add themselves as an editor, remove or reassign collaborators, and
post/edit/delete comments, on any project whose id they knew. The `scripts`
gaps ran the other way: `verifyProjectAccess` accepts either `uuid.Nil` (the
sentinel) or the literal `owner_id` — nothing else — so a real, non-owner
collaborator hitting `CreateScene`/`UpdateScene`/`DeleteScene`/`CreateElement`
directly was rejected. Both are downstream of the same root cause named in
0029: nobody had written down that project roles are the gateway's job, so
nothing caught either the gaps or the mismatch.

## Decision

**A typed policy (`handlers.ProjectRole`, `handlers.ProjectAction`,
`handlers.Can`) replaces the untyped sentinel as the thing every gateway
entry point checks.** `handlers.ResolveProjectRole` resolves a caller to one
of `RoleOwner` / `RoleOrgAdmin` / `RoleEditor` / `RoleViewer` / `RoleNone` (an
org "owner"/"admin" role and a direct-collaborator "owner" role are distinct
inputs that both resolve toward the top of this scale; see the type's doc
comment for the exact mapping). `handlers.RequireProjectAccess` resolves the
role, checks it against the requested `ProjectAction` via `Can`, and — only
when permitted — returns the same wire value downstream calls have always
used: the real id for an owner, `""` for every other permitted role. No proto
field changes; `#360` remains the task that replaces the sentinel wire
contract itself.

**Every project-scoped gateway entry point now calls it**, including the ones
that previously ran no check: the eight `collab` handlers above now gate on
`ActionManageCollaborators` / `ActionCommentAdd` / `ActionCommentModerate` /
`ActionRead` as appropriate (comment mutation picks between the last two per
caller, below); the four `scripts` handlers gate on `ActionEditContent`.
`GetSceneElements` resolves the scene's real project and gates on `ActionRead`
instead of retrying blind. Realtime (`internal/gateway/realtime`) resolves a
role once at WebSocket connect (`ActionRead` — a viewer may watch) and carries
it on the connection to gate inbound `TypeEdit` frames per-frame
(`ActionRealtimeEdit`) — connecting and editing are different actions with
different minimum roles now, where before both used the same undifferentiated
check.

**Two small, additive proto changes make the fix possible without
loosening anything:**

- `scripts.ResourceType` gains `RESOURCE_TYPE_SCENE` (7), so
  `GetResourceProject` — previously covering beats/connections/lanes/outline
  items/elements/drawings but not scenes — can resolve a scene's owning
  project the same way. `UpdateScene`/`DeleteScene`/`CreateElement`
  (scene-scoped) now go through it instead of trusting the raw caller.
- `collab` gains its own `GetResourceProject` (mirroring scripts' shape) with
  a `ResourceType` of `COLLABORATOR` or `COMMENT`, because
  `UpdateCollaboratorRoleRequest`, `RemoveCollaboratorRequest`,
  `UpdateCommentRequest`, and `DeleteCommentRequest` carry only the
  sub-resource id, never a project id — and adding one to trust from the
  client would reopen exactly the "never trust a client-supplied project id
  for a sub-resource" rule 0007 exists to enforce. Its response also carries
  `owner_user_id` (the resource's own author/subject) so the gateway can
  resolve the self-vs-moderate comparison below without a second round-trip.

**Comment mutation resolves the real author at the gateway, not just "has
some access", and forwards the caller's real id rather than the bypass
sentinel.** A first pass gated `UpdateComment`/`DeleteComment` on a coarse
`ActionCommentAdd` check (any real role) and relied on
`CollaborationService.UpdateComment`/`DeleteComment`'s own self-authorship
comparison downstream. Review caught the hole in that: an org-only member
(org role only, no `collab.collaborators` row) reaches
`CollaborationService.CheckPermission` for the *editor* requirement on
someone else's comment, and `CheckPermission`'s own fallback bug (#366 —
"no collaborator row ⇒ assume owner-verified") admits them regardless of
their actual org role. A coarse gate does not make that downstream check
safe. Fixed by resolving the comparison at the gateway instead: collab's
`GetResourceProject` response now also carries `owner_user_id` — the
comment's real author, not an authorization grant by itself — and the
gateway action is `ActionCommentAdd` (viewer-permitted) only when the caller
*is* that author and isn't resolving the thread, `ActionCommentModerate`
(editor+) otherwise. Resolving a thread (`is_resolved`) is always
`ActionCommentModerate`, matching `ResolveComment`'s own unconditional
editor requirement. An org viewer moderating a stranger's comment is now
denied by `Can(RoleViewer, ActionCommentModerate)` before the request ever
reaches collab-service, so #366's fallback is unreachable through this path
too — see Consequences.

**Org membership and a direct collaborator grant are combined, not
prioritised.** A first pass checked the project's org role, and only fell
back to the collaborator row when the caller wasn't an org member at all —
so a direct project-editor grant to someone who also happened to be an org
viewer resolved as `RoleViewer` (the org check ran first and returned),
silently discarding the more specific, more generous grant. Review caught
this too. `ResolveProjectRole` now evaluates both sources whenever both
apply and returns whichever grants more: a direct role never gets masked by
a lower org default, and an org role never gets masked by a lower direct
grant left over from before someone's org membership changed.

**A `collab.collaborators` row can never manufacture `RoleOwner` on its
own.** 0029's authority table names `scripts.projects.owner_id` as the sole
authority for ownership; a collaborator row is a projection of that fact
(the one `AddCollaboratorDirect` writes when `CreateProject` registers the
owner), not a second source of it. The first pass mapped a collab role of
`"owner"` straight to `RoleOwner`, which review flagged: reaching that
mapping at all means the fast-path scripts ownership check already said "no"
for this caller, so trusting a collaborator row that disagrees — stale,
mistaken, or corrupt — would let it manufacture owner-level access
(including collaborator management) that scripts itself just refused.
`mapCollabRole` now maps `"owner"` to `RoleNone`: only the fast-path check
can ever produce `RoleOwner`.

**The collaborator-invite quota check now reads the project record through
the same trusted, read-only bypass `ResolveProjectRole`'s org lookup uses,
not the inviting caller's own identity.** `checkCollaboratorQuota` resolved
the project (to find its owner and their plan) via `scripts.GetProject`
authorized as the *inviter* — fine when only the owner could invite, but
after this ADR an org admin can too, and an org admin fails that lookup (only
the literal owner passes scripts' ownership check) — hitting the function's
own fail-open path and skipping the cap entirely. Review caught the
resulting quota bypass. Fixed by using `UserId: ""` (the same "read-only
lookup, not a grant" pattern used elsewhere in this ADR) so the owner and
their plan resolve regardless of who is inviting.

## Alternatives considered & why not

- **Only fix the role granularity, treat the missing checks as separate
  bugs.** Rejected: the missing checks are the more severe half of the
  problem (unauthenticated-relationship access, not merely wrong-role
  access), found by the same audit, in the same files, for the same reason —
  splitting them across tasks would ship the containment fix half-finished.
- **Trust a client-supplied `project_id` for collaborator/comment mutations
  instead of adding collab's `GetResourceProject`.** Rejected outright: this
  is precisely the anti-pattern 0007 already closed once (`uuid.Nil` /
  client-supplied project id for sub-resources); reopening it for a different
  resource type to save one small proto addition is not a trade worth making.
- **Forward the bypass sentinel uniformly, including for comments.**
  Rejected: verified against the actual `CollaborationService.UpdateComment`/
  `DeleteComment` code — it would silently break the self-authorship
  exception for a viewer editing their own comment, trading one bug for a
  different one.
- **Gate comment mutation on a coarse "has some access" check and leave the
  self-vs-moderate distinction to collab-service.** Tried first, rejected on
  review: collab-service's own distinction runs through
  `CheckPermission`, whose fallback bug (#366) admits any caller with no
  `collab.collaborators` row — true of every org-only member — regardless of
  their actual role. A coarse gate does not make that downstream check safe;
  the gateway needs to resolve the same-author-or-not comparison itself.
- **Fix `CollaborationService.CheckPermission`'s fallback bug in this task.**
  Rejected as out of zone: it lives in `server/internal/collab`, not the
  gateway. Tracked separately (Orbit #366) so the fix isn't lost — every
  path that could reach it through the gateway is now gated before it does
  (the comment fix above closes the one path review found still open), but
  the underlying function is still wrong and is a landmine for the next
  collab RPC someone adds without gating it at the gateway first.
- **Prioritise org role over direct collaborator role, or vice versa, instead
  of combining them.** Rejected: no product reason either should mask the
  other, and a fixed priority order (tried first, on review) means "lookup
  order defines privilege" — whichever source happens to be checked first
  wins even when the other source grants more. Taking the higher of the two
  has no failure mode; it's the standard reading of "may act as A *or* B".

## Consequences

- `internal/gateway/handlers/policy.go` (`ProjectRole`, `ProjectAction`,
  `Can`) and the rewritten `internal/gateway/handlers/projectauth.go`
  (`ResolveProjectRole`, `RequireProjectAccess`) are the one place this
  policy lives; `ResolveProjectAccess` no longer exists.
- A stranger with a project id can no longer read its collaborator list,
  add themselves as a collaborator, reassign or remove collaborators, or
  post/edit/delete comments; a viewer can no longer mutate content, push
  sync, emit realtime edit frames, or moderate — edit, resolve, or delete —
  a comment they didn't author, including as an org-only member with no
  `collab.collaborators` row (the specific gap review found in the first
  pass's coarse comment gate).
- An org admin can invite collaborators up to the project owner's actual
  plan cap, not past it — `checkCollaboratorQuota`'s owner/plan lookup no
  longer depends on the inviter's own identity.
- A stale or mistaken `collab.collaborators` row of role `"owner"` for a
  non-owner cannot grant `RoleOwner`; only `scripts.projects.owner_id` can.
- A caller holding both an org role and a direct project role gets the
  higher of the two, regardless of which one `ResolveProjectRole` happens to
  check first.
- `ActionManageProject` (project rename/description/status/star) and
  `ActionDeleteProject` stay owner-only even though the containment matrix's
  "org admin: edit content" language might suggest otherwise — both
  scripts-service calls (`UpdateProject`, `ToggleProjectStar`, `DeleteProject`)
  enforce a literal `IsProjectOwner` check with no org-aware or bypass
  branch, and loosening that is a service-layer change outside this task
  (documented on `handlers.Can`'s doc comment, not just here).
- Dependency failures during resolution (`ResolveProjectRole`) propagate as
  the real gRPC status (`Unavailable`, `DeadlineExceeded`, ...) via
  `apierror.FromError`, never as `PermissionDenied` — a downed dependency
  reads as "try again," never as "you don't have access" or, for a write,
  "proceed."
- Known residual, tracked, not fixed here: `CollaborationService.CheckPermission`'s
  fallback itself (Orbit #366) is still wrong. Every path that could reach it
  through the gateway — including the org-viewer-vs-comment path review
  found still open in the first pass — is gated before it does, so it's
  unreachable via HTTP/WS today; it remains a landmine for the next collab
  RPC someone adds without gating it at the gateway first.
