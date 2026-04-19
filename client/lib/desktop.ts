/**
 * Desktop-only helpers. Every function is a no-op (or returns a dummy
 * unsubscribe) when the app isn't running inside Tauri, so callsites can
 * stay unconditional — the web build ignores them.
 */

import { isTauri } from "@tauri-apps/api/core"

/** Sets the native window title. Use for "Inkwell — ${projectTitle}" style
 *  reflections. Safe to call in the web build; it just returns. */
export async function setWindowTitle(title: string): Promise<void> {
  if (!isTauri()) return
  const { getCurrentWindow } = await import("@tauri-apps/api/window")
  await getCurrentWindow().setTitle(title)
}

/** Listen for a `menu:<id>` event emitted by the Rust menu handler.
 *  Returns an unsubscribe function. In the web build this is a no-op that
 *  returns a no-op unsubscribe, so React effects can always call it. */
export async function onMenuEvent(
  id: string,
  handler: () => void,
): Promise<() => void> {
  if (!isTauri()) return () => {}
  const { listen } = await import("@tauri-apps/api/event")
  const unlisten = await listen(`menu:${id}`, () => handler())
  return unlisten
}
