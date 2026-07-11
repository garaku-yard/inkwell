# 0017 — Optional desktop login; keychain token auth

**Status:** Accepted

## Context

Local-first ([0001](./0001-local-first-architecture.md)) says the desktop app must
run fully offline with no account. But sync ([0013](./0013-sync-client-uuid-lww.md))
and collaboration need an identity. The two must coexist without a login gate, and
the web cookie/JWT flow doesn't fit a Tauri webview (its origin is
`tauri://localhost`).

## Decision

Desktop login is an **optional link, never a gate**. The gateway returns the JWT
**in-body** for requests carrying `X-Inkwell-Client: desktop`; the client stores
it in the **OS keychain** and replays it as `Authorization: Bearer`. Token clients
are **CORS/CSRF-exempt** so the `tauri://localhost` origin works. `me()` returns
the real account when linked, else the local profile — there's never a forced
login. The gateway URL defaults to `https://inkwell.garakuyard.com` with a
Settings → Account override for self-hosters. A 24h access token refreshes
silently from a 7-day refresh token in the keychain via `POST /auth/refresh`.

## Alternatives considered & why not

- **Forced login on launch.** Rejected: breaks the local-first promise — the app
  must open and work with no account and all data local.
- **Cookie auth on desktop (like web).** Rejected: the webview's
  `tauri://localhost` origin and CSRF/Origin checks don't play well with cookies;
  in-body token + keychain is clean and native.

## Consequences

- All local data stays in SQLite whether or not the user links an account.
- The header reflects linked-vs-local honestly (offers "Sign in" when unlinked,
  not a fake account).
- Self-hosters point the app at their own gateway via the Settings override.
