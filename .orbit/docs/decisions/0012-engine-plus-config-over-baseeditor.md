# 0012 — Engine + per-format config over a `<BaseEditor>`

**Status:** Accepted

## Context

Inkwell has nine format-native editors that share real machinery (keymaps,
autosave, a cursor-stable contentEditable, a paged page surface). The recurring
temptation — voiced by refactor passes — is to unify them behind a single
`<BaseEditor>` or a "project shell" component.

## Decision

**Refuse the mega-abstraction.** Where reuse is real, extract a **minimal generic
engine** and let each format own its **config**: `lib/editor/keymap.ts` (engine) +
`components/editor/screenplay/keymap.ts` (config);
`components/editor/shared/StableContentEditable.tsx`; `useElementAutosave`;
`useProjectLoader`; `PagedSheets`/`SheetMetrics`. Apply the **rule of three**: a
pattern needs 3+ concrete appearances before it becomes shared; two copies stay
duplicated.

## Alternatives considered & why not

- **A single `<BaseEditor>` for all nine formats.** Rejected: the formats differ in
  element vocabulary and interaction enough that one component becomes props-soup
  that fits none of the call sites. Concrete beats abstract; the nine formats are
  stable.
- **A shadcn-wrapping "project shell" that adds nothing.** Rejected: indirection
  without value.
- **Full duplication with no shared engine.** Rejected too: the keymap dispatcher,
  autosave, and paged surface are genuinely identical and earned extraction.

## Consequences

- Reusable parts are small and boring; per-format complexity stays in per-format
  files. New formats extend the engine, they don't fork the page.
- Five sites that *looked* shared but failed the rule of three (Ctrl+S handler,
  comment CRUD, settings shell, save-button state machine, AIChatPanel mount)
  deliberately stayed inline.
- This is the standing answer when a review proposes "unify all N editors" — see
  [conventions.md](../conventions.md).
