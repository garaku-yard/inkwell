/**
 * Tells open views that something changed underneath them.
 *
 * React fetches once and holds what it got. That is fine while the app is the
 * only writer, but the MCP bridge (ADR 0025) writes to the same SQLite from
 * outside the render tree, and SQLite has no way to notify a hook. Without
 * this, an agent can create a project and the dashboard keeps showing the list
 * it fetched a minute ago — the write worked and the writer has no way to know.
 *
 * Deliberately limited to views that only read. Editors seed their local state
 * from the project once, on purpose, and re-syncing them from a refetch could
 * overwrite text the writer is part-way through typing — a live editor needs
 * to merge, not replace, and that is its own piece of work.
 */

import { useEffect, useRef } from "react"

const EVENT = "inkwell:data-changed"

export interface DataChange {
  /** The project the change touched, when it touched one. */
  projectId?: string
  /** The tool that made it, for debugging a surprising refresh. */
  source?: string
}

/** Announces a change made outside React. No-op outside the browser. */
export function announceDataChanged(detail: DataChange = {}): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<DataChange>(EVENT, { detail }))
}

/** Runs `handler` whenever data changes underneath the current view. The
 *  handler is held in a ref so callers can pass an inline function without
 *  resubscribing on every render. */
export function useDataChanged(handler: (detail: DataChange) => void): void {
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => {
    const listener = (event: Event) => {
      latest.current((event as CustomEvent<DataChange>).detail ?? {})
    }
    window.addEventListener(EVENT, listener)
    return () => window.removeEventListener(EVENT, listener)
  }, [])
}
