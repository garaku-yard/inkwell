"use client"

import { useEffect } from "react"

import { isTauri } from "@tauri-apps/api/core"

/**
 * Mounts the MCP bridge listener for the lifetime of the app window, so an
 * external agent can drive Inkwell through the same tool registry the in-app
 * chat uses (ADR 0025).
 *
 * Desktop-only, and loaded dynamically: the handlers reach SQLite through the
 * local storage modules, which have no meaning in the web build. The Rust side
 * is what listens on the socket — this only answers what it forwards.
 */
export function McpBridge() {
  useEffect(() => {
    if (!isTauri()) return

    let dispose: (() => void) | undefined
    let cancelled = false

    void (async () => {
      const { startMcpBridge } = await import("@/lib/mcp/bridge")
      const unlisten = await startMcpBridge()
      if (cancelled) {
        unlisten()
        return
      }
      dispose = unlisten
    })()

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [])

  return null
}
