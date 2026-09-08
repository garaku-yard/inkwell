# 0031 — Explicit scripts access assertions replace missing identity

**Status:** Accepted  
**Date:** 2026-09-08  
**Scope:** gateway ↔ scripts gRPC boundary

## Context

Scripts RPCs overloaded an empty `user_id` to mean “the gateway already
authorized this caller.” Missing identity therefore carried authority, erased
the actor needed for auditability, and made an accidentally omitted field
indistinguishable from a deliberate authorization decision.

The gateway owns application authorization across scripts ownership, workspace
organization membership, and collaboration grants (0029, 0030). Scripts still
owns project/resource integrity and is the sole authority for literal project
ownership.

## Decision

Every protected scripts RPC carries:

- the real authenticated actor in `user_id`; and
- an additive `CallerRole` field containing the gateway's resolved role.

The concrete RPC is the requested action. Scripts maps it to a minimum role:
viewer for reads and editor for content mutations. We deliberately do not add a
second action enum that could disagree with the RPC being invoked. Likewise,
the role's source is not sent because scripts has no source-dependent policy;
the gateway combines applicable sources before dispatch.

Scripts rejects a missing actor, an unspecified/unknown role, and a role below
the RPC's minimum. It independently checks `projects.owner_id` before accepting
an owner claim. Owner-only project management continues to ignore the asserted
role and verify ownership directly.

`GetProjectAccessMetadata` replaces the unauthenticated full-project read used
to bootstrap authorization. It returns only `owner_id` and `org_id`. Like
`GetResourceProject`, it is an internal lookup rather than an authorization
grant.

## Rollout

The protobuf change is wire-compatible because fields and the metadata RPC are
additive. The behavior is intentionally a hard cut: mixed gateway/scripts
versions are not compatible for non-owner project access.

| Gateway | Scripts | Result |
|---|---|---|
| old | old | Legacy sentinel behavior |
| old | new | Non-owner calls are rejected because actor/role are absent |
| new | old | Non-owner calls are rejected because the old server ignores `caller_role` |
| new | new | Explicit actor and role contract |

Deploy gateway and scripts together in a maintenance window, then verify a
viewer read, editor mutation, and owner-only mutation before restoring normal
traffic. We reject a compatibility flag that temporarily preserves the empty-ID
bypass: it would keep the security ambiguity this task exists to remove and
would require a third cleanup deployment. If zero-downtime independent rollout
becomes a production requirement, introduce versioned RPCs rather than making
missing identity authoritative again.

## Consequences

- Actor identity remains available throughout scripts operations and events.
- Viewer/editor policy is enforced at both the gateway and the scripts boundary.
- An omitted identity or role fails closed.
- Authorization bootstrap and quota enforcement no longer expose a full project
  through an unauthenticated `GetProject` call.
- Gateway and scripts must be deployed as one compatibility unit for this
  migration, despite remaining separate services afterward.

## Rejected alternatives

- **Keep the empty-ID sentinel for a compatibility window.** It preserves the
  exact ambiguous authority channel being removed.
- **Trust a boolean `authorized=true`.** It loses the role needed to enforce the
  operation's minimum permission and is easy to misapply.
- **Have scripts call workspace and collab.** It duplicates gateway
  orchestration, reverses dependency direction, and adds synchronous calls.
- **Add an authorization service or signed capability token.** The services run
  on a trusted internal network today; either option adds complexity without a
  demonstrated threat or scaling requirement.
