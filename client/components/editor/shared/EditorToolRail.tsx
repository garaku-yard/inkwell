"use client"

/**
 * EditorToolRail — the shared element toolbar that rides the right edge of the
 * writing "page". It floats in the margin beside the paper (not at the window
 * edge), so it's well clear of the AI chat panel on the far right.
 *
 * Three states: pinned (a small docked card of icons), collapsed (a thin
 * handle), and — when collapsed — a flyout that appears on hover. Each format
 * passes its own element vocabulary; clicking an icon inserts/transforms that
 * element type. Replaces the per-format inline insert button rows.
 */

import { useState } from "react"
import { ChevronsLeft, ChevronsRight, GripVertical } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export interface RailItem {
  /** Element type passed back to the editor's insert handler. */
  type: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

function RailButtons({ items, onSelect }: { items: RailItem[]; onSelect: (type: string) => void }) {
  return (
    <TooltipProvider delayDuration={250}>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <Tooltip key={item.type}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => onSelect(item.type)}
                aria-label={item.label}
              >
                <Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        )
      })}
    </TooltipProvider>
  )
}

interface EditorToolRailProps {
  items: RailItem[]
  onSelect: (type: string) => void
  /** localStorage key to remember the pinned state per editor kind. */
  storageKey?: string
  /** Positioning for the outer wrapper (e.g. absolute, alongside the page). */
  className?: string
}

export function EditorToolRail({ items, onSelect, storageKey = "editor.rail.pinned", className }: EditorToolRailProps) {
  const [pinned, setPinned] = useState(() => {
    if (typeof localStorage === "undefined") return true
    return localStorage.getItem(storageKey) !== "0" // default pinned
  })

  const togglePin = () => {
    setPinned((p) => {
      const next = !p
      try {
        localStorage.setItem(storageKey, next ? "1" : "0")
      } catch {
        /* private mode / unavailable — applied for this session anyway */
      }
      return next
    })
  }

  return (
    <div className={cn("pointer-events-none", className)}>
      {/* Sticky so the rail rides along the page as it scrolls but stays in view. */}
      <div className="pointer-events-auto sticky top-6 w-max">
        {pinned ? (
          <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-1.5 shadow-sm">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground/60 hover:text-foreground"
              onClick={togglePin}
              aria-label="Collapse toolbar"
              title="Collapse"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
            <div className="my-0.5 h-px w-5 bg-border" />
            <RailButtons items={items} onSelect={onSelect} />
          </div>
        ) : (
          <div className="group/rail relative">
            <button
              type="button"
              onClick={togglePin}
              aria-label="Show toolbar"
              title="Toolbar"
              className="flex h-14 w-6 items-center justify-center rounded-lg border border-border bg-card/70 text-muted-foreground/50 shadow-sm transition-colors hover:bg-card hover:text-foreground"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            {/* Flyout — adjacent (no gap) so the hover doesn't drop crossing to it. */}
            <div className="pointer-events-none absolute left-full top-0 flex flex-col items-center gap-1 rounded-xl border border-border bg-popover p-1.5 opacity-0 shadow-lg transition-opacity group-hover/rail:pointer-events-auto group-hover/rail:opacity-100">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground/60 hover:text-foreground"
                onClick={togglePin}
                aria-label="Pin toolbar open"
                title="Pin open"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <div className="my-0.5 h-px w-5 bg-border" />
              <RailButtons items={items} onSelect={onSelect} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
