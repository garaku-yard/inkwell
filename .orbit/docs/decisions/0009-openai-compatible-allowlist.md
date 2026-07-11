# 0009 — `openai_compatible` operator allowlist

**Status:** Accepted

## Context

The `openai_compatible` provider kind lets a user point a provider row at an
arbitrary `BaseURL` (for Ollama / LM Studio / LiteLLM / OpenRouter / a private
proxy). On the **hosted** path the server makes that outbound request, so an
attacker-controlled URL is a server-side request forgery (SSRF) vector into the
operator's network.

## Decision

The `aiadapter` deliberately **requires an explicit `BaseURL`** for
`openai_compatible`. The gateway accepts `openai_compatible` rows only when their
`Host` matches an entry in the operator-set `AI_OPENAI_COMPATIBLE_HOSTS`
(comma-separated env var). An empty list disables the kind on the hosted path; a
populated list opts specific hosts in (e.g. `ollama.internal:11434`). Validated at
Create/Update **and** re-checked at chat dispatch (defense in depth).

## Alternatives considered & why not

- **Allow any host.** Rejected: SSRF — the hosted server would fetch arbitrary
  operator-reachable URLs on a user's say-so.
- **Block `openai_compatible` entirely on hosted.** Rejected: it's the whole point
  for self-hosters running Ollama/LiteLLM behind their own gateway; an allowlist
  keeps that use while closing the hole.

## Consequences

- Self-host operators opt in specific internal hosts via one env var.
- Server-to-provider fetches aren't subject to the browser CSP, so adding a new
  *public* provider needs only client adapter code, not a gateway CSP change; the
  allowlist governs only the `openai_compatible` kind.
- The desktop path is unaffected — it dispatches from the webview, not the server.
