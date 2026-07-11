# Brand

> Pointer doc. Inkwell's full visual + voice identity is a curated, public-facing
> brand book that stays at the repo root — this spine slot references it rather
> than duplicating it (one home per fact).

**Canonical brand doc: [BRANDBOOK.md](../../BRANDBOOK.md)** (repo root, linked
from the README's Contributing section).

It covers, in plain English:

- **The name & tagline** — "Inkwell," *Write anything.*; what the brand is NOT
  (not a platform/suite/AI-first product — a **tool**).
- **Voice & tone** — casual, action-first, writer-centric; per-context tone
  table; dos and don'ts. (The engineering-side "collaboration style" — brand
  voice for copy — is echoed in [conventions.md](./conventions.md).)
- **Logo system** — the nib-and-ink-drop monogram (`<BrandLogo>`), wordmark,
  hero logo, favicon/app icons, clear space, misuses.
- **Colour palette** — OKLch tokens (warm cream light / warm green-charcoal
  dark, hue 145), the single teal accent, semantic signals, chart scale. Values
  track `client/app/globals.css` exactly.
- **Typography** — Geist for UI; Lora/Merriweather serifs for prose surfaces;
  per-editor font prefs.
- **Iconography** — Lucide only.
- **UI system** — radius scale (`--radius: 0.625rem`), elevation, spacing,
  touch-target + reading-measure rules.
- **Visual motifs** — the Beat Board, and the **Editor canvas** as a brand
  surface (the "one page everywhere" A4-sheets-on-a-desk contract, pinned by
  `PagedSheets.smoke.test.tsx`).

**Why this is a pointer, not a rewrite:** `BRANDBOOK.md` is referenced from the
public README and is self-sufficient for outside contributors; its location at
root is part of its meaning. Editing the brand belongs in that file.

**Open brand to-dos** (tracked in BRANDBOOK, surfaced on the
[roadmap](./roadmap.md)): Apple touch / maskable PWA icons, an Open-Graph image,
and an optional display serif for marketing pull quotes.
