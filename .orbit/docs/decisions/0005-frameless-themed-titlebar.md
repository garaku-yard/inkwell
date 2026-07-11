# 0005 — Frameless transparent themed titlebar

**Status:** Accepted

## Context

Under Tauri ([0002](./0002-tauri-not-electron.md)) the native OS window frame
didn't follow the in-app theme — a light OS titlebar over a dark editor (and vice
versa) looked broken, and the frame chrome clashed with the "quiet craft" feel.

## Decision

Disable native chrome (`decorations: false`, `transparent: true`, `shadow: false`
in `tauri.conf.json`) and draw a **custom 32px React titlebar**
(`window-titlebar.tsx`, rendered only under Tauri) with themed min/max/close
buttons, a `data-tauri-drag-region` drag zone, and maximise-state tracking that
toggles a `window-maximised` class. `body` gets a 10px radius + 1px themed border
that the compositor composites against the desktop; maximised flattens to 0.

## Alternatives considered & why not

- **Keep native OS chrome.** Rejected: it can't follow the app theme, so it always
  looks wrong in one mode.
- **Sync the native frame colour to the theme.** Rejected: unreliable and
  inconsistent across Linux window managers (Wayland/GNOME/KDE); no dependable
  cross-WM API.

## Consequences

- Custom drag region, window controls, and maximise tracking to maintain.
- Taskbar icon needs an explicit `window.set_icon(...)` in Rust setup (default
  behaviour is unreliable across Linux WMs); `WM_CLASS` comes from the crate name
  (`inkwell`).
- `DesktopMenuBridge` is mounted and ready for future in-app menu events (no-op
  today).
