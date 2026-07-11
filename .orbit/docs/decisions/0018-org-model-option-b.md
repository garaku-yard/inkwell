# 0018 — First-class organizations, Option B (org owns projects)

**Status:** Accepted

## Context

Teams and the Business billing tier need real multi-user tenancy. Inkwell already
had *workspaces* (a per-category grouping/switcher surface), but a workspace is not
a tenant that can own shared work or carry per-seat billing.

## Decision

Introduce **first-class organizations** (GitHub-style, one login belongs to
personal + org contexts). Choose **Option B: the organization owns the projects**
— projects belong to the org, and org members get access transitively. Org member
authorization, seat enforcement, an invites inbox, and org settings sit on top.

## Alternatives considered & why not

- **Option A: the user owns projects and shares them into the org.** Rejected:
  ownership becomes ambiguous when a member leaves — their projects would walk out
  with them. Org-owned projects survive membership changes cleanly, which is the
  point of a business tenant.
- **Reuse workspaces as the tenant.** Rejected: workspaces are a personal,
  per-category grouping construct; overloading them with membership + billing +
  ownership would conflate two different ideas.

## Consequences

- Projects gain an org owner; access resolves through org membership.
- Seat count is owner-adjustable and ties directly into the per-seat Business tier
  ([0020](./0020-monetization-open-core-paddle.md)).
- Org vs workspace is a glossary distinction worth keeping straight
  ([glossary.md](../glossary.md)).
