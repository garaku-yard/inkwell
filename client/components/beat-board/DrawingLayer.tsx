import type React from "react"

import type { Drawing } from "@/services/beat-board"
import type { DrawTool } from "./useDrawing"

interface DrawingLayerProps {
  drawings: Drawing[]
  draft: Drawing | null
  tool: DrawTool
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: () => void
  eraseShape: (id: string) => void
}

/** Every shape is a point list; the kind decides how to read it (decisions/0022).
 *  Returns the SVG geometry for one shape, or null when it has too few points to
 *  draw yet (the first frame of a stroke). */
function shapePath(d: Drawing): React.ReactElement | null {
  const { points, color, width, fill } = d.data
  if (points.length === 0) return null
  const stroke = { stroke: color, strokeWidth: width, fill: fill || "none" }
  const round = { strokeLinecap: "round", strokeLinejoin: "round" } as const

  switch (d.kind) {
    case "pen": {
      if (points.length < 2) return null
      const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
      return <path d={path} {...stroke} fill="none" {...round} />
    }
    case "line":
    case "arrow": {
      const [a, b] = points
      if (!b) return null
      return (
        <line
          x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          {...stroke} fill="none" {...round}
          markerEnd={d.kind === "arrow" ? "url(#draw-arrowhead)" : undefined}
        />
      )
    }
    case "rect": {
      const [a, b] = points
      if (!b) return null
      // Normalise: the user can drag in any direction, but SVG needs a positive
      // width/height from the top-left.
      return (
        <rect
          x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)}
          width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)}
          {...stroke} {...round}
        />
      )
    }
    case "ellipse": {
      const [a, b] = points
      if (!b) return null
      return (
        <ellipse
          cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2}
          rx={Math.abs(b.x - a.x) / 2} ry={Math.abs(b.y - a.y) / 2}
          {...stroke} {...round}
        />
      )
    }
    default:
      // An unknown kind (a shape from a newer build) renders as nothing rather
      // than throwing — the board still loads.
      return null
  }
}

/**
 * The drawing surface over the beat canvas.
 *
 * With the select tool it is `pointer-events: none`, so cards, connection
 * handles and double-click-to-add all behave exactly as before — the layer is
 * only in the way when a drawing tool is actually chosen.
 */
export function DrawingLayer({
  drawings, draft, tool, onPointerDown, onPointerMove, onPointerUp, eraseShape,
}: DrawingLayerProps) {
  const active = tool !== "select"
  const erasing = tool === "eraser"

  return (
    <svg
      data-testid="drawing-layer"
      className="absolute inset-0 w-full h-full"
      style={{
        zIndex: 2,
        // Only take the pointer when a tool needs it; otherwise the board is
        // untouched by the drawing feature existing.
        pointerEvents: active ? "auto" : "none",
        cursor: erasing ? "pointer" : active ? "crosshair" : "default",
        // The canvas scrolls; the layer must cover the scrollable extent, not
        // just the viewport, or shapes get clipped when the board is larger.
        minWidth: "100%",
        minHeight: "100%",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <defs>
        <marker id="draw-arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="context-stroke" />
        </marker>
      </defs>

      {drawings.map((d) => {
        const path = shapePath(d)
        if (!path) return null
        return (
          <g
            key={d.id}
            data-drawing-id={d.id}
            onPointerDown={erasing ? () => eraseShape(d.id) : undefined}
            style={erasing ? { cursor: "pointer" } : undefined}
            className={erasing ? "hover:opacity-40 transition-opacity" : undefined}
          >
            {/* A hairline stroke is nearly impossible to click. This invisible
                fat copy underneath widens the hit area for the eraser without
                changing how the shape looks. */}
            {erasing && (
              <g style={{ stroke: "transparent", strokeWidth: Math.max(d.data.width * 4, 16), fill: "none" }}>
                {shapePath({ ...d, data: { ...d.data, color: "transparent", width: Math.max(d.data.width * 4, 16) } })}
              </g>
            )}
            {path}
          </g>
        )
      })}

      {draft && shapePath(draft)}
    </svg>
  )
}
