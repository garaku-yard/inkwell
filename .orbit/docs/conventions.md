# Conventions

Inkwell's own rules: this stack's language letter and the judgment calls that
are specific to it. The studio standard (git, docs, engineering judgment) is
vendored in [`.orbit/rules/studio.md`](../rules/studio.md); a rule here
overrides it only when it is labelled as a deviation. Formatters and linters
own mechanical style. For the full contribution flow, the four-layer service
recipe, and the PR checklist, see the public
[CONTRIBUTING.md](../../CONTRIBUTING.md).

## Always

- **Before committing, run what you touched.** Server:
  `cd server && gofmt -l . && go vet ./... && go test -race -count=1 ./...`
  (`gofmt -l` must print nothing). Client:
  `cd client && npm run lint && npx tsc --noEmit && npm test`.
- **Commit bodies explain the *why*,** not the *what*. Scopes in use:
  `realtime`, `auth`, `editor`, `sync`, `client`, `deps`.
- **Reuse is engine + per-format config,** never a `<BaseEditor>`-style shared
  component across the nine formats
  ([decisions/0012](./decisions/0012-engine-plus-config-over-baseeditor.md)).
- **Product copy follows the brand voice:** quiet craft, writer-centric,
  action-first; no "empower / unleash / journey".

## Go (server)

`gofmt` owns formatting — CI fails on any unformatted file (`gofmt -l`). Beyond
that:

- **Errors:** return domain sentinels (or a `DomainError{Code}`) from the
  service layer; map them to gRPC status codes in the handler's private
  `handleError`. Match with `errors.Is`, not string comparison.
- **Logging:** `log/slog` everywhere — no `fmt.Printf` / `log.Printf`.
- **Context:** thread `context.Context` from the request (`r.Context()`); never
  spin up a fresh `context.Background()` in a handler.
- **No global state:** inject every dependency through constructors; tests pass
  `&events.NoopPublisher{}`.
- **Godoc:** every exported type/function/interface has a doc comment starting
  with its name. Idiomatic prose, no `@param`/`@return`.
- **Generated code is off-limits:** `*.pb.go` is regenerated from proto
  (`make proto` / `task proto:gen`) — never hand-edit; edit the `.proto`.

## TypeScript / Next.js (client)

`eslint` (flat config, `eslint.config.mjs`) + `tsc --noEmit` own style and gate
CI; `no-unused-vars` and `no-explicit-any` are **errors**. Run `npm run lint`
before calling client work done — `tsc`/`next build` miss lint-level issues.
Beyond that:

- **No `any`:** use `unknown` + narrow, or derive with
  `Awaited<ReturnType<...>>`.
- **Service functions:** all API/storage calls live in `client/services/*` and
  delegate through `getStorage()`. Components call services, never `fetch`
  directly and never branch on platform.
- **Hooks:** stateful data-fetching lives in `client/hooks/` or co-located
  editor hook dirs, not in page components.
- **TSDoc:** one-line (or fuller) doc on every exported service function + custom
  hook; note units (px, cents, ms) and side effects.

### Local-first storage & sync gotchas

- **Client SQLite migrations** live in `client/src-tauri/migrations/NNNN_*.sql`
  and **must be registered** in `src-tauri/src/lib.rs` (`sql_migrations()`).
  Numbered, append-only — never edit a shipped migration; add a higher number.
- **Call `markDirty(db, entity, projectId, rowId)`** (from `local/shared.ts`)
  right after every new mutation in a `local/*` domain, or cloud sync's
  incremental outbox never pushes that edit. The **apply path**
  (`local/sync.ts`) deliberately does **not** — that's the echo guard.
- **Vault projects** sync through the separate path-keyed engine
  (`local/vault-sync.ts`), routed by `project.category` — content-hash manifest,
  not the outbox.

### Protobuf

- Field names `snake_case`; generated Go is `CamelCase` — don't edit generated
  files. Regenerate with `make proto` / `task proto:gen`.

## Inkwell — engineering judgment

The studio's engineering judgment (rule of three, root causes, defer
explicitly) applies here. What it looks like in Inkwell:

- **Don't generalise across formats that only look similar.** No `<BaseEditor>`
  for the nine formats; no "project shell" that wraps shadcn and adds nothing.
  The formats are stable. See
  [decisions/0012](./decisions/0012-engine-plus-config-over-baseeditor.md).
- **Engine + per-format config** when something *does* deserve reuse: keep the
  generic part minimal, let each consumer own its config (`keymap.ts` engine +
  per-format `keymap.ts`; `StableContentEditable`; `useElementAutosave`;
  `useProjectLoader`).
- **Verifying behaviour.** When a refactor moves bodies verbatim: type-check +
  run tests + keep the smoke harness. When an extraction touches save logic, add
  a smoke test for that file *before* extracting.

## Copy / brand voice

Product copy follows the brand voice — quiet craft, writer-centric, action-first;
no "empower / unleash / journey." Full guidance in
[BRANDBOOK.md](../../BRANDBOOK.md) (§2) and [brand.md](./brand.md).

## Documentation-as-code

- **Go:** godoc as above.
- **TypeScript:** TSDoc as above.
- **These `.orbit/docs/`:** as the studio standard's Docs section says;
  `changelog.md` is append-only like `decisions/` and `log/`.
