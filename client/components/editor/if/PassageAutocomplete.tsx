"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowRight, Plus } from "lucide-react"

import { cn } from "@/lib/utils"

interface PassageAutocompleteProps {
  /** All known passage names — case-insensitive match against the
   *  user's query. */
  passages: string[]
  /** Current text the user has typed inside `[[...`, after the
   *  opening brackets and before the caret. */
  query: string
  /** Top-left position of the dropdown in viewport coordinates.
   *  Caller computes this from the caret's bounding rect. */
  position: { top: number; left: number }
  /** Called when the user picks an existing passage by name. */
  onSelect: (name: string) => void
  /** Called when the user picks "Create <name>" — the editor handles
   *  the actual passage creation outside the autocomplete. */
  onCreate: (name: string) => void
  /** Called when the user presses Escape or otherwise dismisses
   *  without choosing. */
  onDismiss: () => void
}

/** Filter the passages by query, case-insensitive, prefix-first then
 *  contains. Cap the visible list so long vaults don't render
 *  hundreds of rows. */
function filterPassages(all: string[], query: string): string[] {
  if (!query.trim()) return all.slice(0, 8)
  const q = query.toLowerCase()
  const prefix = all.filter((p) => p.toLowerCase().startsWith(q))
  const contains = all.filter((p) => !p.toLowerCase().startsWith(q) && p.toLowerCase().includes(q))
  return [...prefix, ...contains].slice(0, 8)
}

/** Dropdown that lives next to the caret and lets the user pick an
 *  existing passage name or create a new one with the current query.
 *  Pure presentational — the editor owns the trigger / cursor / insert
 *  logic and feeds this component the current query plus the chosen
 *  callback. */
export function PassageAutocomplete({
  passages,
  query,
  position,
  onSelect,
  onCreate,
  onDismiss,
}: PassageAutocompleteProps) {
  const matches = filterPassages(passages, query)
  const showCreate =
    query.trim().length > 0 &&
    !passages.some((p) => p.toLowerCase() === query.trim().toLowerCase())

  const [activeIdx, setActiveIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Reset the highlighted item whenever the matched list changes
  // shape, otherwise pressing Enter after typing a new character
  // could fire the previous-active row.
  useEffect(() => {
    setActiveIdx(0)
  }, [query, matches.length, showCreate])

  // Capture keyboard events globally while mounted — the user is
  // typing in a contentEditable elsewhere on the page; the dropdown
  // doesn't naturally receive focus, so we hijack arrow / Enter /
  // Escape from the document level.
  useEffect(() => {
    const totalRows = matches.length + (showCreate ? 1 : 0)
    if (totalRows === 0) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onDismiss()
        return
      }
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIdx((idx) => (idx + 1) % totalRows)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIdx((idx) => (idx - 1 + totalRows) % totalRows)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        if (activeIdx < matches.length) {
          onSelect(matches[activeIdx])
        } else if (showCreate) {
          onCreate(query.trim())
        }
      }
    }

    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [matches, showCreate, query, activeIdx, onSelect, onCreate, onDismiss])

  const totalRows = matches.length + (showCreate ? 1 : 0)
  if (totalRows === 0) return null

  return (
    <div
      ref={containerRef}
      className="fixed z-50 min-w-[12rem] max-w-[20rem] rounded-md border border-border bg-popover shadow-lg"
      style={{ top: position.top, left: position.left }}
      role="listbox"
    >
      {matches.map((name, i) => (
        <button
          key={name}
          type="button"
          role="option"
          aria-selected={activeIdx === i}
          onMouseDown={(e) => {
            // Mousedown rather than click — the contentEditable would
            // lose its caret on click, breaking the insert.
            e.preventDefault()
            onSelect(name)
          }}
          onMouseEnter={() => setActiveIdx(i)}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
            activeIdx === i ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
          )}
        >
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{name}</span>
        </button>
      ))}
      {showCreate && (
        <button
          type="button"
          role="option"
          aria-selected={activeIdx === matches.length}
          onMouseDown={(e) => {
            e.preventDefault()
            onCreate(query.trim())
          }}
          onMouseEnter={() => setActiveIdx(matches.length)}
          className={cn(
            "flex w-full items-center gap-2 border-t border-border px-3 py-1.5 text-left text-xs",
            activeIdx === matches.length
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50",
          )}
        >
          <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span>
            Create <span className="font-medium">{query.trim()}</span>
          </span>
        </button>
      )}
    </div>
  )
}
