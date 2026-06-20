"use client"

import { useEffect, useLayoutEffect, useState } from "react"
import { isTauri as tauriIsTauri } from "@tauri-apps/api/core"

import { setStorage } from "./index"
import { createRemoteStorage } from "./remote"

/** `useLayoutEffect` logs a warning on the server because DOM layout
 *  doesn't exist there; aliasing to `useEffect` during SSR silences that
 *  without changing client behaviour (layout effects only matter when
 *  there's a DOM to measure/mutate). */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

/**
 * Blocks the app shell until a Storage implementation is bound. The desktop
 * build loads the SQLite-backed impl asynchronously (it can't be imported in
 * the web bundle because `@tauri-apps/plugin-sql` pulls in IPC that only
 * resolves inside a Tauri webview), so we need a gate between `getStorage()`
 * being callable and the React tree below being allowed to render.
 *
 * Both the server and the client's first render emit the loading
 * placeholder so React's hydration checks pass. On the web the binding
 * runs in a layout effect — React flushes the resulting state change
 * before the browser paints, so users never actually see the placeholder.
 * On Tauri the binding is async (dynamic import of the local impl) so a
 * brief "Loading…" frame is unavoidable while the chunk resolves.
 */
export function StorageProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<Error | null>(null)

  useIsomorphicLayoutEffect(() => {
    // Web path: bind synchronously inside a layout effect so the first
    // client paint already shows the real tree rather than "Loading…".
    // `isTauri()` checks `window.isTauri === true`, the flag Tauri v2
    // injects into every webview. Returns false everywhere else.
    if (tauriIsTauri()) return
    setStorage(createRemoteStorage())
    setReady(true)
  }, [])

  useEffect(() => {
    // Tauri path: the SQLite-backed impl is a separate chunk pulled in by
    // dynamic import. One brief "Loading…" frame on Tauri startup is the
    // cost of keeping `@tauri-apps/plugin-sql` out of the web bundle.
    //
    // If the import itself fails (missing plugin, corrupt bundle) we
    // surface an explicit error — silently falling back to the remote
    // impl would leave the user on a "connected" app with vault + BYO
    // features quietly broken.
    if (!tauriIsTauri()) return
    let cancelled = false
    void (async () => {
      try {
        // Wire native auth transport before anything renders: mark the HTTP
        // client native, apply the stored gateway URL, and reload a persisted
        // token, so the very first AuthContext.me() call carries the bearer
        // token (or its absence) rather than racing the keychain read.
        const { initDesktopAuth } = await import("../desktop-auth")
        await initDesktopAuth()
        if (cancelled) return
        const { createLocalStorage } = await import("./local")
        if (cancelled) return
        setStorage(createLocalStorage())
        setReady(true)
      } catch (err) {
        console.error("Failed to load local Storage implementation.", err)
        if (cancelled) return
        setLoadError(err as Error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loadError) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
          Inkwell couldn&apos;t load its local storage layer.
        </div>
        <div style={{ maxWidth: "40ch", fontSize: "0.9rem", opacity: 0.8 }}>
          This usually means the SQLite plugin failed to load. Please restart
          the app; if the problem persists, reinstall or report the error
          below.
        </div>
        <pre style={{ fontSize: "0.8rem", opacity: 0.7, whiteSpace: "pre-wrap" }}>
          {loadError.message}
        </pre>
      </div>
    )
  }

  if (!ready) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
        Loading…
      </div>
    )
  }

  return <>{children}</>
}
