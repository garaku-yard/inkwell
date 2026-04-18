# Scriptlith (codename: Inkwell) — Claude Session Handoff

## What this project is

A **screenwriting SaaS platform** (open-source). Writers can author screenplays, prose, poetry, and song lyrics. Teams collaborate in real-time via invitations. There's a beat-board for story planning, an AI chat assistant, and a Stripe-backed billing/subscription system.

Frontend: **Next.js 15 / React / TypeScript / Tailwind + shadcn/ui**
Backend: **Go microservices communicating over gRPC**, with a single HTTP gateway

---

## Architecture

```
client (Next.js)
    └─► gateway (HTTP :8080, chi router)
            ├─► identity-service  (gRPC :50051) — auth, sessions, JWT
            ├─► scripts-service   (gRPC :50052) — projects, scenes, elements
            ├─► collab-service    (gRPC :50053) — collaborators, invitations, comments
            ├─► billing-service   (gRPC :50054) — subscriptions, tiers, gateways
            └─► workspace-service (gRPC :50056) — workspaces, categories, members
```

**Infrastructure:** PostgreSQL (one DB per service), Redis (gateway JWT blocklist + rate limiting), Kafka (async events between services), Zookeeper (Kafka dependency).

**Key Go packages:**
- `server/pkg/redis/` — Redis client wrapper
- `server/pkg/events/` — EventPublisher interface + KafkaPublisher + NoopPublisher
- `server/pkg/kafka/` — low-level Kafka producer/consumer
- `server/internal/gateway/` — HTTP router, auth middleware, rate limiter, gRPC registry
- `server/internal/{service}/` — each service follows: `domain/` → `repository/` → `service/` → `handler/`

---

## Service layout (each service is identical)

```
internal/{service}/
  domain/       — structs, domain error sentinels (ErrXxx = NewDomainError(...))
  repository/   — interfaces.go + postgres_repository.go
  service/      — business logic, depends on repository interface
  handler/      — gRPC handler, translates pb ↔ domain, maps domain errors → gRPC codes
  config/       — env-based config struct + Load()
  migrations/   — SQL migration files
```

---

## What's been built and refactored

### Done (previous sessions)
- All gateway handlers use `r.Context()` not `context.Background()`
- Admin billing endpoints have real role checks (not open)
- Error responses standardized: `{"error": "..."}` everywhere
- Project authorization centralized in `handlers/projectauth.go`
- gRPC client creation centralized in `grpcclient/registry.go`
- Debug `fmt.Printf` statements removed
- Timestamp conversion helper extracted
- JWT tag (`user_tag`) decoding centralized in `useAuth` hook (frontend)
- Duplicate invitation bug fixed: `GetPendingInvitationByEmailAndProject` + `ErrInvitationExists`
- N+1 query eliminated: parallel gRPC fan-out in `handlers/scripts.go`
- Dashboard page split: `useProjects` hook + `ProjectCard` component (~170 lines from 631)
- All `any` types replaced in frontend (strict TypeScript)

### Done (this session — infrastructure wiring)
- **Redis** wired: `pkg/redis/client.go`, gateway config, JWT blocklist middleware, rate limiter middleware
- **Kafka** wired: `pkg/events/` EventPublisher interface, KafkaPublisher, NoopPublisher; identity/scripts/collab services publish events
- **Circuit breaker** on all gRPC clients in `grpcclient/registry.go` via `sony/gobreaker`
- **API versioning**: all protected routes under `/api/v1/` prefix
- **Structured logging**: `slog` with request correlation IDs throughout
- **Logout endpoint** invalidates token in Redis blocklist

---

## Key design decisions

- **Repository interface pattern**: collab service has `CollaborationRepository` interface → `PostgresCollaborationRepository` impl. Other services use concrete structs (TODO: extract interfaces for testability).
- **Domain error sentinels**: collab has `ErrInvitationExists`, `ErrCollaboratorExists`, etc. mapped to gRPC status codes in the handler. Other services should follow this pattern.
- **EventPublisher interface**: services accept `events.Publisher` (interface) so tests use `NoopPublisher`, prod uses `KafkaPublisher`. Never import `pkg/kafka` directly from service layer.
- **Outbox pattern for billing**: TODO — needed for reliable `billing.subscription_changed` events.

---

## Frontend structure

```
client/
  app/(private)/dashboard/     — main project list; uses useProjects hook + ProjectCard
  app/(private)/workspace/     — workspace settings
  app/(public)/                — login, register
  components/editor/           — ScreenplayEditor, SidePanel, etc.
  components/beat-board/       — BeatCanvas, BeatCard
  components/admin/billing/    — tier editor, subscriptions overview
  hooks/useProjects.ts         — dashboard data logic (fetch, star, delete, rename)
  lib/AuthContext.tsx           — JWT decode, user state, logout
  services/                    — one file per backend domain (project.ts, workspace.ts, etc.)
```

---

## Known issues / remaining TODOs

- `identity_handler.go:202` — pre-existing build error (pointer type mismatch), out of scope
- Repository interfaces missing for: scripts, identity, workspace, billing services
- Domain error sentinels missing for: scripts, identity, workspace, billing services
- Outbox pattern not yet implemented for billing events
- AI service unhealthy (no API key configured in dev) — `ai-service` container starts but all requests fail
- Export to PDF/FDX — button exists, no backend implementation
- Analytics pages — routes exist, data is hardcoded static

---

## Running locally

```bash
# Start all infra
docker-compose up -d

# Run gateway
cd server && go run cmd/gateway/main.go

# Run client
cd client && npm run dev
```

Environment variables are loaded from `.env` files in each service directory. See `docker-compose.yml` for the full set of required env vars.

---

## Open source notes

- Target license: TBD
- All exported Go types/functions should have godoc comments (ongoing)
- All exported TS service functions should have JSDoc comments (ongoing)
- CONTRIBUTING.md needed before launch
