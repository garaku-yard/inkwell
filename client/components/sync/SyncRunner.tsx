"use client"

/**
 * SyncRunner — drives the background sync loop for every opt-in project.
 *
 * Mounted once in the private layout. While the window is focused it syncs all
 * enabled projects on a light interval and again on each focus, so changes made
 * elsewhere flow in without the user pressing anything. Renders nothing and is
 * inert on builds without the `sync` capability or when no account is linked.
 */

import { useEffect } from "react"

import { getStorage } from "@/lib/storage"
import { isSyncAvailable, syncAllProjects } from "@/services/sync"

const TICK_MS = 45_000

export function SyncRunner() {
  // capabilities is a stable Set bound at boot — safe to read at render.
  const supported = getStorage().capabilities.has("sync")

  useEffect(() => {
    if (!supported) return
    let cancelled = false
    let running = false

    const run = async () => {
      if (cancelled || running || (typeof document !== "undefined" && document.hidden)) return
      running = true
      try {
        if (await isSyncAvailable()) await syncAllProjects()
      } catch {
        /* the per-project state records the error; try again next tick */
      } finally {
        running = false
      }
    }

    void run()
    const interval = setInterval(run, TICK_MS)
    const onFocus = () => void run()
    window.addEventListener("focus", onFocus)
    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener("focus", onFocus)
    }
  }, [supported])

  return null
}
