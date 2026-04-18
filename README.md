# Inkwell

An open-source, collaborative writing platform for screenwriters, novelists, poets, and songwriters.

Inkwell gives writers a single place to outline, draft, and polish long-form work: a dedicated editor per content type, a visual beat board for story structure, real-time collaboration with role-based permissions, an AI chat assistant, and workspace-based organisation for teams.

---

## What's included

- **Screenplay editor** with industry-standard formatting (scene headings, action, dialogue, parentheticals, transitions) and FDX import/export.
- **Prose, poetry, comic-script, interactive-fiction, TTRPG, and lyrics editors** sharing the same element model.
- **Beat board** — a free-form canvas of story beats with swim lanes, connections, and timeline placement.
- **Collaboration** — invite by email or `@username#tag`, role-based access (editor / viewer), inline comments with threaded replies, and live presence.
- **Workspaces** — personal and organisation workspaces, each scoped to a set of content categories. Multi-tenant by design.
- **AI chat** — streaming chat completion, pluggable providers (OpenAI, Ollama, Gemini).
- **Billing** — subscription tiers with per-feature gates, payment-gateway configuration, and a Stripe-style admin panel.

---

## Architecture

```
client (Next.js 15 / React / TypeScript / Tailwind / shadcn-ui)
    └─► api-gateway (Go, chi router, HTTP :8080)
            ├─► identity-service   (gRPC :50051)  — auth, sessions, JWT
            ├─► scripts-service    (gRPC :50052)  — projects, scenes, elements, beats
            ├─► collab-service     (gRPC :50053)  — collaborators, invitations, comments, presence
            ├─► billing-service    (gRPC :50054)  — subscriptions, tiers, gateways, usage
            └─► workspace-service  (gRPC :50056)  — workspaces, categories, members
```

**Infrastructure:** PostgreSQL (one DB per service), Redis (JWT blocklist + rate limiting), Kafka (async domain events), Zookeeper.

Services communicate over gRPC. Each service owns its database; cross-service reads go through gRPC, never direct SQL. Domain events (`project.created`, `billing.updated`, etc.) flow through Kafka via a transactional outbox for exactly-once semantics.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for a deeper tour, service boundaries, and how to add a new service.

---

## Getting started

### Prerequisites

- Go 1.22+
- Node.js 20+
- Docker + Docker Compose

### Run the stack

```bash
cp .env.example .env            # fill in secrets (JWT_SECRET at minimum)
docker compose up -d            # starts DBs, Redis, Kafka, and every service
cd client && npm install && npm run dev
```

The frontend is served at `http://localhost:3000` and the gateway at `http://localhost:8080`.

### Run a service locally (outside Docker)

```bash
docker compose up -d postgres-identity redis kafka zookeeper   # just the infra
cd server
go run ./cmd/identity                                          # or ./cmd/scripts, etc.
```

---

## Project layout

```
client/                      Next.js frontend
server/
  cmd/                       service entry points (one main.go per service)
  internal/
    {service}/               domain / repository / service / handler layers
    gateway/                 HTTP router, middleware, gRPC client registry
  pkg/                       shared libraries (events, redis, kafka, outbox, quota, apierror)
  proto/                     .proto definitions — source of truth for gRPC contracts
```

---

## Status

Inkwell is pre-1.0 and under active development. See [PLANNING.md](./PLANNING.md) for the current feature tracker.

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for the service architecture, dev setup, and PR conventions before opening a pull request.

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) © Inkwell contributors.

Inkwell is free to use, study, modify, and share for any **noncommercial** purpose — personal projects, research, education, hobby work, non-profits, and government use all qualify. Commercial use (including selling, rebranding, or offering Inkwell as a paid service) requires a separate agreement with the authors.

See [polyformproject.org/licenses/noncommercial/1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0) for the full terms.
