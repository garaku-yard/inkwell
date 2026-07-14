# Inkwell — Claude session guide

> **Tracked and shared** (it used to be gitignored — a fresh clone then had no
> session guide at all, so a new teammate's Claude never learned the studio's
> conventions or that this machine needs wiring into Orbit). It's the one file
> auto-loaded every session, so it stays a short pointer + the always-on
> guardrails. The real, detailed docs live in the Orbit spine and are read on
> demand. Keep it short, and keep personal scratch out of it.

## Read these first (`.orbit/docs/`)

1. [`overview.md`](.orbit/docs/overview.md) — what Inkwell is, the problem, the north star.
2. [`architecture.md`](.orbit/docs/architecture.md) — the two halves, storage abstraction, services, boundaries.
3. [`conventions.md`](.orbit/docs/conventions.md) — git standard + Go/TS language letter + engineering taste.
4. [`decisions/`](.orbit/docs/decisions/) — the why-log (21 ADRs). The crown jewels.

Then as needed: [`runbook.md`](.orbit/docs/runbook.md) (run/build/test/deploy),
[`roadmap.md`](.orbit/docs/roadmap.md) (what's next),
[`glossary.md`](.orbit/docs/glossary.md) (domain vocabulary),
[`changelog.md`](.orbit/docs/changelog.md) (what shipped),
[`reference/sync-engine.md`](.orbit/docs/reference/sync-engine.md),
[`brand.md`](.orbit/docs/brand.md) → [`BRANDBOOK.md`](BRANDBOOK.md).
Public/contributor docs stay at root: `README.md`, `CONTRIBUTING.md`,
`PLANNING.md` (live status), `RELEASING.md`, `LICENSE`.

## Always-on guardrails (kept here on purpose)

**Git**
- Conventional Commits; imperative subject; body explains the *why*.
- **Branch + PR** is the recorded standard. (Prior local practice was
  commit-to-main; confirm the workflow per task.)
- One logical change per commit.
- **Never** append `Co-Authored-By` or any AI-author trailer — commits are the
  user's; the assistant is tooling.
- Never override git identity.

**Collaboration style**
- **Efficiency first** — no long preambles, no trailing summaries.
- **Defer big items explicitly and track them** (roadmap) — never silently skip.
- **Fix root causes, not band-aids.** Honesty over fake success (no toasts that
  do nothing; if tests fail, say so).
- **Rule of three before extracting.** Two copies stay duplicated.
- **Don't generalise across features that only look similar** — refuse
  `<BaseEditor>`-style mega-abstractions; the nine formats are stable. When reuse
  is real, use **engine + per-format config** (see
  [decisions/0012](.orbit/docs/decisions/0012-engine-plus-config-over-baseeditor.md)).
- **Verify behaviour**: type-check + tests + keep the smoke harness; add a smoke
  test before extracting save logic.

**Voice & surface**
- Brand voice: quiet craft, writer-centric, action-first. No "empower / unleash /
  journey." Dark mode is the warm charcoal `#1f2420` family. Desktop is Tauri.
  README describes the vault as on-disk markdown + wikilinks + backlinks (don't
  name Obsidian).

_Docs ownership: evergreen spine docs are rewritten freely to match reality;
`decisions/`, `changelog.md`, and `log/` are append-only — supersede, don't
rewrite. Full detail in [`conventions.md`](.orbit/docs/conventions.md)._

## Orbit — the studio's board (check this at session start)

This repo is tracked by **Orbit**, the studio's mission control at
<https://orbit.garakuyard.com>: live presence, the task board, the read arrow
(what's on you *here*), plan capture, and `ask_teammate`.

**First, check this machine is wired in.** Run `command -v orbit`.

- **Not found** → this machine isn't set up. Presence, the board, the read/write
  arrows and `ask_teammate` are all inert: nothing done here reaches the board or
  the other person. Say so plainly, and **offer** to run the one-time setup —
  `bash <path-to>/orbit/scripts/onboard.sh` (the `orbit` repo is a sibling
  checkout of this one). It installs the CLI, signs the machine in, and wires the
  Claude hooks + MCP server. **Ask first — never run it unprompted.**
- **Found, but something's off** (no presence, no Orbit MCP tools, stale
  behaviour) → `orbit onboard --check` reports which of the four pieces — binary,
  token, hooks, MCP — is missing. `orbit onboard` fixes only what's missing.

Setup is **per-machine, not per-person**: a teammate on a second laptop runs the
exact same thing. The only person-level step is the server allowlist — if sign-in
is refused, that GitHub login isn't in `ORBIT_ALLOWED_LOGINS` and an admin adds it.

*(Hooks and the MCP server only load at session start — restart the session after setup.)*
