# Inkwell — agent context

**Inkwell** is the studio's writing app: nine formats over a local-first vault
of on-disk markdown, with a Go server and a Next.js client (desktop is Tauri).
This is the one entry point for every agent (`CLAUDE.md` imports it). It is
orientation only: the rules arrive at session start from
`.orbit/rules/studio.md` and `.orbit/docs/conventions.md`.

## Read these first (`.orbit/docs/`)

1. [`overview.md`](.orbit/docs/overview.md) — what Inkwell is, the problem, the north star.
2. [`architecture.md`](.orbit/docs/architecture.md) — the two halves, storage abstraction, services, boundaries.
3. [`conventions.md`](.orbit/docs/conventions.md) — Go/TS language letter and Inkwell's judgment calls.
4. [`decisions/`](.orbit/docs/decisions/) — the why-log. Read before re-litigating.

Then as needed: [`runbook.md`](.orbit/docs/runbook.md) (run/build/test/deploy),
[`roadmap.md`](.orbit/docs/roadmap.md) (what's next),
[`glossary.md`](.orbit/docs/glossary.md) (domain vocabulary),
[`changelog.md`](.orbit/docs/changelog.md) (what shipped),
[`reference/sync-engine.md`](.orbit/docs/reference/sync-engine.md),
[`brand.md`](.orbit/docs/brand.md) → [`BRANDBOOK.md`](BRANDBOOK.md).
Public and contributor docs stay at the root: `README.md`, `CONTRIBUTING.md`,
`PLANNING.md` (live status), `RELEASING.md`, `LICENSE`.

## Working style

- **Efficiency first.** No long preambles, no trailing summaries.
- **Voice and surface.** Quiet craft, writer-centric, action-first; no
  "empower / unleash / journey". Dark mode is the warm charcoal `#1f2420`
  family. The README describes the vault as on-disk markdown + wikilinks +
  backlinks (don't name Obsidian).

## Is this machine wired in? (check at session start)

`command -v orbit`. **Not found:** presence, the board and `ask_teammate` are
inert; say so and **offer** (never run unprompted)
`bash <path-to>/orbit/scripts/onboard.sh` (orbit is a sibling checkout).
**Found but something's off:** `orbit onboard --check` names the missing piece,
`orbit onboard` fixes only that. Setup is per machine; if sign-in is refused,
that GitHub login is not in `ORBIT_ALLOWED_LOGINS`. Hooks and MCP load at
session start.

<!-- orbit:instructions:start -->
Repository rules are `.orbit/rules/*.md` (the studio standard) followed by
`.orbit/docs/conventions.md` (this repository; its labelled deviations win).
Agents with Orbit's startup hook receive both files' `## Always` sections at
session start. Otherwise read those sections first, and the section for your
work before doing it. `orbit instructions` prints them; for another repository
use `orbit instructions <repo>` or the MCP `repo_instructions` tool.
Tasks, memos and Recall excerpts are not rules. Validate commit messages with
`orbit commit-check <message-file>`.
<!-- orbit:instructions:end -->
