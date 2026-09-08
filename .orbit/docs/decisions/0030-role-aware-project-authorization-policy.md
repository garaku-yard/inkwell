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
`ActionManageCollaborators` / `ActionCommentAdd` / `ActionRead` as
appropriate; the four `scripts` handlers gate on `ActionEditContent`.
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
  for a sub-resource" rule 0007 exists to enforce.

**Comment mutation deliberately forwards the caller's real id, not the
bypass sentinel.** `CollaborationService.UpdateComment`/`DeleteComment`
already distinguish "editing my own comment" (viewer-permitted) from
"moderating someone else's" (editor+) by comparing the real caller id against
the comment's author. Forwarding the sentinel there would erase that
distinction — the gateway's role check stays a coarse gate (does this caller
have any real relationship to the project), and the finer authorship rule
stays exactly where it already worked correctly.

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
- **Fix `CollaborationService.CheckPermission`'s fallback bug in this task.**
  Rejected as out of zone: it lives in `server/internal/collab`, not the
  gateway, and every path that could reach it through the gateway is now
  gated before it does. Tracked separately (Orbit #366) so the fix isn't
  lost, not silently left for someone to rediscover.

## Consequences

- `internal/gateway/handlers/policy.go` (`ProjectRole`, `ProjectAction`,
  `Can`) and the rewritten `internal/gateway/handlers/projectauth.go`
  (`ResolveProjectRole`, `RequireProjectAccess`) are the one place this
  policy lives; `ResolveProjectAccess` no longer exists.
- A stranger with a project id can no longer read its collaborator list,
  add themselves as a collaborator, reassign or remove collaborators, or
  post/edit/delete comments; a viewer can no longer mutate content, push
  sync, moderate someone else's comment, or emit realtime edit frames.
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
  fallback (Orbit #366).
