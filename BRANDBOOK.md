# Inkwell — Brand Book

> A plain-English guide to how Inkwell looks, sounds, and feels.
> Current as of the first public release. Extrapolations from the
> existing codebase are clearly marked as such.

---

## 1. The name

**Inkwell** is the small vessel of ink a writer dips their pen into. It's the
quiet pause between one sentence and the next. It's craft before technology —
a reminder that tools exist to serve the writer, not the other way round.

The name anchors three qualities we carry everywhere:

- **Quiet craft.** Not loud, not clever, not chasing novelty.
- **For any writer.** Screenwriters, novelists, poets, lyricists — one vessel,
  many hands.
- **Starts small.** Every story begins with a drop.

### Tagline

> **Write anything.**

The tagline lives in the HTML `<meta name="description">` today
(`client/app/layout.tsx:19`). It's direct, inviting, and category-agnostic.
Use it as-is in marketing surfaces. If a longer line is needed for a hero
or OG image, extend it as: *"Write anything. Screenplay, novel, comic,
poetry, and more."*

### What Inkwell is NOT

- Not a "dashboard," "platform," or "suite" in our own copy. We are a **tool**.
- Not AI-first. The AI assistant is one feature; the writer is the hero.
- Not corporate. Avoid marketing-ese: "empower," "leverage," "unleash," etc.

---

## 2. Voice & tone

### Voice (constant)

**Casual, action-first, writer-centric.** Short sentences. Imperative mood
when prompting action. Plain words before clever ones. Never talks down to
the user.

### Tone (varies by context)

| Context | Tone | Example (from product today) |
|---|---|---|
| Onboarding | Warm, empowering | *"Sign in to your account to continue writing"* |
| CTAs | Active, concrete | *"Start writing your screenplay today"* |
| Empty states | Gentle, instructional | *"No scenes yet. Start writing to see the structure."* |
| Friendly prompts | Personified, helpful | *"Your Beat Board is Empty. Double-click to create a beat or drop an image."* |
| System / errors | Direct, blameless | *"Missing required fields"* · *"Failed to load subscriptions"* |
| Admin / billing | Functional, neutral | *"Tier updated. Subscription tier has been updated successfully."* |

### Dos and don'ts

**Do:**
- Start CTAs with a verb: *Start writing. Create beat. Import script.*
- In empty states, tell the user what to do next in one sentence.
- Use "your" when talking about the user's stuff ("Your Beat Board").
- Keep error messages under 10 words when possible.

**Don't:**
- ❌ "Welcome to your writing journey!" (saccharine)
- ❌ "Oops! Something went wrong." (infantilising; say what went wrong)
- ❌ "Unleash your creative potential" (corporate)
- ❌ "We've sent a verification email to your inbox." (verbose; say
  "Check your email to verify.")

### Product name voice

Write **Inkwell** as one word, capitalised. Never *inkwell*, *INKWELL*, or
*Ink-well*. In body copy, avoid self-referential branding — don't write
*"Inkwell's Beat Board"*, just *"the Beat Board"*.

---

## 3. Logo system

### The monogram (primary mark)

A **nib-and-ink-drop monogram** — a fountain-pen nib over a teardrop ink
loop, drawn as vertical line-art. It ships in two colour variants that swap
by theme rather than inverting a fill:

- Light mode: charcoal mark (`#1f2420` family) on transparent
- Dark mode: cream/ivory mark on transparent

Live in code via `<BrandLogo show="mark">` (`client/components/brand-logo.tsx`),
which renders both variants and toggles on the `.dark` class:
- `client/components/AppHeader.tsx` (page header)
- `client/components/window-titlebar.tsx` (desktop titlebar)
- `client/app/(public)/login/page.tsx` + `register/page.tsx` (auth `lockup`)

Trimmed PNG assets: `client/public/brand/inkwell-mark-{dark,light}.png`.

**Sizes:**
- Titlebar: `h-4` (16 px)
- Header: `h-7` (28 px)
- Auth lockup: `h-14` (56 px), wordmark stacked beneath
- Marketing (extrapolation): 48 px minimum at 1× density; never below 24 px.

### Wordmark

A thin geometric uppercase **"INKWELL"**, shipped as image assets (not set in
a live font), in the same charcoal/cream theme pair as the monogram. Rendered
via `<BrandLogo show="wordmark">`; trimmed PNGs at
`client/public/brand/inkwell-wordmark-{dark,light}.png`. Use alongside the
monogram in headers, documentation, and social profiles. For contexts where
space is tight (favicon, app icon), use the monogram alone.

### Assets

**Shipped:**
- **Favicon** — `client/app/icon.png` (512 px) + `client/app/favicon.ico`
  (multi-size): the cream monogram on a warm-charcoal rounded square.
- **OS app icon** — `client/src-tauri/icons/*` (every platform variant)
  regenerated from the nib monogram via `tauri icon`. `source.svg` embeds the
  mark so `rsvg-convert source.svg | tauri icon` reproduces the full set.

**Web and social:**
- **Apple touch icon** — `client/public/brand/apple-touch-icon.png` (180 px).
- **Maskable PWA icon** — `client/public/brand/maskable-icon.png` (512 px),
  with an opaque charcoal field and the monogram inside the mask-safe area.
- **Open-graph image** — `client/public/brand/open-graph.png` (1200 × 630):
  monogram + wordmark + “Write anything.” on a quiet warm-paper field.

### Clear space

Leave a margin equal to the nib's width around the monogram on all sides.
Don't place text, icons, or imagery closer than that.

### Misuses

- ❌ Don't re-colour the monogram outside the charcoal/cream theme pair.
- ❌ Don't outline, add shadows, or place on busy photography without a scrim.
- ❌ Don't stretch, rotate, or distort.

---

## 4. Colour palette

All colours are expressed in OKLch for perceptual consistency. Hex/RGB
equivalents are provided for tools that don't support OKLch. Values below
match `client/app/globals.css` exactly.

### Neutral system

Light surfaces use hue 95 (warm cream). Dark surfaces use hue 145 (warm green-charcoal).
Both are low-chroma — colour reads as warmth, not tint.

| Token | Light (OKLch) | Dark (OKLch) | Role |
|---|---|---|---|
| `--background` | `oklch(0.972 0.006 95)` | `oklch(0.165 0.008 145)` | Page canvas |
| `--foreground` | `oklch(0.147 0.004 49.25)` | `oklch(0.92 0.004 106)` | Primary text |
| `--card` | `oklch(0.985 0.004 95)` | `oklch(0.195 0.008 145)` | Raised surfaces |
| `--muted` | `oklch(0.938 0.008 95)` | `oklch(0.245 0.008 145)` | Secondary surfaces |
| `--muted-foreground` | `oklch(0.553 0.013 58.071)` | `oklch(0.60 0.008 145)` | Secondary text |
| `--border` | `oklch(0.900 0.006 95)` | `oklch(1 0 0 / 8%)` | Hairlines |
| `--ring` | `oklch(0.50 0.010 145)` | `oklch(0.50 0.010 145)` | Focus rings (brand) |
| `--primary` | `oklch(0.20 0.012 145)` | `oklch(0.88 0.004 106)` | Buttons, key actions |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | Errors, destructive CTAs |

Inkwell is deliberately low-chroma. The palette is neutral-first; colour is
reserved for **meaning**, not decoration.

### Accent

**Teal** is the single brand accent colour. It currently appears as Tailwind
`bg-teal-500` on the invite badge (`client/components/AppHeader.tsx:42`).

| Token (proposed) | Value | Role |
|---|---|---|
| `--accent-ink` | `#14b8a6` (Tailwind teal-500) | Badges, highlights, links in marketing |

Use sparingly. Teal should feel like a held breath — present but never loud.
If two accent areas would touch, let only one carry teal.

### Semantic signals

| Signal | Light | Dark | Use |
|---|---|---|---|
| Success | `bg-green-100` / `text-green-700` | `bg-green-900/20` / `text-green-300` | Confirmations (register page) |
| Error | `--destructive` | `--destructive` | Toasts, invalid fields |
| Info | `--muted` | `--muted` | Inline hints |

### Chart palette

Charts already define `--chart-1` through `--chart-5` in `globals.css`. Treat
these as an internal scale — prefer them over ad-hoc hex for data viz. When
more than five series are needed, fall back to interpolation, not invention.

### Dark mode

All dark surfaces share hue 145 (warm green-charcoal). Chroma is kept at 0.008
throughout so tones read as neutral but never cold.

| Token | OKLch | Approx hex | Role |
|---|---|---|---|
| `--background` | `oklch(0.165 0.008 145)` | `#1f2420` | Page canvas |
| `--card` | `oklch(0.195 0.008 145)` | `#262d28` | Raised surfaces, dialogs |
| `--secondary` / `--muted` | `oklch(0.245 0.008 145)` | `#2e3631` | Hover / interactive surfaces |
| `--sidebar` | `oklch(0.145 0.008 145)` | `#191e1b` | Nav rail — recedes behind canvas |
| `--muted-foreground` | `oklch(0.60 0.008 145)` | — | Subdued labels, placeholders |
| `--foreground` | `oklch(0.92 0.004 106)` | — | Primary text (warm off-white) |
| `--grid-color` | `#2d3530` | — | Beat-board grid lines |

---

## 5. Typography

### Families

**Geist** does all the work today (`client/app/layout.tsx:7-15`).

- `--font-geist-sans` — UI, headings, body copy, long-form writing surfaces.
- `--font-geist-mono` — code samples, element types in the editor, system
  metadata.

The monogram no longer relies on `font-serif` — it's a drawn nib mark shipped
as an image (see §3). Serif faces (Lora, Merriweather) are loaded via
`next/font` for the editor's prose surfaces. **Recommendation:** if a brand
display serif is wanted for long-form marketing pull quotes, load a warm
humanist serif (e.g. Fraunces, Source Serif 4, or Newsreader) as
`--font-serif`. This gives the brand a "quiet craft" texture without
overspending typographically.

### Hierarchy (extrapolation — codify once adopted)

| Level | Weight | Size | Letter-spacing |
|---|---|---|---|
| Display (marketing) | 700 | 3.5–5 rem | -0.02em |
| Page heading (h1) | 700 | 1.875 rem (`text-3xl`) | -0.01em |
| Section heading (h2) | 600 | 1.25 rem (`text-xl`) | 0 |
| Body | 400 | 0.875 rem (`text-sm`) | 0 |
| Caption | 500 | 0.75 rem (`text-xs`) | 0.02em |

Line-height: 1.5 for body, 1.2 for display. Writing surfaces inside editors
use the editor's own stack (Courier for screenplays, default serif for prose);
the brand typography applies to UI chrome only.

---

## 6. Iconography

We use **Lucide**. Stick to it. Stroke-weight default (1.5–2 px). Size 16 px
inside buttons, 20 px inline with text, 24 px as standalone affordances.

Do not mix icon libraries. If Lucide doesn't have what you need, consider
whether the control needs an icon at all — text is often clearer.

---

## 7. UI system

### Corner radius

Base token: `--radius: 0.625rem` (10 px). Derived scale in globals.css.

| Surface | Radius | Example |
|---|---|---|
| Buttons, inputs | `rounded-md` | All form chrome |
| Cards | `rounded-xl` | Dashboard project cards |
| Avatars, pills | `rounded-full` | User avatars, invite badge |
| Panels, backdrops | `rounded-lg` | Monogram container |

Never use sharper than `rounded-sm` in product UI. We are a writing tool,
not a command-line.

### Elevation

Inkwell's shadow scale is subtle. Elevation communicates interaction, not
hierarchy.

- `shadow-xs` — buttons, inputs, default cards (ambient)
- `shadow-sm` — card component default
- `shadow-md` — interactive elements at rest (e.g. beat cards)
- `shadow-xl` — the same elements on hover/drag

Never use `shadow-2xl` in product UI. It reads as theatrical.

### Spacing

Follow Tailwind's default 4-px spacing scale. Most UI uses the 4/8/12/16/24
rhythm. Two rules:

1. **Touch targets** are at least 32 px tall for interactive elements
   (icon-only buttons: 36 px).
2. **Content width** for long-form reading is 680 px max. Narrower inside
   side panels.

---

## 8. Visual motifs

### Beat Board

The beat board is our most expressive surface and deserves to stay that way.

- **Canvas grid:** radial-gradient dots at 1 px, 20 px spacing. Light:
  `#e5e7eb`. Dark: `#333333`.
- **Beat cards:** `shadow-md` at rest, `shadow-xl` on hover. Image beats
  use a `bg-gradient-to-t from-black/60 via-transparent to-transparent`
  scrim over the image to keep title legibility.
- **Story lanes:** a subtle `bg-gradient-to-r from-green-100 via-yellow-100 to-green-100`
  hint of three-act structure (green → yellow → green). When we generalise
  the beat board to non-screenplay categories, the lane gradient stays but
  the labels (Act 1 / Act 2 / Act 3) become category-aware (Part 1/2/3,
  Issue 1/2/3, etc.).

### Editor canvas

The writing surface is the product's most-used screen and a brand surface in its
own right. Every manuscript editor — prose, poetry, comic, TTRPG, interactive
fiction, memoir, lyrics, and screenplay — renders the **same page**, so the nine
formats feel like one tool. Only the content vocabulary differs.

- **Discrete sheets on a desk.** Pages are physical-feeling sheets (`bg-card`,
  `rounded-sm`, `shadow-lg`, `ring-1 ring-border/60`) stacked with `space-y-8` on
  a neutral desk (`bg-secondary` light / `bg-background` dark). Not an infinite
  scroll of text — paper.
- **A4 is the default geometry** (`210mm × 297mm`), the standard manuscript page.
  Screenplay is the one exception: it rides the *same* surface but at true
  **US Letter** (`8.5in × 11in`) with inch margins, because its page count is
  semantic (1 page ≈ 1 minute of screen time). Both go through one component
  (`PagedSheets`, `pageSize` prop) — never fork the page.
- **The tool rail lives in the margin**, riding the page column's right edge
  (`EditorToolRail`), collapsed at rest and expanding on hover — inserts are
  available without cluttering the page. Each format supplies its own rail
  vocabulary; the chrome is identical.
- **Page numbers** are quiet (`text-[11px] text-muted-foreground/50`), bottom-
  right (top-right for screenplay).
- **Save status** is a floating pill (`SaveStatusPill`), never chrome in the
  header.

This contract is pinned in the smoke harness (`PagedSheets.smoke.test.tsx`) so
the "one page everywhere" feel can't silently drift. When adding a format or
touching the surface, extend `PagedSheets`/`SheetMetrics` — don't build a second
page.

### Monogram as a pattern

The monogram's inverted-square treatment is the closest thing Inkwell has
to a repeating motif. Use it as a visual "seal" on:

- Auth flows
- Email headers
- Confirmation states (e.g. "Project imported")

Don't tile it. Don't use it decoratively.

---

## 9. Application

### Email (extrapolation)

- **From name:** Inkwell *(not "The Inkwell Team")*
- **From address:** short; e.g. `hello@` for greetings, `team@` for support.
- **Subject lines:** sentence case. Avoid emoji in transactional email.
  Example: *"Your invitation to Acme Films"* — not *"🎬 You're invited!"*.

### Social handles (reservations, not yet claimed)

- `@inkwell` on any platform we join.
- Fallback: `@inkwellwrites`.

### Documentation

- READMEs: first-person plural ("we", "us") for contributor-facing docs.
  Product docs use second person ("you").
- Code blocks: Geist Mono. Commentary uses the default doc theme's body font.

---

## 10. Checklist for new surfaces

Before shipping a new screen, email template, or marketing page, confirm:

- [ ] Typography tokens used, not arbitrary sizes.
- [ ] Colour from the defined palette (no new hexes in components).
- [ ] Icons are Lucide.
- [ ] Copy passes the voice check: could a tired writer read this and feel
      respected, or does it feel marketed-at?
- [ ] Empty states tell the user what to do next.
- [ ] Errors say what went wrong, not "Oops."
- [ ] Dark mode tested — our palette is deliberate, don't break it.

---

*Brand book questions, gaps, or exceptions go to the repo's
`design` label on GitHub. When in doubt: **quieter, smaller, plainer**.*
