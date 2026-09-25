# Roadmap

> Forward intent — mutable. What's next and why. The at-a-glance **live status
> matrix** (shipped / partial / planned per feature) is
> [PLANNING.md](../../PLANNING.md) at the repo root; this doc is the narrative of
> direction, not a status table. What has already shipped is in
> [changelog.md](./changelog.md); the *why* behind big calls is in
> [decisions/](./decisions/).

## Near-term — finish what's built

- **Launch correctness and operations.** Finish the active dependency-security
  change, health/readiness checks, production deployment contract, log
  redaction, operator bootstrap, and Paddle sandbox checkout. These are the
  remaining gates between a working stack and an operable public service.
- **Editor capability foundation.** The format-native editors have sound
  document vocabularies, but their craft and production layers are uneven.
  Build shared inline marks, semantic metadata, command discovery, revision
  snapshots, diagnostics, and output profiles before duplicating them in nine
  editors. Full findings and delivery order:
  [2026-09-23 editor toolset audit](./log/2026-09-23-editor-toolset-audit.md).
- **Two-device sync verification — done (2026-07-16), and it earned its keep.**
  Both engines are now verified app-level through two live Tauri webviews. The row
  engine passed (fresh-device pull, both edit directions, tombstones, and the
  stale-device no-clobber regression). The vault engine **failed**: `stat`,
  `readFile` and `writeFile` were never granted in the Tauri capability manifest,
  so every file silently dropped out of every push behind a green "Synced" —
  broken since the engine's first commit, invisible to server-side curl
  verification. Fixed, guarded by a test, and re-verified byte-for-byte.
  Details + method: [reference/sync-engine.md](./reference/sync-engine.md).
  - *Still uncovered:* the native folder picker (WebDriver automation maps no X
    window, so the GTK dialog can't be driven). Both devices' `vault_path` was
    seeded the way `pullProject` writes it; the dialog contributes only that one
    string. Worth a real human click before calling vault sync shippable.
- **Monetization go-live.** Open-core billing is **built but inert** — Free/Pro/
  Business tiers, quota enforcement, per-seat sync, Paddle checkout + webhooks,
  managed-AI metering. Remaining is operator work: real `PADDLE_*` creds +
  price-ids + webhook registration + legal placeholders.
  [decisions/0020](./decisions/0020-monetization-open-core-paddle.md).
- **Quota enforcement wiring.** Infra is ready (`pkg/quota.Require` + billing
  tier fields); only `MetricProjects` has a call site and it's a no-op until
  tiers define limits. Collaborators / ai_tokens / exports each still need a
  structural unblock. Resumes once tiers are live.

## Queued — product / UX

- **Editor depth program.** Poetry/Lyrics and Interactive Fiction are first,
  followed by screenplay/comic production, prose/memoir editorial workflow,
  and TTRPG/Vault specialist tools. This is a capability program rather than a
  count of toolbar buttons; see the
  [editor toolset audit](./log/2026-09-23-editor-toolset-audit.md).
- **`.iw` as on-disk source of truth.** The portable `.iw` envelope ships as
  import/export only; making it the on-disk store for non-vault projects
  (replacing SQLite, like the vault) is a much larger rewrite, deferred until the
  vault UX is proven stable (it is now). [decisions/0016](./decisions/0016-iw-portable-project-file.md).
- **Format-unique follow-ons.** Configurable poetic-form analysis, screenplay
  production reports, TTRPG system packs, and art-backed comic packaging after
  the corresponding core workflows ship.
- **Brand assets.** Apple touch / maskable PWA icons, an Open-Graph image, an
  optional display serif for marketing pull quotes (tracked in
  [BRANDBOOK.md](../../BRANDBOOK.md)).

## Queued — infra / packaging

- **Trusted desktop signing.** macOS Intel/Apple Silicon and the signed Tauri
  updater pipeline ship; public trust still needs Apple Developer ID and Windows
  OV certificate enrollment.
- **Windows code signing.** OV cert (~$100–400/yr), deferred to public launch.
- **Helm charts** for a Kubernetes deploy of the hosted stack (one chart per
  service + umbrella).

## Larger verticals — sequenced

- **Mobile (Android/iOS).** Mechanically possible (Tauri v2 targets mobile) but a
  large vertical: the vault's arbitrary-folder + recursive-watcher model, OS
  keychain, desktop window chrome, and keyboard-centric UX don't map to mobile
  sandboxing/touch. Cleanest path is a hosted-first thin client, gated behind
  desktop login + sync. **Revisit after sync is verified.**

## Open design decisions (need partner input)

- **Open-core tiering specifics.** The open-core *model* is locked
  ([decisions/0020](./decisions/0020-monetization-open-core-paddle.md)); the
  exact free/paid split, gate points, and trial mechanism per metric are still
  open and block quota enforcement wiring above.

## Intentionally deferred (not neglect)

- **Settings IA overlap** — `/settings` Collaboration defaults vs
  `/workspace/settings` Members; the per-share permission conceptually belongs
  per-workspace. Rearrangement deferred by explicit choice.
- **Exact/watermark tombstone GC** — time-based retention is the permanent
  solution at this scale; watermark GC buys nothing.
  [reference/sync-engine.md](./reference/sync-engine.md) ·
  [decisions/0015](./decisions/0015-sync-time-based-gc.md).
- **Real-time CRDT merge** — element-level LWW ships now; Yjs-grade CRDT is a
  later tier. [decisions/0019](./decisions/0019-realtime-tiered-lww-then-crdt.md).

_When an item here ships, move its narrative to [changelog.md](./changelog.md)
and flip its row in [PLANNING.md](../../PLANNING.md)._
