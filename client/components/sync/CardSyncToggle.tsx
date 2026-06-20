"use client"

/**
 * CardSyncToggle — a compact one-click sync toggle for the dashboard project
 * card. The icon shows status; clicking flips sync on/off for the project.
 * Hidden unless this is the desktop build with a linked account, so cards stay
 * uncluttered on web / when signed out. The fuller controls (Sync now,
 * last-synced) live in the editor header's SyncControl.
 */

import { Cloud, CloudOff, Loader2, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useProjectSync } from "./useProjectSync"

export function CardSyncToggle({ projectId }: { projectId: string }) {
  const { supported, available, state, busy, toggle } = useProjectSync(projectId)
  if (!supported || !available) return null

  const enabled = state?.enabled ?? false
  const status = state?.status ?? "idle"

  const icon =
    !enabled ? <CloudOff className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
      : status === "syncing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : status === "error" ? <TriangleAlert className="h-3.5 w-3.5 text-destructive" />
          : <Cloud className="h-3.5 w-3.5 text-foreground" />

  const label = enabled
    ? status === "error" ? "Sync error — click to stop syncing" : "Syncing — click to stop"
    : "Sync this project to the cloud"

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation()
        void toggle(!enabled)
      }}
      title={label}
      aria-label={label}
      aria-pressed={enabled}
    >
      {icon}
    </Button>
  )
}
