# 0026 — Local organizations when signed out

**Status:** Accepted · 2026-08-05 · amends [0023](./0023-orgs-via-gateway.md)

## Context

[0023](./0023-orgs-via-gateway.md) made organizations the one desktop domain
served by the gateway, reasoning that an org is shared multi-user tenancy —
members, seats, invites — and that there is nothing coherent to model in a
single-user local database. Everything in `OrganizationStorage` was therefore
gated on a linked cloud account: reads degrade to empty, writes refuse, and
`AddWorkspaceDialog` hides the org affordance entirely when signed out.

That reasoning holds for *membership*. It does not hold for what the maintainer
actually wanted, which surfaced by hitting the wall: they went to sign in purely
to reach an org they use to group their own work, could not (the gateway is not
running, and [0001](./0001-local-first-architecture.md) means it usually isn't),
and were blocked from an entirely local activity by a remote dependency.

Two things were already true and made the gate look arbitrary:

- `workspaces.createOrg` on the desktop already creates a **purely local** org
  row (`workspaces.type = 'org'`), described as such in the contract.
- Org-owned *projects* are already local ([0024](./0024-org-projects-local.md)):
  `projects.org_id` tags them, and `listProjects` reads this disk, signed out
  and offline.

So the desktop could already store an org and its projects. The only thing
missing was that the rail lists orgs from `OrganizationStorage`, which answered
"none" without a cloud account — the local row existed and nothing showed it.

## Decision

**An organization is a local object that a cloud account can extend, not a
remote object the desktop borrows.**

Signed out, the desktop serves orgs from its own SQLite: creating, renaming,
deleting and listing them, and grouping projects under them. Local orgs are
backed by the org workspace rows that already exist, so no new table and no
migration — an org's id is its workspace id, which is exactly what
`projects.org_id` already points at.

Signed in, the gateway behaviour of 0023 is untouched: `list` returns local orgs
*and* the account's remote ones, and `create` still makes a real one server-side.
The two coexist rather than one shadowing the other, so linking an account never
hides work that was already here.

**A local org has one member and cannot gain another.** Inviting, changing roles
and setting seats are the parts of 0023 that genuinely need a server, and on a
local org they fail with a message saying so rather than pretending. `seats`
reports one of one; `listMembers` reports the local profile as owner. That is the
honest shape of a single-user org, not a degraded one.

## Alternatives considered & why not

- **Keep the gate; tell the user to run the gateway.** Rejected: it makes a
  local-first app demand a server to organise files on its own disk, and
  [0001](./0001-local-first-architecture.md) exists to prevent exactly that.
- **A separate `organizations` table.** Rejected: `workspaces.type = 'org'`
  already holds this data and `projects.org_id` already references it. A second
  table would need a migration, a mapping, and a rule for which one wins.
- **Sync local orgs to the account on sign-in.** Rejected for now — deliberately.
  Promoting a local org to a real one means minting a server-side org, deciding
  what happens to its projects' `org_id`, and being wrong in a way that is hard
  to undo. Left as a later decision; local orgs stay local.
- **Make orgs purely local everywhere and drop the gateway path.** Rejected: the
  hosted build has real multi-user orgs and 0023's transport works. This amends
  0023 rather than reversing it.

## Consequences

- **The desktop no longer needs an account to organise work.** Sign-in becomes
  what it should be — optional, for collaboration and sync.
- **Two kinds of org exist on one machine**, distinguishable only by whether the
  id resolves locally. Every write checks that first and routes accordingly.
  That branch is the cost of this decision.
- **A local org cannot become a shared one** without the promotion path this ADR
  declines to design. Anyone who builds an org locally and later wants their
  co-writers in it will need that path; until then the answer is "make a new one
  while signed in", which is a real limitation and should be said plainly.
- **Nothing local ever leaves the device**, which is the property the maintainer
  asked for. Local orgs have no sync semantics at all — not "sync later", none.
