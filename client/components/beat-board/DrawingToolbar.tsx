"use client"

import {
  ArrowUpRight,
  Circle,
  Eraser,
  Minus,
  MousePointer2,
  PenLine,
  Square,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { DrawTool } from "./useDrawing"

interface DrawingToolbarProps {
  tool: DrawTool
  setTool: (t: DrawTool) => void
  color: string
  setColor: (c: string) => void
  width: number
  setWidth: (w: number) => void
}

const TOOLS: Array<{ tool: DrawTool; label: string; icon: typeof PenLine }> = [
  { tool: "select", label: "Select", icon: MousePointer2 },
  { tool: "pen", label: "Draw", icon: PenLine },
  { tool: "line", label: "Line", icon: Minus },
  { tool: "arrow", label: "Arrow", icon: ArrowUpRight },
  { tool: "rect", label: "Rectangle", icon: Square },
  { tool: "ellipse", label: "Ellipse", icon: Circle },
  { tool: "eraser", label: "Erase", icon: Eraser },
]

/** Ink first, then the colours a note tends to want. Charcoal is the brand's
 *  ink (#1f2420 family); the rest are for marking up, not decoration. */
const COLORS = ["#1f2420", "#b91c1c", "#1d4ed8", "#15803d", "#a16207"]

const WIDTHS = [2, 3, 6]

/**
 * The beat board's drawing toolbar.
 *
 * Sits over the canvas rather than in a rail: the board is a free surface with no
 * page column to hang a margin off, and the tool in hand should be visible while
 * you're using it. Quiet at rest — it's chrome over someone's work, not a
 * feature vying for attention.
 */
export function DrawingToolbar({
  tool, setTool, color, setColor, width, setWidth,
}: DrawingToolbarProps) {
  return (
    <div
      data-testid="drawing-toolbar"
      className="absolute left-4 top-4 z-20 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-md backdrop-blur-sm"
    >
      {TOOLS.map(({ tool: t, label, icon: Icon }) => (
        <Button
          key={t}
          size="icon"
          variant={tool === t ? "secondary" : "ghost"}
          className="h-8 w-8"
          aria-label={label}
          aria-pressed={tool === t}
          title={label}
          onClick={() => setTool(t)}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}

      {/* Colour + width are meaningless for select/erase — hide them rather than
          show controls that do nothing. */}
      {tool !== "select" && tool !== "eraser" && (
        <>
          <div className="mx-1 h-6 w-px bg-border" aria-hidden />

          <div className="flex items-center gap-1" role="group" aria-label="Stroke colour">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cn(
                  "h-5 w-5 rounded-full border transition-transform",
                  color === c ? "border-foreground scale-110" : "border-border hover:scale-105",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="mx-1 h-6 w-px bg-border" aria-hidden />

          <div className="flex items-center gap-1" role="group" aria-label="Stroke width">
            {WIDTHS.map((w) => (
              <Button
                key={w}
                size="icon"
                variant={width === w ? "secondary" : "ghost"}
                className="h-8 w-8"
                aria-label={`Width ${w}`}
                aria-pressed={width === w}
                onClick={() => setWidth(w)}
              >
                {/* The swatch is the width — a dot the size of the stroke says it
                    faster than a number. */}
                <span
                  className="rounded-full bg-foreground"
                  style={{ width: `${w + 2}px`, height: `${w + 2}px` }}
                />
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
