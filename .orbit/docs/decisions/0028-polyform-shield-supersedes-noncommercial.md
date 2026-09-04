# 0028 — PolyForm Shield 1.0.0 supersedes PolyForm Noncommercial

**Status:** Accepted · 2026-09-04

Supersedes [0003](./0003-polyform-noncommercial-license.md).

## Context

0003 licensed Inkwell under PolyForm Noncommercial 1.0.0: free for any
**noncommercial** purpose, commercial use gated behind a separate agreement.
That clause is narrower than what the maintainers actually want.
Noncommercial's own "Personal Uses" grant only covers use "without any
anticipated commercial application" — read literally, an indie novelist or
game writer who intends to sell what they write with Inkwell falls outside
it, since selling their manuscript is an anticipated commercial application
of that personal use. That's the opposite of the intent: individuals should
be free to use Inkwell for anything, including work they intend to sell, and
a company should be free to run it for its own internal work. The only thing
the maintainers want reserved is someone else turning around and offering
Inkwell itself, or the hosting/workspaces/org-admin product built on it, to
other people.

README also stated Inkwell was "open-source" while linking a license that
restricts a field of use — a direct self-contradiction. PolyForm Noncommercial
is source-available, not OSI open source, and no license considered here
changes that; the fix is in what we call it, not just which one we pick.

## Decision

Relicense under **PolyForm Shield 1.0.0**. Any purpose is permitted —
personal, freelance/commercial writing, and internal business use, no
revenue or seat limit — except **competing use**: providing a product that
competes with Inkwell, or with any product the licensor provides using
Inkwell (the hosting plans, workspaces, and org/admin features). Internal
use at a company is not "providing to others," so it stays unrestricted.

README and PLANNING.md now say "source-available," not "open-source."

## Alternatives considered & why not

- **Stay on PolyForm Noncommercial.** Rejected: the "no anticipated
  commercial application" wording is stricter than intended and puts a
  chunk of the actual target audience (writers selling their own work) in a
  gray area they shouldn't have to think about.
- **PolyForm Perimeter.** Rejected: its noncompete clause only protects
  Inkwell-the-software from a substitute product. It has no equivalent of
  Shield's "or any product the licensor... provides using the software," so
  it doesn't reserve the hosting/workspaces/org-admin business the way we
  need.
- **Business Source License 1.1.** Rejected: defaults to blocking *all*
  production use, including our own users' internal use, unless the
  licensor hand-drafts a per-release "Additional Use Grant" carving out
  what's permitted — more custom legal surface than Shield needs, and it
  converts only to a GPL-compatible license.
- **Functional Source License 1.1.** Considered seriously — same
  competing-use shape as Shield, plus each release auto-converts to
  MIT/Apache-2.0 two years after publish. Deferred rather than rejected: the
  rolling conversion means the current release is always still the
  restricted one, which doesn't change anything about what ships today.
  Worth revisiting later if we want a credible "this becomes real open
  source" story.
- **MIT / Apache-2.0, AGPL-3.0, fully proprietary.** Same reasoning as 0003 —
  still rejected for the same reasons.

## Consequences

- Individuals get unambiguous free use for any purpose, including
  commercial writing — the gap in 0003 is closed.
- Businesses get free internal use with no size or seat threshold.
- The open-core monetization model ([0020](./0020-monetization-open-core-paddle.md))
  is still coherent: Shield's "or any product the licensor... provides
  using the software" clause is what reserves the hosting/workspaces/admin
  business, more explicitly than Noncommercial's blanket commercial-use gate
  did.
- `LICENSE` at the repo root is canonical; GitHub detects it. The spine
  references it, never duplicates the terms.
- The repo is still private on GitHub as of this writing — relicensing does
  not by itself make Inkwell public.
