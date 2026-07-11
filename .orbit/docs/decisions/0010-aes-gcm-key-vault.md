# 0010 — AES-256-GCM key vault with associated-data binding

**Status:** Accepted

## Context

On the hosted path, users' BYO provider API keys must be stored server-side and
sent to the provider at dispatch. Plaintext at rest is unacceptable, and a
ciphertext must not be transplantable between rows or users.

## Decision

Encrypt keys with **AES-256-GCM** using a 32-byte master key (`AI_ENCRYPTION_KEY`,
base64) via `pkg/crypto`. The **associated data is `(userID, rowID)`**, so a
ciphertext can't be cut-and-pasted into another row or another user's account.
Decryption happens **only** inside `aisettings-service.GetForDispatch`, which the
gateway calls just before invoking the adapter. A `key_version` column is
**reserved** for rotation but rotation is not wired by default; a multi-key
registry + an `aisettings -rotate` re-encrypt flag were later added.

## Alternatives considered & why not

- **Plaintext (or reversible obfuscation) at rest.** Rejected: a DB dump would
  leak every user's provider keys.
- **A cloud KMS (AWS/GCP KMS).** Rejected as the default: it adds an external
  infra dependency that self-hosters would have to stand up; a base64 master key
  keeps self-hosting trivial while still being real AEAD.
- **Rotate the master key now.** Deferred: rotating without a batch re-encrypt job
  makes every stored key undecryptable. Treated as a one-time commitment until the
  re-encrypt path shipped.

## Consequences

- The master key is a **one-time commitment**: back it up offline; rotating it
  without the re-encrypt job bricks every stored key and fails every chat. This is
  called out loudly in `.env.example` and [runbook.md](../runbook.md).
- AAD binding is asserted by tests (cross-tenant access → `ErrNotFound`; row-swap
  of ciphertexts fails).
- The desktop path doesn't use this at all — it stores plaintext keys in the OS
  keychain and never sends them to the server.
