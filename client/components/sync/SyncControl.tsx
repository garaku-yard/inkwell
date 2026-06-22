"use client"

/**
 * SyncControl — the per-project cloud-sync affordance in the editor header.
 *
 * Renders only on builds with the `sync` capability (desktop). The icon
 * reflects status at a glance; the dropdown carries the opt-in toggle, a manual
 * "Sync now", and the last-synced time. When no cloud account is linked it
 * points the user at sign-in instead.
 */

import Link from "next/link"
import { Cloud, CloudOff, Loader2, RefreshCw, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useProjectSync } from "./useProjectSync"

/** Compact relative-time label (e.g. "3m ago"). */
function ago(iso: string | null): string {
  if (!iso) return "never"
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function SyncControl({ projectId }: { projectId?: string }) {
  const { supported, available, state, busy, toggle, syncNow } = useProjectSync(projectId)
  if (!supported) return null

  const enabled = state?.enabled ?? false
  const status = state?.status ?? "idle"

  const icon =
    !enabled ? <CloudOff className="h-4 w-4 text-muted-foreground" />
      : status === "syncing" ? <Loader2 className="h-4 w-4 animate-spin" />
        : status === "error" ? <TriangleAlert className="h-4 w-4 text-destructive" />
          : status === "offline" ? <CloudOff className="h-4 w-4 text-muted-foreground" />
            : <Cloud className="h-4 w-4 text-foreground" />

  const statusText =
    !available ? "Not signed in"
      : !enabled ? "Not syncing"
        : status === "error" ? state?.error || "Sync failed"
          : status === "syncing" ? "Syncing…"
            : status === "offline" ? "Offline"
              : state?.lastSyncedAt ? `Synced ${ago(state.lastSyncedAt)}`
                : "Not synced yet"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Cloud sync — ${statusText}`}
          title={`Cloud sync — ${statusText}`}
        >
          {icon}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-3">
        {!available ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Sign in to sync</p>
            <p className="text-xs text-muted-foreground">
              Link a cloud account to sync this project across your devices. Your
              work stays on this device until you do.
            </p>
            <Button asChild size="sm" className="w-full">
              <Link href="/login?next=/settings">Sign in</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Sync this project</p>
                <p className={cn("text-xs", status === "error" ? "text-destructive" : "text-muted-foreground")}>
                  {statusText}
                </p>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={(c) => void toggle(c)}
                disabled={busy}
                aria-label="Sync this project"
              />
            </div>
            {enabled && state?.notice && status !== "error" && (
              <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-px" />
                <span>{state.notice}</span>
              </p>
            )}
            {enabled && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => void syncNow()}
                disabled={busy || status === "syncing"}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", status === "syncing" && "animate-spin")} />
                Sync now
              </Button>
            )}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
