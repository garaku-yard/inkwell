"use client"

import { useEffect, useState } from "react"
import { isTauri as tauriIsTauri } from "@tauri-apps/api/core"

import { setStorage } from "./index"
import { createRemoteStorage } from "./remote"

/**
 * Blocks the app shell until a Storage implementation is bound. The desktop
 * build loads the SQLite-backed impl asynchronously (it can't be imported in
 * the web bundle because `@tauri-apps/plugin-sql` pulls in IPC that only
 * resolves inside a Tauri webview), so we need a gate between `getStorage()`
 * being callable and the React tree below being allowed to render.
 *
 * Web builds bind synchronously and render immediately — no loading state is
 * visible to the user.
 */
export function StorageProvider({ children }: { children: React.ReactNode }) {
  // `@tauri-apps/api/core`'s `isTauri()` checks `window.isTauri === true`,
  // the runtime flag Tauri v2 injects into every webview. SSR/Next build
  // time returns false (no window), so the remote impl binds during static
  // export and the desktop impl takes over at runtime.
  const [ready, setReady] = useState(() => {
    if (typeof window === "undefined") return false
    if (!tauriIsTauri()) {
      setStorage(createRemoteStorage())
      return true
    }
    return false
  })

  useEffect(() => {
    if (ready) return
    let cancelled = false
    void (async () => {
      try {
        const { createLocalStorage } = await import("./local")
        if (cancelled) return
        setStorage(createLocalStorage())
      } catch (err) {
        // If the local impl can't load (e.g. plugin-sql missing), fall back
        // to remote so at least a "connection failed" error surfaces cleanly
        // instead of the UI hanging on the loading screen forever.
        console.error("Failed to load local Storage impl — falling back to remote.", err)
        if (cancelled) return
        setStorage(createRemoteStorage())
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready])

  if (!ready) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
        Loading…
      </div>
    )
  }

  return <>{children}</>
}
