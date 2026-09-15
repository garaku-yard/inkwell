"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { onMenuEvent } from "@/lib/desktop"

/**
 * Translates native menu clicks (emitted as `menu:<id>` events by the Rust
 * menu handler) into React navigation / UI intents. Mounts once at the top
 * of the app shell; in the web build the underlying listeners are no-ops.
 *
 * Current bindings:
 *
 * | Event              | Action                                               |
 * | ------------------ | ---------------------------------------------------- |
 * | `menu:new_project` | Navigate to /dashboard, open new-project via URL flag |
 * | `menu:open_dashboard` | Navigate to /dashboard |
 * | `menu:open_settings`  | Navigate to /settings |
 * | `menu:about`          | Navigate to /settings#about |
 * | `menu:visit_github`   | Open the project GitHub page in the default browser |
 *
 * The File → New Project action is delivered as a query param
 * (`/dashboard?new=1`) so the dashboard can detect it and open the existing
 * new-project dialog, keeping the menu decoupled from React state.
 */
export function DesktopMenuBridge() {
  const router = useRouter()

  useEffect(() => {
    const unsubscribers: Array<() => void> = []
    let cancelled = false

    void (async () => {
      const subs = await Promise.all([
        onMenuEvent("new_project", () => router.push("/dashboard?new=1")),
        onMenuEvent("open_dashboard", () => router.push("/dashboard")),
        onMenuEvent("open_settings", () => router.push("/settings")),
        onMenuEvent("about", () => router.push("/settings")),
        onMenuEvent("visit_github", () => {
          // Tauri's webview honours target=_blank by opening in the system
          // browser when the shell plugin is installed. Fall back to in-app
          // navigation if that plugin isn't present.
          window.open("https://github.com/garaku-yard/inkwell", "_blank", "noopener,noreferrer")
        }),
      ])
      if (cancelled) {
        subs.forEach((u) => u())
        return
      }
      unsubscribers.push(...subs)
    })()

    return () => {
      cancelled = true
      unsubscribers.forEach((u) => u())
    }
  }, [router])

  return null
}
