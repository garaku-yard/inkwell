"use client"

/**
 * RemoteCarets — the floating collaborator cursors (a coloured caret + a name
 * flag that fades when idle), the visible payoff of the realtime caret channel.
 *
 * It is editor-agnostic: it resolves each caret's `elementId` with
 * `document.getElementById` and maps the offset to a pixel rect via
 * {@link rectForOffset}, so any editor that gives its editables stable ids can
 * drop this in. Mount it as a child of a `position: relative` element that
 * wraps the writing surface and pass that element's ref as `containerRef`;
 * caret positions are computed relative to it. Carets whose element isn't in
 * the DOM (a peer editing a passage you aren't viewing) are simply skipped.
 *
 * Positions are recomputed — RAF-coalesced — on scroll (capture, so the inner
 * scroll container counts), resize, content mutations, and caret updates.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import { rectForOffset } from "@/lib/realtime/caret-dom"
import { hueFor } from "@/lib/realtime/presence-ui"
import type { CaretSubscriber, RemoteCaret } from "@/hooks/useRealtimePresence"

/** A caret resolved to a screen position within the container. */
interface PlacedCaret {
  connId: string
  name: string
  color: string
  /** Container-relative pixel offsets. */
  left: number
  top: number
  height: number
  /** Bumps whenever the caret moves; re-keys the flag so its fade restarts. */
  seq: number
}

export function RemoteCarets({
  containerRef,
  subscribeCarets,
}: {
  containerRef: React.RefObject<HTMLElement | null>
  subscribeCarets: (handler: CaretSubscriber) => () => void
}) {
  const [carets, setCarets] = useState<RemoteCaret[]>([])
  const [placed, setPlaced] = useState<PlacedCaret[]>([])
  // Per-connection move counter so the name flag's fade animation restarts only
  // when that caret actually moves, not on every unrelated recompute.
  const seqRef = useRef<Map<string, { sig: string; seq: number }>>(new Map())
  // Last successfully-placed position per connection, so a caret we briefly
  // can't resolve (content mid-apply, element offscreen) holds its spot instead
  // of blinking to the margin.
  const lastByConnRef = useRef<Map<string, PlacedCaret>>(new Map())
  const rafRef = useRef<number | null>(null)

  useEffect(() => subscribeCarets(setCarets), [subscribeCarets])

  const recompute = useCallback(() => {
    const container = containerRef.current
    if (!container) {
      setPlaced([])
      return
    }
    const cRect = container.getBoundingClientRect()
    const prevByConn = lastByConnRef.current
    const out: PlacedCaret[] = []
    for (const c of carets) {
      const host = document.getElementById(c.elementId)
      let entry: PlacedCaret | null = null
      if (host && container.contains(host)) {
        const rect = rectForOffset(host, c.offset)
        if (rect) {
          const sig = `${c.elementId}:${c.offset}`
          const prev = seqRef.current.get(c.connId)
          const seq = prev && prev.sig === sig ? prev.seq : (prev?.seq ?? 0) + 1
          seqRef.current.set(c.connId, { sig, seq })
          entry = {
            connId: c.connId,
            name: c.name,
            color: `hsl(${hueFor(c.userId)} 70% 45%)`,
            left: rect.left - cRect.left,
            top: rect.top - cRect.top,
            height: rect.height || 18,
            seq,
          }
        }
      }
      // Couldn't place it this pass — keep the last known spot rather than jump.
      if (!entry) entry = prevByConn.get(c.connId) ?? null
      if (entry) out.push(entry)
    }
    const nextByConn = new Map(out.map((p) => [p.connId, p]))
    lastByConnRef.current = nextByConn
    // Forget bookkeeping for carets that are gone.
    for (const id of Array.from(seqRef.current.keys())) {
      if (!nextByConn.has(id)) seqRef.current.delete(id)
    }
    setPlaced(out)
  }, [carets, containerRef])

  const schedule = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      recompute()
    })
  }, [recompute])

  // Reposition before paint whenever the caret set (or layout deps) change.
  useLayoutEffect(() => {
    recompute()
  }, [recompute])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onChange = () => schedule()
    // capture so a scroll on the inner (PagedSheets) scroll container counts —
    // scroll events don't bubble.
    container.addEventListener("scroll", onChange, true)
    window.addEventListener("resize", onChange)
    const ro = new ResizeObserver(onChange)
    ro.observe(container)
    const mo = new MutationObserver(onChange)
    mo.observe(container, { subtree: true, childList: true, characterData: true })
    return () => {
      container.removeEventListener("scroll", onChange, true)
      window.removeEventListener("resize", onChange)
      ro.disconnect()
      mo.disconnect()
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [containerRef, schedule])

  if (placed.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      {placed.map((p) => (
        <div key={p.connId} className="absolute" style={{ left: p.left, top: p.top }}>
          <div style={{ width: 2, height: p.height, backgroundColor: p.color }} />
          <span
            key={p.seq}
            className="inkwell-remote-caret-flag absolute whitespace-nowrap rounded px-1 py-px text-[10px] font-medium leading-none text-white shadow-sm"
            style={{ top: -15, left: 0, backgroundColor: p.color }}
          >
            {p.name}
          </span>
        </div>
      ))}
    </div>
  )
}
