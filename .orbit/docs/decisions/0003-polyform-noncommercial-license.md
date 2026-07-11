# 0003 — PolyForm Noncommercial 1.0.0 license

**Status:** Accepted

## Context

Inkwell is open source — free to study, modify, and share — but the maintainers
want commercial hosting of Inkwell-as-a-paid-service to require an agreement, so a
third party can't simply rebrand it and sell it while the maintainers carry the
work.

## Decision

License under **PolyForm Noncommercial 1.0.0**. All noncommercial use —
personal, research, education, hobby, non-profit, government — is free.
Commercial use (selling, rebranding, or offering Inkwell as a paid service)
requires a separate agreement.

## Alternatives considered & why not

- **MIT / Apache-2.0.** Rejected: permissive licences let anyone host and sell the
  product commercially with no reciprocity — the exact outcome to prevent.
- **AGPL-3.0.** Rejected: copyleft adds compliance friction for honest
  contributors yet still permits a commercial competitor to host the service
  (as long as they publish source); it doesn't reserve the commercial-hosting
  right the way source-available noncommercial does.
- **Fully proprietary / closed.** Rejected: contradicts the open, self-hostable
  ethos — users must be able to run and inspect the whole stack.

## Consequences

- The repo is source-available and self-hostable for free for the vast majority of
  users.
- The commercial-hosting reservation is what makes the open-core monetization
  model ([0020](./0020-monetization-open-core-paddle.md)) coherent.
- `LICENSE` at the repo root is canonical; GitHub detects it. The spine references
  it, never duplicates the terms.
