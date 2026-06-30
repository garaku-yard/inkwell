"use client"

/**
 * useCaretReporter — broadcasts this client's cursor to the room.
 *
 * Listens to the document's `selectionchange` and, whenever the caret is inside
 * an editable within `containerRef`, reports `{elementId: host.id, offset}` via
 * `sendCaret` (which throttles). When the selection leaves the editing surface
 * it clears the caret once. Editor-agnostic — it relies only on the editables
 * carrying a DOM `id`; the matching overlay ({@link RemoteCarets}) resolves that
 * id back to a node.
 */

import { useEffect, useRef } from "react"

import { caretOffsetInElement, editableHostFromSelection } from "@/lib/realtime/caret-dom"

export function useCaretReporter({
  containerRef,
  sendCaret,
  enabled,
}: {
  /** The editing surface; only selections inside it are reported. */
  containerRef: React.RefObject<HTMLElement | null>
  /** From the presence hook; internally throttled. */
  sendCaret: (elementId: string, offset: number) => void
  /** Gate on the live connection so we don't track a caret no one receives. */
  enabled: boolean
}) {
  // The last element we reported, so we clear exactly once when the caret
  // leaves the surface (and don't spam clears while it's already outside).
  const reportedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    const onSelectionChange = () => {
      const host = editableHostFromSelection()
      const container = containerRef.current
      if (!host || !container || !container.contains(host)) {
        if (reportedRef.current !== null) {
          reportedRef.current = null
          sendCaret("", -1) // clear: we left the surface
        }
        return
      }
      const offset = caretOffsetInElement(host)
      if (offset == null) return
      reportedRef.current = host.id
      sendCaret(host.id, offset)
    }
    document.addEventListener("selectionchange", onSelectionChange)
    return () => document.removeEventListener("selectionchange", onSelectionChange)
  }, [containerRef, sendCaret, enabled])
}
