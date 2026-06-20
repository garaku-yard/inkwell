"use client"

/**
 * InsertMenu — the one in-canvas element picker shared by every editor.
 *
 * A quiet, keyboard-navigable floating list summoned two ways: the left-gutter
 * "+" handle (mouse) or "/" on an empty line (keyboard). Each format supplies
 * its own element vocabulary via `items`; the look and interaction stay
 * identical everywhere. This replaces the ad-hoc per-format insert toolbars.
 */

import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

export interface InsertItem {
  /** Element type passed back to the editor's insert handler. */
  type: string
  /** Short command for "/" filtering (e.g. "d" for dialogue). */
  command: string
  label: string
  description?: string
  icon: React.ComponentType<{ className?: string }>
}

interface InsertMenuProps {
  items: InsertItem[]
  /** Text typed after "/", for live filtering. Empty shows everything. */
  query?: string
  /** Viewport coordinates (from getBoundingClientRect) to anchor the menu. */
  position: { top: number; left: number }
  onSelect: (type: string) => void
  onDismiss: () => void
}

function filterItems(items: InsertItem[], query: string): InsertItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((it) => it.command.startsWith(q) || it.label.toLowerCase().includes(q))
}

export function InsertMenu({ items, query = "", position, onSelect, onDismiss }: InsertMenuProps) {
  const matches = filterItems(items, query)
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    setActiveIdx(0)
  }, [query, matches.length])

  // Keyboard navigation. Capture so it wins over the underlying contentEditable.
  useEffect(() => {
    if (matches.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onDismiss()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIdx((i) => (i + 1) % matches.length)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIdx((i) => (i - 1 + matches.length) % matches.length)
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        onSelect(matches[activeIdx].type)
      }
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [matches, activeIdx, onSelect, onDismiss])

  // Click-away dismiss. Deferred a tick so the opening click doesn't close it.
  useEffect(() => {
    const onDown = () => onDismiss()
    const t = setTimeout(() => window.addEventListener("mousedown", onDown), 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener("mousedown", onDown)
    }
  }, [onDismiss])

  if (matches.length === 0) return null

  return (
    <div
      className="fixed z-50 min-w-[15rem] overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg"
      style={{ top: position.top, left: position.left }}
      role="listbox"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {matches.map((item, i) => {
        const Icon = item.icon
        return (
          <button
            key={item.type}
            type="button"
            role="option"
            aria-selected={activeIdx === i}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(item.type)
            }}
            onMouseEnter={() => setActiveIdx(i)}
            className={cn(
              "flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors",
              activeIdx === i ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
            )}
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 text-sm">
                <span className="font-medium">{item.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground/60">/{item.command}</span>
              </div>
              {item.description && (
                <div className="truncate text-xs text-muted-foreground/80">{item.description}</div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
