"use client"

/**
 * SaveStatusPill — a small floating status pill in the bottom-right corner that
 * reports the editor's autosave state (à la the Next.js dev indicator), keeping
 * the save status out of the header chrome. Shared by every editor via
 * {@link EditorHeader}.
 *
 * Palette follows the BRANDBOOK: "saving" / "saved" are transient and read as
 * muted; "unsaved" is failure-adjacent and earns the destructive token so the
 * writer notices it.
 */

import { Check, Cloud, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import type { SaveStatus } from "./useElementAutosave"

const COPY: Record<SaveStatus, string> = {
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Unsaved",
}

export function SaveStatusPill({ status, avoidRightPanel = false }: { status: SaveStatus; avoidRightPanel?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "fixed bottom-4 z-50 flex items-center gap-1.5 rounded-full border bg-card/90 px-3 py-1.5 text-xs shadow-sm backdrop-blur",
        "transition-[right] duration-300 ease-out",
        avoidRightPanel ? "right-[436px]" : "right-4",
        "pointer-events-none select-none",
        status === "unsaved" ? "border-destructive/40 text-destructive" : "text-muted-foreground",
      )}
    >
      {status === "saving" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : status === "unsaved" ? (
        <Cloud className="h-3 w-3" />
      ) : (
        <Check className="h-3 w-3" />
      )}
      <span>{COPY[status]}</span>
    </div>
  )
}
