"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import type { Scene } from "@/services/project"
import { cn } from "@/lib/utils"
import { parseConditionalStatement, parseLinks, parsePassageMetadata } from "@/lib/interactive-fiction/runtime"

const NODE_W = 168
const NODE_H = 92
const H_GAP = 204
const V_GAP = 128

interface NodePos {
  id: string
  x: number
  y: number
}

interface Edge {
  from: string
  to: string
}

function collectEdges(passages: Scene[]): Edge[] {
  const nameToId = new Map<string, string>()
  for (const p of passages) {
    const name = p.scene_heading.toLowerCase().trim()
    if (!nameToId.has(name)) nameToId.set(name, p.id)
  }

  const edges: Edge[] = []
  const seen = new Set<string>()

  for (const passage of passages) {
    for (const element of passage.elements ?? []) {
      if (element.element_type !== "body" && element.element_type !== "choice" && element.element_type !== "conditional") continue
      let text = element.content
      if (element.element_type === "conditional") {
        try {
          const condition = parseConditionalStatement(text)
          text = `${condition.whenTrue} ${condition.whenFalse}`
        } catch {
          continue
        }
      }
      for (const link of parseLinks(text)) {
        const targetId = nameToId.get(link.target.toLowerCase())
        if (!targetId) continue
        const key = `${passage.id}→${targetId}`
        if (!seen.has(key)) {
          seen.add(key)
          edges.push({ from: passage.id, to: targetId })
        }
      }
    }
  }
  return edges
}

function gridLayout(passages: Scene[]): NodePos[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(passages.length)))
  return passages.map((p, i) => ({
    id: p.id,
    x: (i % cols) * H_GAP + 32,
    y: Math.floor(i / cols) * V_GAP + 32,
  }))
}

function edgePath(from: NodePos, to: NodePos): string {
  const deltaX = to.x - from.x
  if (Math.abs(deltaX) < NODE_W / 2) {
    const down = to.y >= from.y
    const x1 = from.x + NODE_W / 2
    const y1 = from.y + (down ? NODE_H : 0)
    const x2 = to.x + NODE_W / 2
    const y2 = to.y + (down ? 0 : NODE_H)
    const bend = (y2 - y1) / 2
    return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`
  }
  const right = deltaX > 0
  const x1 = from.x + (right ? NODE_W : 0)
  const y1 = from.y + NODE_H / 2
  const x2 = to.x + (right ? 0 : NODE_W)
  const y2 = to.y + NODE_H / 2
  const bend = (x2 - x1) / 2
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
}

// Self-loop (passage links to itself)
function selfLoopPath(node: NodePos): string {
  const right = node.x + NODE_W
  const middle = node.y + NODE_H / 2
  return `M ${right} ${middle - 10} C ${right + 32} ${middle - 32}, ${right + 32} ${middle + 32}, ${right} ${middle + 10}`
}

interface PassageGraphProps {
  passages: Scene[]
  activePassageId: string | null
  onSelectPassage: (id: string) => void
}

export function PassageGraph({ passages, activePassageId, onSelectPassage }: PassageGraphProps) {
  const [positions, setPositions] = useState<NodePos[]>(() => gridLayout(passages))
  const [hoveredPassageId, setHoveredPassageId] = useState<string | null>(null)
  const [pinnedPassageId, setPinnedPassageId] = useState<string | null>(null)
  const [showAllLinks, setShowAllLinks] = useState(false)
  const edges = useMemo(() => collectEdges(passages), [passages])
  const focusedPassageId = hoveredPassageId ?? pinnedPassageId ?? activePassageId ?? passages[0]?.id
  const visibleEdges = showAllLinks
    ? edges
    : edges.filter((edge) => edge.from === focusedPassageId || edge.to === focusedPassageId)
  const connectedPassageIds = new Set(visibleEdges.flatMap((edge) => [edge.from, edge.to]))

  // Re-layout when passage list changes (new passage added)
  useEffect(() => {
    setPositions((prev) => {
      const existing = new Map(prev.map((p) => [p.id, p]))
      const cols = Math.max(1, Math.ceil(Math.sqrt(passages.length)))
      return passages.map((p, i) => {
        if (existing.has(p.id)) return existing.get(p.id)!
        return {
          id: p.id,
          x: (i % cols) * H_GAP + 32,
          y: Math.floor(i / cols) * V_GAP + 32,
        }
      })
    })
  }, [passages])

  const dragging = useRef<{ id: string; ox: number; oy: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const canvasW = Math.max(800, ...positions.map((p) => p.x + NODE_W + 40))
  const canvasH = Math.max(500, ...positions.map((p) => p.y + NODE_H + 40))

  const onMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const pos = positions.find((p) => p.id === id)!
    dragging.current = { id, ox: e.clientX - pos.x, oy: e.clientY - pos.y }
  }, [positions])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    const { id, ox, oy } = dragging.current
    setPositions((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, x: Math.max(0, e.clientX - ox), y: Math.max(0, e.clientY - oy) } : p
      )
    )
  }, [])

  const onMouseUp = useCallback(() => {
    dragging.current = null
  }, [])

  const posMap = new Map(positions.map((p) => [p.id, p]))

  // Node colour by number of outgoing links
  function nodeAccent(id: string) {
    const outCount = edges.filter((e) => e.from === id).length
    if (outCount === 0) return "border-muted-foreground/30 bg-muted/40"
    if (outCount === 1) return "border-primary/40 bg-primary/5"
    return "border-violet-500/40 bg-violet-500/5"
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2 text-sm">
        <label htmlFor="if-graph-focus" className="font-medium">Trace links for</label>
        <select
          id="if-graph-focus"
          className="h-8 max-w-52 rounded-md border border-input bg-background px-2"
          value={pinnedPassageId ?? activePassageId ?? passages[0]?.id ?? ""}
          onChange={(event) => setPinnedPassageId(event.target.value)}
          disabled={passages.length === 0}
        >
          {passages.map((passage) => <option key={passage.id} value={passage.id}>{passage.scene_heading || "Untitled"}</option>)}
        </select>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-muted-foreground">
          <input type="checkbox" checked={showAllLinks} onChange={(event) => setShowAllLinks(event.target.checked)} />
          Show all links
        </label>
        <span className="hidden text-muted-foreground sm:inline">Hover a passage to trace · Click to edit</span>
      </div>
      <div
        className="relative min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle,_hsl(var(--border))_1px,_transparent_1px)] bg-[length:24px_24px] select-none"
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <svg
          ref={svgRef}
          className="absolute inset-0 pointer-events-none"
          style={{ width: canvasW, height: canvasH }}
        >
          <defs>
            <marker
              id="arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L8,3 z" className="fill-primary/60" />
            </marker>
            <marker
              id="arrow-active"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L8,3 z" className="fill-primary" />
            </marker>
          </defs>

          {visibleEdges.map((edge) => {
            const from = posMap.get(edge.from)
            const to = posMap.get(edge.to)
            if (!from || !to) return null
            const isActive = edge.from === focusedPassageId || edge.to === focusedPassageId
            const isSelf = edge.from === edge.to

            return (
              <path
                key={`${edge.from}-${edge.to}`}
                data-from={edge.from}
                data-to={edge.to}
                d={isSelf ? selfLoopPath(from) : edgePath(from, to)}
                fill="none"
                strokeWidth={isActive ? 1.5 : 1}
                markerEnd={`url(#${isActive ? "arrow-active" : "arrow"})`}
                className={cn(
                  "transition-all",
                  isActive ? "stroke-primary" : "stroke-primary/20"
                )}
              />
            )
          })}
        </svg>

        {/* Nodes */}
        <div className="relative" style={{ width: canvasW, height: canvasH }}>
          {passages.map((passage) => {
            const pos = posMap.get(passage.id)
            if (!pos) return null
            const isActive = passage.id === focusedPassageId
            const outLinks = edges.filter((e) => e.from === passage.id).length
            const inLinks = edges.filter((e) => e.to === passage.id).length
            const metadata = parsePassageMetadata(passage.content)

            return (
              <div
                key={passage.id}
                className={cn(
                  "absolute rounded-lg border-2 cursor-grab active:cursor-grabbing transition-shadow",
                  "flex flex-col justify-center px-3 py-2 shadow-sm hover:shadow-md",
                  !showAllLinks && passage.id !== focusedPassageId && !connectedPassageIds.has(passage.id) && "opacity-50",
                  isActive
                    ? "border-primary bg-primary/10 shadow-primary/20 shadow-md ring-2 ring-primary/30"
                    : nodeAccent(passage.id)
                )}
                style={{
                  left: pos.x, top: pos.y, width: NODE_W, height: NODE_H,
                  ...(metadata.color ? { borderColor: metadata.color } : {}),
                }}
                onMouseDown={(e) => onMouseDown(e, passage.id)}
                onMouseEnter={() => setHoveredPassageId(passage.id)}
                onMouseLeave={() => setHoveredPassageId(null)}
                onClick={() => onSelectPassage(passage.id)}
              >
                <p className="text-xs font-semibold truncate text-foreground leading-tight">
                  {passage.scene_heading || "Untitled"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {outLinks > 0 || inLinks > 0
                    ? `${outLinks} out · ${inLinks} in`
                    : "no links"}
                  {metadata.tags[0] ? ` · ${metadata.tags[0]}` : ""}
                </p>
                {metadata.condition && <p className="mt-1 truncate text-xs text-foreground" title={`Trigger / condition: ${metadata.condition}`}>
                  <span className="font-semibold">Trigger:</span> {metadata.condition}
                </p>}
                {metadata.note && <p className="truncate text-xs text-muted-foreground" title={`Author note: ${metadata.note}`}>
                  <span className="font-semibold">Note:</span> {metadata.note}
                </p>}
              </div>
            )
          })}
        </div>

        {passages.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            No passages yet — create one in the Write view.
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-3 right-3 flex items-center gap-3 text-xs text-muted-foreground bg-background/80 backdrop-blur px-3 py-1.5 rounded-lg border">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded border-2 border-muted-foreground/30 bg-muted/40 inline-block" /> No links
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded border-2 border-primary/40 bg-primary/5 inline-block" /> 1 link
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded border-2 border-violet-500/40 bg-violet-500/5 inline-block" /> 2+ links
          </span>
          <span className="text-muted-foreground/50">Drag to rearrange</span>
        </div>
      </div>
    </div>
  )
}
