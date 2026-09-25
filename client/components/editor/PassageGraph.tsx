"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import type { Scene } from "@/services/project"
import { cn } from "@/lib/utils"
import { parsePassageMetadata } from "@/lib/interactive-fiction/runtime"

const NODE_W = 160
const NODE_H = 60
const H_GAP = 220
const V_GAP = 110

interface NodePos {
  id: string
  x: number
  y: number
}

interface Edge {
  from: string
  to: string
}

// Extract [[... -> target]] or [[target]] links from text
function parseLinks(passages: Scene[]): Edge[] {
  const nameToId = new Map<string, string>()
  for (const p of passages) {
    nameToId.set(p.scene_heading.toLowerCase().trim(), p.id)
  }

  const edges: Edge[] = []
  const seen = new Set<string>()

  for (const passage of passages) {
    const allText = (passage.elements ?? []).map((e) => e.content).join("\n")
    const re = /\[\[(?:[^\]]*?->\s*)?([^\]|>]+?)(?:\s*\|[^\]]*)?\]\]/g
    let m
    while ((m = re.exec(allText)) !== null) {
      const targetName = m[1].trim().toLowerCase()
      const targetId = nameToId.get(targetName)
      if (targetId && targetId !== passage.id) {
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

// Arrow from center-right of source to center-left of target
function edgePath(from: NodePos, to: NodePos): string {
  const x1 = from.x + NODE_W
  const y1 = from.y + NODE_H / 2
  const x2 = to.x
  const y2 = to.y + NODE_H / 2
  const dx = Math.abs(x2 - x1) * 0.5
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

// Self-loop (passage links to itself)
function selfLoopPath(node: NodePos): string {
  const cx = node.x + NODE_W / 2
  const top = node.y
  return `M ${cx - 12} ${top} C ${cx - 30} ${top - 40}, ${cx + 30} ${top - 40}, ${cx + 12} ${top}`
}

interface PassageGraphProps {
  passages: Scene[]
  activePassageId: string | null
  onSelectPassage: (id: string) => void
}

export function PassageGraph({ passages, activePassageId, onSelectPassage }: PassageGraphProps) {
  const [positions, setPositions] = useState<NodePos[]>(() => gridLayout(passages))
  const edges = useCallback(() => parseLinks(passages), [passages])()

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
    <div
      className="relative w-full h-full overflow-auto bg-[radial-gradient(circle,_hsl(var(--border))_1px,_transparent_1px)] bg-[length:24px_24px] select-none"
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

        {edges.map((edge, i) => {
          const from = posMap.get(edge.from)
          const to = posMap.get(edge.to)
          if (!from || !to) return null
          const isActive = edge.from === activePassageId || edge.to === activePassageId
          const isSelf = edge.from === edge.to

          return (
            <path
              key={i}
              d={isSelf ? selfLoopPath(from) : edgePath(from, to)}
              fill="none"
              strokeWidth={isActive ? 1.5 : 1}
              markerEnd={`url(#${isActive ? "arrow-active" : "arrow"})`}
              className={cn(
                "transition-all",
                isActive ? "stroke-primary" : "stroke-primary/30"
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
          const isActive = passage.id === activePassageId
          const outLinks = edges.filter((e) => e.from === passage.id).length
          const inLinks = edges.filter((e) => e.to === passage.id).length
          const metadata = parsePassageMetadata(passage.content)

          return (
            <div
              key={passage.id}
              className={cn(
                "absolute rounded-lg border-2 cursor-grab active:cursor-grabbing transition-shadow",
                "flex flex-col justify-center px-3 py-2 shadow-sm hover:shadow-md",
                isActive
                  ? "border-primary bg-primary/10 shadow-primary/20 shadow-md ring-2 ring-primary/30"
                  : nodeAccent(passage.id)
              )}
              style={{
                left: pos.x, top: pos.y, width: NODE_W, height: NODE_H,
                ...(metadata.color ? { borderColor: metadata.color } : {}),
              }}
              onMouseDown={(e) => onMouseDown(e, passage.id)}
              onClick={() => onSelectPassage(passage.id)}
            >
              <p className="text-xs font-semibold truncate text-foreground leading-tight">
                {passage.scene_heading || "Untitled"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {outLinks > 0 || inLinks > 0
                  ? `${outLinks} out · ${inLinks} in`
                  : "no links"}
                {metadata.tags[0] ? ` · ${metadata.tags[0]}` : ""}
              </p>
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
      <div className="absolute bottom-3 right-3 flex items-center gap-3 text-[10px] text-muted-foreground bg-background/80 backdrop-blur px-3 py-1.5 rounded-lg border">
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
  )
}
