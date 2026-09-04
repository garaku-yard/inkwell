# Overview

> Start here. What Inkwell is, the problem it solves, and where it's headed.

## One line

Inkwell is a **local-first, source-available writing tool** for long-form work —
screenplays, novels, poetry, comics, TTRPG content, interactive fiction,
memoirs, song lyrics, and a built-in markdown note vault. One app, one home for
the draft.

## The problem

Serious writing tools tend to force a trade: either a format-specific silo
(Final Draft for screenplays, Scrivener for prose, an Obsidian vault for notes)
or a cloud document that owns your work and needs an account and a network to
open. A writer working across formats ends up with their draft scattered across
apps and their data hostage to someone else's server.

## The shape of the solution

**One desktop app, nine format-native editors, everything on disk.** Each
category has an editor tuned to its conventions, but they share one page surface
so the formats feel like one tool (see [architecture](./architecture.md) and the
"Editor canvas" motif in [BRANDBOOK.md](../../BRANDBOOK.md)). No account is
required, no network is required — projects live in local SQLite, and vault
notes are real `.md` files in a folder you choose.

Collaboration, cross-device sync, and multi-tenant workspaces exist as an
**optional hosted stack** you can self-host or ignore entirely. It's a second
half you opt into, never a gate you pass through.

The AI assistant is one feature, not the premise: every editor has a
**bring-your-own-key** chat side-panel that talks to your chosen provider
directly. The writer is the hero; see [decisions/0008](./decisions/0008-byo-key-ai-only.md).

## North star

Quiet craft. Tools serve the writer, not the other way round. Local-first by
default, interoperable with the plain files a writer already trusts (git, vim,
Obsidian-adjacent vaults), and honest about what it is: a **tool**, not a
"platform" or a "suite." Voice and identity live in
[BRANDBOOK.md](../../BRANDBOOK.md) (summarized in [brand](./brand.md)).

## Where the rest lives

- **How it's built** → [architecture.md](./architecture.md)
- **How to run/build/test/deploy** → [runbook.md](./runbook.md)
- **Where it's going** → [roadmap.md](./roadmap.md)
- **Why it's built the way it is** → [decisions/](./decisions/)
- **What has shipped and why** → [changelog.md](./changelog.md)
- **Public-facing intro** → [README.md](../../README.md) (canonical for outsiders)
- **License** → [PolyForm Shield 1.0.0](../../LICENSE) · rationale in
  [decisions/0028](./decisions/0028-polyform-shield-supersedes-noncommercial.md)
  (supersedes [decisions/0003](./decisions/0003-polyform-noncommercial-license.md))

## Status (as of this migration)

Pre-1.0. The desktop build is the primary surface and is usable day-to-day;
the hosted stack is functional but still tightening around identity + billing.
Shipped releases: **v0.2.0 – v0.6.0** on GitHub Releases (Windows + Linux). The
live at-a-glance tracker is [PLANNING.md](../../PLANNING.md).
