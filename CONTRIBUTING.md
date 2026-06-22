# Contributing to Inkwell

Thank you for your interest in contributing! This guide explains how the project is structured, how to run it locally, and how to add a new microservice.

---

## Table of contents

1. [Architecture overview](#architecture-overview)
2. [Service boundaries](#service-boundaries)
3. [Local dev setup](#local-dev-setup)
4. [How to add a new service](#how-to-add-a-new-service)
5. [Code conventions](#code-conventions)
6. [Pull request checklist](#pull-request-checklist)

---

## Architecture overview

```
client (Next.js 15 + Tauri v2 desktop)
    └─► api-gateway     (HTTP :8080, chi router, Go)
            ├─► identity-service      (gRPC :50051) — auth, sessions, JWT, 2FA
            ├─► scripts-service       (gRPC :50052) — projects, scenes, elements, beats; cloud sync (DB rows + vault files)
            ├─► collab-service        (gRPC :50053) — collaborators, invitations, comments
            ├─► billing-service       (gRPC :50054) — subscriptions, tiers, gateways, usage
            ├─► workspace-service     (gRPC :50056) — workspaces, categories, members
            ├─► aisettings-service    (gRPC :50057) — BYO AI provider rows + AES-256-GCM key vault
            └─► notifications-service (gRPC :50058) — prefs, in-app feed, email delivery (Kafka consumer)
```

The desktop build (Tauri) is local-first: it talks to a **local SQLite + on-disk
files** through `client/lib/storage`, and only reaches the gateway when the user
opts into an account + cloud sync. The web build talks to the gateway directly.

**Infrastructure (all in docker-compose):**

| Component   | Purpose                                              |
|-------------|------------------------------------------------------|
| PostgreSQL  | One database per service (ports 5432–5438)          |
| Redis       | JWT blocklist + fixed-window rate limiting (gateway) |
| Kafka       | Async domain events; notifications-service is the first consumer |
| Zookeeper   | Kafka dependency                                     |

---

## Service boundaries

Each backend service owns its database. Services never query each other's DB directly — cross-service reads go through gRPC.

| Service       | Owns                                          | Kafka                          |
|---------------|-----------------------------------------------|--------------------------------|
| identity      | users, sessions, JWT, 2FA                     | emits `user.created`           |
| scripts       | projects, scenes, elements, beats, `vault_files` | emits `project.created/deleted` |
| collab        | collaborators, invitations, comments          | emits `collab.added`, `comment.added`, `collaboration.invited` |
| billing       | subscriptions, tiers, gateways, usage         | emits `billing.updated`        |
| workspace     | workspaces, categories, members               | —                              |
| aisettings    | user_ai_providers (encrypted BYO keys)        | —                              |
| notifications | notification prefs, in-app feed, delivery log | **consumes** user/collab/comment events → in-app + email |

The gateway is **not** a service — it is a thin HTTP-to-gRPC proxy. It authenticates requests (JWT → identity-service), enforces rate limits (Redis), and routes to the appropriate service.

---

## Local dev setup

### Prerequisites

- Go 1.22+
- Node.js 20+
- Docker + Docker Compose
- `protoc` with `protoc-gen-go` and `protoc-gen-go-grpc` (only needed when changing proto files)

### Start everything

```bash
# Copy and edit environment variables
cp .env.example .env   # fill in POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_SECRET, etc.

# Start infrastructure and services
docker compose up -d

# Or run only infrastructure and start services manually:
docker compose up -d postgres-identity postgres-scripts postgres-collab \
                       postgres-billing postgres-workspace postgres-aisettings \
                       postgres-notifications redis kafka zookeeper

# A Taskfile wraps the common flows (see `task --list`), e.g.:
#   task dev                      # infra in Docker + Next.js locally
#   task docker:rebuild:scripts   # rebuild + restart one service

# Run a service locally (example: identity)
cd server
go run ./cmd/identity
```

### Frontend

```bash
cd client
npm install
npm run dev          # web build → http://localhost:3000
npm run tauri:dev    # desktop build (local-first; no servers needed)
```

The client reads `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8080`).

### Running tests

```bash
# Backend
cd server
go test ./...

# Frontend — all three gate CI
cd client
npm run lint        # eslint flat config (eslint.config.mjs); fails on error-level rules
npx tsc --noEmit
npm test            # Vitest + RTL smoke suite (client/__tests__)
```

---

## How to add a new service

Follow the same four-layer pattern every existing service uses:

```
server/internal/<name>/
  domain/          — structs, domain error sentinels
  repository/      — interfaces.go  +  postgres_repository.go
  service/         — business logic, depends on repository interface
  handler/         — gRPC handler (pb ↔ domain, domain errors → gRPC codes)
  config/          — Config struct + Load() from env vars
  migrations/      — numbered SQL files (000001_init.up.sql, 000001_init.down.sql)
server/cmd/<name>/
  main.go          — DI wiring: DB → repo → service(+publisher) → handler → gRPC server
  Dockerfile
server/proto/<name>/
  <name>.proto
server/pkg/grpc/<name>/
  <name>.pb.go     — generated, do not edit
  <name>_grpc.pb.go
```

Step-by-step:

1. **Write the proto** in `server/proto/<name>/<name>.proto` and regenerate
   with the Makefile target (it sets the right `--proto_path` + `paths=source_relative`
   for every proto; don't hand-roll `protoc`):
   ```bash
   cd server
   make proto          # regenerate all services
   ```

2. **Domain layer** — define your structs and sentinel errors in `domain/`.  
   Use `errors.New("...")` for simple sentinels or a `DomainError` struct when you need a machine-readable `.Code`.

3. **Repository layer** — declare the interface in `repository/interfaces.go`, implement it in `repository/postgres_repository.go`.  
   Migrations live in `internal/<name>/migrations/` and are run automatically by `database.RunMigrations` at startup.

4. **Service layer** — business logic only; no HTTP or gRPC concerns.  
   Accept `events.Publisher` as a constructor argument and use `&events.NoopPublisher{}` in tests.

5. **Handler layer** — implement the generated gRPC server interface.  
   Map domain errors to gRPC status codes in a private `handleError` function.

6. **Config** — read from env vars with sensible defaults (see any existing `config/config.go`).

7. **main.go** — wire everything together. Use the same Kafka publisher pattern as `cmd/identity/main.go`.

8. **Register in the gateway** — add a gRPC client to `server/internal/gateway/grpcclient/registry.go`, expose routes in `server/internal/gateway/router/router.go`, and write a handler in `server/internal/gateway/handlers/`.

9. **Add to docker-compose** — include a Postgres service and the new microservice following the existing pattern.

---

## Code conventions

### Go

- **Errors**: return domain error sentinels from service layer; map to gRPC codes in handler.
- **Logging**: use `log/slog` everywhere — no `fmt.Printf` or `log.Printf`.
- **Context**: always thread `context.Context` from the HTTP request (`r.Context()`), never create a new `context.Background()` in a handler.
- **Godoc**: every exported type, function, and interface must have a doc comment starting with its name.
- **No global state**: inject all dependencies through constructors.

### TypeScript / Next.js

- **Types over `any`**: never use `any`. Use `unknown` and narrow, or derive types with `Awaited<ReturnType<...>>`.
- **Service functions**: all API calls live in `client/services/`. Components call service functions, never `fetch` directly.
- **Hooks**: stateful data-fetching logic lives in `client/hooks/`, not in page components.
- **JSDoc**: one-line JSDoc on every exported service function and custom hook.

### Local-first storage & sync (desktop)

The desktop build reads/writes a **local SQLite DB + on-disk files** through
`client/lib/storage`, which has two implementations behind one interface:
`local/` (SQLite + filesystem, Tauri) and `remote/` (gateway, web). `services/*`
call `getStorage()`; never branch on platform in a component.

- **Client SQLite migrations** live in `client/src-tauri/migrations/NNNN_*.sql`
  and **must be registered** in `client/src-tauri/src/lib.rs` (`sql_migrations()`).
  Numbered, append-only — never edit a shipped migration (it would desync existing
  users), add a higher-numbered one.
- **When you add a mutation to a `local/*` storage domain, call `markDirty(db,
  entity, projectId, rowId)`** (from `local/shared.ts`) right after the write.
  Cloud sync uses an incremental `sync_outbox` that pushes **only** rows you mark,
  so a missed `markDirty` means that edit silently never syncs. The **apply path**
  (writing rows pulled from the server, in `local/sync.ts`) deliberately does
  **not** call it — that's what stops a pulled row echoing back as a local edit.
- **Vault projects** (markdown + attachments on disk) sync through a separate
  **path-keyed** engine (`local/vault-sync.ts`), routed by `project.category`;
  they use a content-hash manifest, not the outbox. See `SYNC_DESIGN.md`.

### Protobuf

- Field names use `snake_case`. Generated Go code uses `CamelCase` — do not edit generated files.
- Bump the file number in `migrations/` (never edit existing migration files).

---

## Pull request checklist

- [ ] `go build ./...` passes with no errors
- [ ] `go vet ./...` is clean
- [ ] New exported Go symbols have Godoc comments
- [ ] For client changes: `npm run lint`, `npx tsc --noEmit`, and `npm test` all pass
- [ ] New TypeScript service functions have a JSDoc comment
- [ ] Server migrations numbered with matching `.up.sql` / `.down.sql`; client SQLite migrations registered in `src-tauri/src/lib.rs`
- [ ] New `local/*` storage mutations call `markDirty` (so they sync)
- [ ] No hardcoded secrets or credentials
- [ ] `docker compose up` (or `task dev`) brings the full stack up without errors
