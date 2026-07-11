# 0008 — BYO-key AI only; delete the Python AI service

**Status:** Accepted

## Context

Early on, AI chat had a hosted path (a Python AI service) alongside emerging
bring-your-own-key support. Running AI first-party means the maintainers carry the
token cost, the abuse liability, and custody of provider keys — heavy weight for
an open, local-first writing tool.

## Decision

Make **BYO-key the only chat path**. Every chat goes through a user-configured
provider row (OpenAI / Anthropic / Gemini / `openai_compatible`). The legacy
Python AI service was **deleted**; the `chatProxy` fallback is gone; no client
path sends a chat without a `providerId`. Hosted dispatch goes through the
gateway's `pkg/aiadapter` (a server mirror of the client adapters).

## Alternatives considered & why not

- **First-party managed AI with our own keys.** Rejected *at the time*: token
  cost, abuse liability, and a product question (BYO users bring their own budget).
  *Note:* a **metered** managed-AI offering was later revived as Phase B of
  monetization ([0020](./0020-monetization-open-core-paddle.md)) — billed by
  tokens with per-tier allowances — which is a different shape from the deleted
  always-on Python proxy.
- **Keep both the hosted proxy and BYO.** Rejected: two code paths, two failure
  modes, two things to secure, for one feature.

## Consequences

- `aisettings-service` + the desktop keychain path became the whole story: desktop
  keys in the OS keychain dispatch from the webview (gateway never involved);
  hosted keys are AES-256-GCM-encrypted ([0010](./0010-aes-gcm-key-vault.md)).
- Per-user rate limiting, an operator allowlist for `openai_compatible`
  ([0009](./0009-openai-compatible-allowlist.md)), and a mid-stream `{error}`
  NDJSON line + friendly status mapping for chat error UX.
- The `ai.byo` capability is universal across desktop and web; the old
  `ai.hosted`/`ai.byo.hosted` capabilities were collapsed.
