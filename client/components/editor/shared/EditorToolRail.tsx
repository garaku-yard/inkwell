"use client"

/**
 * EditorToolRail — the shared element toolbar that rides the right edge of the
 * writing "page". It floats in the margin beside the paper (not at the window
 * edge), so it's well clear of the AI chat panel on the far right.
 *
 * Two states: pinned (a small docked card of icons) and collapsed (a thin
 * handle that expands in place on hover — the same card grows from a pill into
 * the full icon column, so there's never a second surface beside it). Each
 * format passes its own element vocabulary; clicking an icon inserts/transforms
 * that element type. Replaces the per-format inline insert button rows.
 */

import { useState } from "react"
import { ChevronsLeft, ChevronsRight, GripVertical } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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

/**
 * A rail entry that groups related element types behind a single icon. Clicking
 * it opens a flyout toward the page (away from the AI panel) with the variants,
 * so the rail stays short even when a format has many block types — e.g. one
 * "Heading" icon that expands to H1 / H2 / H3.
 */
export interface RailGroup {
  label: string
  icon: React.ComponentType<{ className?: string }>
  items: RailItem[]
}

/** A rail position is either a single insert action or an expandable group. */
export type RailEntry = RailItem | RailGroup

function isRailGroup(entry: RailEntry): entry is RailGroup {
  return (entry as RailGroup).items !== undefined
}

/** A group icon with a dot marker; click reveals its variants in a flyout. */
function RailGroupButton({ group, onSelect }: { group: RailGroup; onSelect: (type: string) => void }) {
  const [open, setOpen] = useState(false)
  const Icon = group.icon
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label={group.label}
          title={group.label}
        >
          <Icon className="h-4 w-4" />
          {/* Asterisk marks this icon as an expandable group. */}
          <span
            className="absolute right-1 top-0.5 text-[11px] leading-none text-muted-foreground/60"
            aria-hidden="true"
          >
            *
          </span>
        </Button>
      </PopoverTrigger>
      {/* side="right" so the flyout opens into the margin, off the page text. */}
      <PopoverContent side="right" align="center" sideOffset={8} className="flex w-auto gap-1 p-1.5">
        <TooltipProvider delayDuration={250}>
          {group.items.map((item) => {
            const ItemIcon = item.icon
            return (
              <Tooltip key={item.type}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      onSelect(item.type)
                      setOpen(false)
                    }}
                    aria-label={item.label}
                  >
                    <ItemIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{item.label}</TooltipContent>
              </Tooltip>
            )
          })}
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  )
}

function RailButtons({ items, onSelect }: { items: RailEntry[]; onSelect: (type: string) => void }) {
  return (
    <TooltipProvider delayDuration={250}>
      {items.map((entry) => {
        if (isRailGroup(entry)) {
          return <RailGroupButton key={entry.label} group={entry} onSelect={onSelect} />
        }
        const Icon = entry.icon
        return (
          <Tooltip key={entry.type}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => onSelect(entry.type)}
                aria-label={entry.label}
              >
                <Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{entry.label}</TooltipContent>
          </Tooltip>
        )
      })}
    </TooltipProvider>
  )
}

interface EditorToolRailProps {
  items: RailEntry[]
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
          /*
           * Morph-in-place: one card that grows on hover. At rest it's a thin
           * pill showing the grip; on hover the grip cross-fades to the pin
           * button and the icon column expands beneath it (grid-rows 0fr→1fr
           * height tween). No second surface ever appears beside it.
           */
          <div className="group/rail flex flex-col items-center rounded-xl border border-border bg-card p-1.5 shadow-sm transition-shadow hover:shadow-md">
            {/* Top slot: grip at rest, pin-open button on hover (cross-fade in place). */}
            <div className="relative h-7 w-7">
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground/50 transition-opacity group-hover/rail:opacity-0">
                <GripVertical className="h-3.5 w-3.5" />
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="absolute inset-0 h-7 w-7 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover/rail:opacity-100"
                onClick={togglePin}
                aria-label="Pin toolbar open"
                title="Pin open"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
            </div>
            {/* Icon column: collapsed to zero height at rest, expands on hover. */}
            <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out group-hover/rail:grid-rows-[1fr]">
              <div className="overflow-hidden">
                <div className="flex flex-col items-center gap-1 pt-1">
                  <div className="h-px w-5 bg-border" />
                  <RailButtons items={items} onSelect={onSelect} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
