# 0007 — Gateway as a thin proxy; one database per service

**Status:** Accepted · **"thin proxy" characterization partially superseded by
[0029](./0029-gateway-application-gateway-service-authorities.md)** — the
gateway does orchestration, policy and response composition, not "no business
logic"; one-database-per-service stands unchanged. · **the
`ResolveProjectAccess` mechanism named in Consequences below is superseded by
[0030](./0030-role-aware-project-authorization-policy.md)** — sub-resource
authorization is still resolved server-side against the resource's real
project; the function is now `handlers.RequireProjectAccess`, checked against
a typed role/action policy rather than granting on "any access at all".

## Context

The hosted stack is a set of Go microservices. Two structural questions: what does
the HTTP edge do, and how do services share (or not share) data?

## Decision

The **gateway is a thin HTTP↔gRPC proxy** — it authenticates (JWT → identity +
Redis blocklist), enforces per-user + per-route rate limits, sets CSP/security
headers, and routes to services through a `grpcclient` registry with circuit
breakers. It holds **no business logic**. Each **service owns its own Postgres
database**; cross-service reads go through gRPC, never a shared table.

## Alternatives considered & why not

- **Fat gateway with business logic.** Rejected: erodes service boundaries and
  turns the edge into a distributed monolith's junction box.
- **One shared database across services.** Rejected: couples schemas and
  deploys; a migration in one service can break another. Per-service DBs keep
  ownership clean.

## Consequences

- Handler boilerplate is collapsed by the `Endpoint[Req,Resp]` + `Wrap()` helper.
- Sub-resource authorization must resolve a resource's **real** owning project
  server-side (`GetResourceProject` → `ResolveProjectAccess`), never trusting a
  client-supplied project id — this closed a real `uuid.Nil` bypass.
- Adding a service is a fixed recipe (proto → domain → repo → service → handler →
  gateway client + route); see [CONTRIBUTING.md](../../../CONTRIBUTING.md).
- Circuit breakers isolate a failing service from the whole edge.
