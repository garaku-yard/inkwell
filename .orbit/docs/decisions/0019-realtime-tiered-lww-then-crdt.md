# 0019 — Real-time co-editing: tiered LWW + presence first, real merge later

**Status:** Accepted (first tier) · the merge-engine choice for the later tier is
still open

## Context

Live collaboration is wanted, but a full conflict-free merge engine (CRDT or OT)
is a large, risky build. Most of the felt value of "real-time" is seeing who else
is here and having edits show up live — which doesn't require character-level
merge for a single-scene-at-a-time editing pattern.

## Decision

Build real-time in **tiers**. Ship the first tier now: a WebSocket transport with
per-project room hubs, Redis cross-instance fan-out, a cluster-wide presence
roster, remote carets, per-scene soft-locks, and durable advisory
`edit_sessions`, with **element-level last-write-wins** for the actual edits (a
shared `useEditorRealtime` hook across the formats). **Defer** a character-level
conflict-free merge engine to a later tier.

## Alternatives considered & why not

- **Full CRDT (e.g. Yjs) from the start.** Deferred: large surface, and the
  element-level LWW + presence tier delivers most of the value first. When the
  later tier is built, **CRDT vs OT is still the open question** (surfaced in the
  Orbit brief) — not yet decided.
- **Operational Transform (OT) now.** Rejected for the first tier: complexity
  outweighs the benefit for the current single-scene editing shape; it's a
  candidate for the later merge tier, not the first ship.

## Consequences

- Element edits can still collide at sub-element granularity; the soft-locks +
  carets make concurrent editing visible, and LWW resolves the rare clash — good
  enough for the current audience.
- `edit_sessions` gives durable advisory locks surfaced as per-scene pips.
- **Vault real-time is shelved** — there's no hosted vault backend, so the
  transport has nothing to fan out for file-based projects.
- The later merge tier (CRDT/OT) remains an explicit [roadmap](../roadmap.md) +
  open-question item.
