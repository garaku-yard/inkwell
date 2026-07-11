# Runbook

> How to run, seed, test, and ship Inkwell — ports, env vars, and the moving
> parts. Derived from `Taskfile.yml`, `docker-compose.yml`, `.env.example`,
> `README.md`, and `CONTRIBUTING.md`. Release/AUR operations have their own
> canonical doc: [RELEASING.md](../../RELEASING.md).

## Prerequisites

- Go 1.24 (CI pins it; 1.22+ works locally)
- Node.js 22 (CI); 20+ locally
- Docker + Docker Compose
- `protoc` + `protoc-gen-go` + `protoc-gen-go-grpc` — only when changing protos
- `task` (Taskfile) — wraps the common flows (`task --list`)

## Desktop dev loop (fastest — no servers)

```sh
cd client
npm install
npm run tauri:dev        # Next dev + Tauri window, fully local-first
npm test                 # Vitest + RTL smoke suite (client/__tests__)
npm run test:watch       # watch mode
```

The desktop build talks to local SQLite + on-disk files through
`client/lib/storage`; it needs no backend. Local data lands at:

- Linux: `~/.local/share/com.inkwell.app/inkwell.db`
- Windows: `%APPDATA%\com.inkwell.app\inkwell.db`
- Vault notes: the `.md` files in the folder the user picked.

## Hosted stack (optional)

```sh
cp .env.example .env     # set JWT_SECRET + AI_ENCRYPTION_KEY at minimum
task setup               # install dev tools (migrate, sqlc, …)
task fresh               # full docker build + migrations + up
task dev                 # infra in Docker + Next.js locally
task docker:rebuild:<svc># rebuild + restart one service (e.g. :gateway, :scripts)
```

Web client → `http://localhost:3000`, gateway → `:8080`. The client reads
`NEXT_PUBLIC_API_URL` (default `http://localhost:8080`).

### Ports (from `docker-compose.yml`)

| Component | Host port | | Component | Host port |
|---|---|---|---|---|
| gateway (HTTP) | **8080** | | postgres-identity | 5432 |
| web client | 3000 | | postgres-scripts | 5433 |
| redis | 6379 | | postgres-collab | 5434 |
| kafka | 9092 | | postgres-billing | 5435 |
| zookeeper | 2181 | | postgres-workspace | 5436 |
| identity (gRPC) | 50051 | | postgres-aisettings | 5437 |
| scripts | 50052 | | postgres-notifications | 5438 |
| collab | 50053 | | billing | 50054 |
| workspace | 50056 | | aisettings | 50057 |
| notifications | 50058 | | | |

Each service owns its own Postgres DB; all Postgres containers expose `5432`
internally, remapped 5432–5438 on the host.

### Required / notable env vars (`.env.example`)

| Var | Required? | Notes |
|---|---|---|
| `JWT_SECRET` | **yes** (non-dev) | identity refuses to start empty outside `ENVIRONMENT=development`. `openssl rand -base64 48`. |
| `AI_ENCRYPTION_KEY` | **yes** for hosted BYO | 32 bytes base64. AES-256-GCM at rest. **One-time commitment** — rotating without a re-encrypt job makes stored keys undecryptable (`key_version` reserved). [decisions/0010](./decisions/0010-aes-gcm-key-vault.md). |
| `AI_OPENAI_COMPATIBLE_HOSTS` | optional | comma-separated operator allowlist for `openai_compatible` hosts; empty disables the kind on the hosted path. [decisions/0009](./decisions/0009-openai-compatible-allowlist.md). |
| `AI_RATE_LIMIT_RPM` | optional (30) | per-user rate limit on `/api/v1/ai/*`. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | dev defaults | shared by every per-service Postgres. |
| `REDIS_*`, `KAFKA_BROKERS`, `ZOOKEEPER_*` | dev defaults | match compose. |
| `PADDLE_*` | optional | billing checkout/webhooks stay inert until set. |

## Tests (all three gate client CI)

```sh
# server
cd server && go build ./... && go vet ./... && go test -race -count=1 ./...
gofmt -l .                 # must be empty

# client
cd client
npm run lint               # eslint flat config; fails on error-level rules
npx tsc --noEmit
npm test
```

CI (`.github/workflows/ci.yml`) runs the server job (gofmt check, build, vet,
race tests) and the client job (tsc, lint, next build) on push/PR to `main`.

## Proto regeneration

```sh
cd server && make proto    # all services   (or: task proto:gen)
task proto:gen:billing     # one service
```

Never hand-edit `*.pb.go`; edit the `.proto` and regenerate.

## Verifying server features against a live stack

For server work, exercise against real infra rather than mocks: `go run
./cmd/<svc>` wired to real Kafka + identity + a throwaway Postgres + Mailpit
(SMTP), driven with `grpcurl`. (Docker in a sandboxed shell needs
`dangerouslyDisableSandbox`.) This is how sync + notifications + billing were
verified end-to-end.

## Building a production desktop bundle

```sh
cd client
npm run tauri:build        # installer for the current platform
```

Artefacts: `client/src-tauri/target/release/bundle/` (NSIS `.exe` on Windows;
AppImage + `.deb` on Linux).

## Cutting a release / AUR

The GitHub Actions `Release` workflow builds Windows + Linux bundles on a `v*`
tag push and attaches them to a draft release. The full runbook — version bump,
tag, publish, Arch/AUR PKGBUILD refresh, auto-updater + code-signing future work
— is in **[RELEASING.md](../../RELEASING.md)** (canonical; not duplicated here).
