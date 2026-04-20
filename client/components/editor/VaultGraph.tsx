"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import type { VaultGraph, VaultGraphNode } from "@/lib/storage"

interface VaultGraphProps {
  graph: VaultGraph
  /** Filename of the currently-open note, if any — highlighted in the
   *  visualisation so users can orient themselves. */
  activeFilename?: string | null
  /** Fired when a node is clicked (as opposed to dragged). Parent is
   *  expected to swap back to editor mode and open that note. */
  onSelect: (filename: string) => void
  className?: string
}

interface SimNode extends VaultGraphNode {
  x: number
  y: number
  vx: number
  vy: number
}

interface SimEdge {
  a: SimNode
  b: SimNode
}

/**
 * Hand-rolled force-directed graph. No external sim library — the
 * physics is Coulomb-like repulsion between all nodes + linear spring
 * along edges + a soft pull toward the origin to keep disconnected
 * components on-screen. Cheap enough for vaults in the low thousands
 * of notes.
 *
 * Rendered as inline SVG with a transformed `<g>` wrapper for pan /
 * zoom. Dragging a node disturbs the simulation; dragging the
 * background pans; wheel zooms around the cursor.
 */
export function VaultGraph({
  graph,
  activeFilename,
  onSelect,
  className,
}: VaultGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  // ── Build simulation state once per input graph ──────────────────
  const sim = useMemo(() => {
    const rng = mulberry32(1)
    const nodes: SimNode[] = graph.nodes.map((n) => ({
      ...n,
      // Seed with a small random spread so the repulsion has something
      // to push against. Deterministic RNG keeps the initial layout
      // stable across re-renders of the same graph.
      x: (rng() - 0.5) * 200,
      y: (rng() - 0.5) * 200,
      vx: 0,
      vy: 0,
    }))
    const byFile = new Map(nodes.map((n) => [n.filename, n]))
    const edges: SimEdge[] = []
    for (const e of graph.edges) {
      const a = byFile.get(e.from)
      const b = byFile.get(e.to)
      if (a && b) edges.push({ a, b })
    }
    return { nodes, edges }
  }, [graph])

  // View transform — pan (tx, ty) + zoom (k).
  const [view, setView] = useState({ tx: 0, ty: 0, k: 1 })

  // Drag state. When `nodeIdx !== null` we're dragging a node; when
  // null + `panning` we're panning the background. `moved` catches the
  // click-vs-drag distinction so clicking a node actually opens it.
  const dragRef = useRef<{
    nodeIdx: number | null
    panning: boolean
    moved: boolean
    startX: number
    startY: number
    startView?: { tx: number; ty: number }
  } | null>(null)

  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => setHover(null), [sim])
  // Tick counter — bumped each RAF frame to trigger a re-render that
  // reads the latest positions from `sim`.
  const [, setTick] = useState(0)

  // ── Resize observer so the SVG fills its parent ──────────────────
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Physics loop ─────────────────────────────────────────────────
  useEffect(() => {
    let running = true
    let rafId = 0

    const step = () => {
      if (!running) return
      const nodes = sim.nodes
      const edges = sim.edges
      const n = nodes.length

      // Repulsion: inverse-square force between every pair. n² loop is
      // fine up to a few hundred nodes; beyond that we'd want a
      // quadtree approximation, but vaults rarely get that big.
      const repulseK = 3000
      for (let i = 0; i < n; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < n; j++) {
          const b = nodes[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const distSq = Math.max(dx * dx + dy * dy, 1)
          const dist = Math.sqrt(distSq)
          const f = repulseK / distSq
          const fx = (f * dx) / dist
          const fy = (f * dy) / dist
          a.vx -= fx
          a.vy -= fy
          b.vx += fx
          b.vy += fy
        }
      }

      // Springs along edges — linear restoring force toward a target length.
      const restLen = 90
      const springK = 0.04
      for (const e of edges) {
        const dx = e.b.x - e.a.x
        const dy = e.b.y - e.a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const stretch = dist - restLen
        const fx = (springK * stretch * dx) / dist
        const fy = (springK * stretch * dy) / dist
        e.a.vx += fx
        e.a.vy += fy
        e.b.vx -= fx
        e.b.vy -= fy
      }

      // Soft pull toward origin so isolated nodes don't drift to
      // infinity. Stronger than a plain gravity — we want them visible.
      const centerK = 0.03
      for (const node of nodes) {
        node.vx -= node.x * centerK
        node.vy -= node.y * centerK
      }

      // Integrate with damping. The one currently being dragged is
      // pinned by the drag handler (skips velocity integration).
      const damping = 0.82
      const drag = dragRef.current
      for (let i = 0; i < n; i++) {
        const node = nodes[i]
        if (drag && drag.nodeIdx === i) {
          node.vx = 0
          node.vy = 0
          continue
        }
        node.vx *= damping
        node.vy *= damping
        node.x += node.vx
        node.y += node.vy
      }

      setTick((t) => (t + 1) & 0xffff)
      rafId = requestAnimationFrame(step)
    }

    rafId = requestAnimationFrame(step)
    return () => {
      running = false
      cancelAnimationFrame(rafId)
    }
  }, [sim])

  // ── Screen ⇄ graph coordinate helpers ─────────────────────────────
  const toGraph = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    const sx = clientX - rect.left - size.w / 2 - view.tx
    const sy = clientY - rect.top - size.h / 2 - view.ty
    return { x: sx / view.k, y: sy / view.k }
  }

  // ── Pointer handlers ─────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent, nodeIdx: number | null) => {
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    dragRef.current = {
      nodeIdx,
      panning: nodeIdx === null,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      startView: { tx: view.tx, ty: view.ty },
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!drag.moved && dx * dx + dy * dy > 9) drag.moved = true

    if (drag.nodeIdx !== null) {
      const node = sim.nodes[drag.nodeIdx]
      const { x, y } = toGraph(e.clientX, e.clientY)
      node.x = x
      node.y = y
    } else if (drag.panning && drag.startView) {
      setView((v) => ({
        ...v,
        tx: drag.startView!.tx + dx,
        ty: drag.startView!.ty + dy,
      }))
    }
  }

  const onPointerUp = (e: React.PointerEvent, nodeIdx: number | null) => {
    const drag = dragRef.current
    dragRef.current = null
    const el = e.currentTarget as HTMLElement
    try {
      el.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore — pointer already released */
    }
    if (drag && drag.nodeIdx === nodeIdx && nodeIdx !== null && !drag.moved) {
      onSelect(sim.nodes[nodeIdx].filename)
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    // Zoom around the cursor: keep the graph point under the cursor
    // fixed while k changes.
    const cx = e.clientX - rect.left - size.w / 2
    const cy = e.clientY - rect.top - size.h / 2
    const factor = Math.pow(1.0015, -e.deltaY)
    setView((v) => {
      const k = Math.max(0.2, Math.min(4, v.k * factor))
      const ratio = k / v.k
      return {
        k,
        tx: cx - (cx - v.tx) * ratio,
        ty: cy - (cy - v.ty) * ratio,
      }
    })
  }

  // ── Render ───────────────────────────────────────────────────────
  const cx = size.w / 2 + view.tx
  const cy = size.h / 2 + view.ty
  const transform = `translate(${cx} ${cy}) scale(${view.k})`

  return (
    <svg
      ref={svgRef}
      className={cn(
        "h-full w-full touch-none select-none bg-background",
        className,
      )}
      onPointerDown={(e) => {
        if (e.target === svgRef.current) onPointerDown(e, null)
      }}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => onPointerUp(e, null)}
      onWheel={onWheel}
    >
      <g transform={transform}>
        {sim.edges.map((e, i) => (
          <line
            key={i}
            x1={e.a.x}
            y1={e.a.y}
            x2={e.b.x}
            y2={e.b.y}
            stroke="var(--border)"
            strokeWidth={1.2 / view.k}
          />
        ))}
        {sim.nodes.map((n, i) => {
          const r = radiusFor(n.degree)
          const active = n.filename === activeFilename
          const isHover = hover === i
          return (
            <g
              key={n.filename}
              transform={`translate(${n.x} ${n.y})`}
              onPointerDown={(e) => {
                e.stopPropagation()
                onPointerDown(e, i)
              }}
              onPointerUp={(e) => {
                e.stopPropagation()
                onPointerUp(e, i)
              }}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover((h) => (h === i ? null : h))}
              className="cursor-pointer"
            >
              <circle
                r={r}
                fill={
                  active
                    ? "var(--primary)"
                    : isHover
                      ? "var(--accent-foreground)"
                      : "var(--muted-foreground)"
                }
                opacity={active || isHover ? 1 : 0.85}
              />
              {(isHover || active) && (
                <text
                  y={r + 12}
                  textAnchor="middle"
                  className="pointer-events-none"
                  fontSize={11 / view.k}
                  fill="var(--foreground)"
                  style={{
                    paintOrder: "stroke",
                    stroke: "var(--background)",
                    strokeWidth: 3 / view.k,
                    strokeLinejoin: "round",
                  }}
                >
                  {n.title}
                </text>
              )}
            </g>
          )
        })}
      </g>

      {sim.nodes.length === 0 && (
        <text
          x={size.w / 2}
          y={size.h / 2}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize={13}
        >
          No notes yet — the graph fills in as you write.
        </text>
      )}
    </svg>
  )
}

function radiusFor(degree: number): number {
  // Saturating log scale — a vault with 200-degree hub notes still has
  // visibly different sizes between singletons and mid-tier nodes.
  return 4 + Math.sqrt(degree) * 2.5
}

/** Deterministic small PRNG — used once per graph to lay out initial
 *  positions reproducibly. Good enough for seeding; the simulation
 *  carries it from there. */
function mulberry32(seed: number) {
  let a = seed | 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
