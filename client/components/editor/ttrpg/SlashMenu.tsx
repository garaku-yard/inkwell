"use client"

import { useEffect, useState } from "react"
import { Dice6, FileText, Pencil, Pin, Quote, Table } from "lucide-react"

import { cn } from "@/lib/utils"

import type { RPGElementType } from "./keymap"

interface SlashMenuItem {
  command: string
  label: string
  description: string
  type: RPGElementType
  icon: React.ComponentType<{ className?: string }>
}

const ITEMS: SlashMenuItem[] = [
  { command: "stat", label: "Stat block", description: "AC, HP, ability scores, traits, actions", type: "stat_block", icon: Pin },
  { command: "table", label: "Table", description: "Markdown pipe table", type: "table", icon: Table },
  { command: "dice", label: "Dice table", description: "Random results indexed by die roll", type: "dice_table", icon: Dice6 },
  { command: "callout", label: "Callout", description: "Designer note in a coloured box", type: "callout", icon: Quote },
  { command: "rule", label: "Rule box", description: "Boxed rule reminder", type: "rule_box", icon: FileText },
  { command: "heading", label: "Heading", description: "h2 section title", type: "h2", icon: Pencil },
]

interface SlashMenuProps {
  /** Text typed after `/` (excluding the slash). Used to filter the
   *  menu — `/sta` keeps stat_block, `/d` keeps dice_table. */
  query: string
  position: { top: number; left: number }
  onSelect: (type: RPGElementType) => void
  onDismiss: () => void
}

function filterItems(query: string): SlashMenuItem[] {
  if (!query.trim()) return ITEMS
  const q = query.toLowerCase()
  return ITEMS.filter(
    (item) => item.command.startsWith(q) || item.label.toLowerCase().includes(q),
  )
}

export function SlashMenu({ query, position, onSelect, onDismiss }: SlashMenuProps) {
  const matches = filterItems(query)
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    setActiveIdx(0)
  }, [query, matches.length])

  useEffect(() => {
    if (matches.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onDismiss()
        return
      }
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIdx((idx) => (idx + 1) % matches.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIdx((idx) => (idx - 1 + matches.length) % matches.length)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        onSelect(matches[activeIdx].type)
      }
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [matches, activeIdx, onSelect, onDismiss])

  if (matches.length === 0) return null

  return (
    <div
      className="fixed z-50 min-w-[14rem] rounded-md border border-border bg-popover shadow-lg"
      style={{ top: position.top, left: position.left }}
      role="listbox"
    >
      {matches.map((item, i) => {
        const Icon = item.icon
        return (
          <button
            key={item.command}
            type="button"
            role="option"
            aria-selected={activeIdx === i}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(item.type)
            }}
            onMouseEnter={() => setActiveIdx(i)}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-1.5 text-left",
              activeIdx === i ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-medium">{item.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground/70">/{item.command}</span>
              </div>
              <div className="truncate text-[11px] text-muted-foreground/80">{item.description}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
