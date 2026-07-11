# 0020 — Monetization: open-core, Paddle MoR, per-seat tiers

**Status:** Accepted · locked 2026-06-19

## Context

The project needs to be sustainable without closing the source. The license
([0003](./0003-polyform-noncommercial-license.md)) already reserves commercial
hosting; the question is *what* is sold and *how* payments are taken. A concrete
operational constraint: the maintainer/operator is in a region (Kosovë) where
**Stripe is not available**.

## Decision

**Open-core**: the desktop app stays free; the **hosted** convenience
(collaboration, sync, managed AI, org tenancy) is the paid product.
**Admin-configurable Free / Pro / Business** tiers, with **Business per-seat**
billing tied to organizations ([0018](./0018-org-model-option-b.md)). Payments go
through **Paddle** as Merchant-of-Record. Build the billing + checkout + webhook
machinery now but keep it **inert until `PADDLE_*` creds are set**
(build-now/plug-creds-later). A **metered managed-AI** offering (tokens with
per-tier monthly allowances) is Phase B.

## Alternatives considered & why not

- **Stripe.** Rejected: **not available in the operator's region (Kosovë)** —
  a hard blocker regardless of its feature set. Paddle acts as Merchant-of-Record,
  which also offloads sales-tax/VAT handling.
- **Flat (non-per-seat) pricing.** Rejected: teams/orgs need seat-based billing to
  scale with usage; the Business tier is explicitly per-seat.
- **Closing the source / proprietary.** Rejected: contradicts the project's open,
  self-hostable ethos ([0001](./0001-local-first-architecture.md),
  [0003](./0003-polyform-noncommercial-license.md)).
- **Donations only.** Rejected: insufficient and unpredictable for sustaining
  hosted infrastructure.

## Consequences

- Billing tiers + `pkg/quota` enforcement + per-seat org sync are built; Paddle
  webhooks stay inert until creds land (like the Drive backup pattern).
- **Quota enforcement is gated on the exact tier limits**, which are still an open
  product decision — only `MetricProjects` has a (no-op) call site today. See
  [roadmap.md](../roadmap.md).
- Managed AI ([0008](./0008-byo-key-ai-only.md)) returns as a *metered* Phase-B
  offering, distinct from the deleted always-on Python proxy.
