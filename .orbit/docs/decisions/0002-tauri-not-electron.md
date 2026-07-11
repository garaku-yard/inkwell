# 0002 — Tauri (not Electron) for the desktop shell

**Status:** Accepted

## Context

Local-first ([0001](./0001-local-first-architecture.md)) needs a cross-platform
desktop shell (Windows + Linux today, macOS deferred) that can reach the
filesystem and the OS keychain and bundle a Next.js frontend.

## Decision

Use **Tauri v2** (Rust shell + system webview). The Rust side owns SQLite
migrations, the keychain bridge, the `.fdx` open-file handler, window chrome, and
capability grants; the frontend is a static Next.js export loaded in the webview.

## Alternatives considered & why not

- **Electron.** Rejected: ships a full Chromium per app — large bundles and heavy
  memory for what is fundamentally a text tool. Tauri's system-webview approach
  yields much smaller artefacts.
- **PWA / browser-only.** Rejected: no reliable arbitrary-folder filesystem access
  and no OS keychain — both are core (the vault is real files on disk; BYO keys
  live in the keychain).
- **Native per-OS apps.** Rejected: triples the UI surface; the whole point is one
  frontend everywhere.

## Consequences

- A Rust shell (`client/src-tauri/`) with per-OS webview quirks to manage.
- Those quirks drove follow-on decisions: the frameless themed titlebar
  ([0005](./0005-frameless-themed-titlebar.md)), explicit window icon + `WM_CLASS`
  handling across Linux WMs.
- Smaller bundles; NSIS (Windows) + AppImage/`.deb` (Linux) release targets.
- macOS is mechanically available (Tauri targets it) but deferred on signing.
