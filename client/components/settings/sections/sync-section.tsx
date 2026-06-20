"use client"

/**
 * Settings → Sync (desktop only). An overview of cloud sync: link status, the
 * projects currently syncing with their last-synced time, "Sync all now", and
 * the "From cloud" pull. Per-project opt-in still lives on each project (editor
 * header / dashboard card); this is the at-a-glance hub.
 */

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { CloudOff, Loader2, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CloudProjectsButton } from "@/components/sync/CloudProjectsButton"
import { getStorage } from "@/lib/storage"
import { isSyncAvailable, listSyncedProjects, syncAllProjects } from "@/services/sync"

interface Row {
  id: string
  title: string
  status: string
  lastSyncedAt: string | null
  error?: string
}

function ago(iso: string | null): string {
  if (!iso) return "never"
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function SyncSection() {
  const supported = getStorage().capabilities.has("sync")
  const [available, setAvailable] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(async () => {
    if (!supported) {
      setLoading(false)
      return
    }
    setAvailable(await isSyncAvailable())
    const [states, owned] = await Promise.all([
      listSyncedProjects(),
      getStorage().projects.listOwned(""),
    ])
    const titles = new Map(owned.projects.map((p) => [p.id, p.title]))
    setRows(
      states.map((s) => ({
        id: s.projectId,
        title: titles.get(s.projectId) || "Untitled",
        status: s.status,
        lastSyncedAt: s.lastSyncedAt,
        error: s.error,
      })),
    )
    setLoading(false)
  }, [supported])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const syncAll = async () => {
    setSyncing(true)
    try {
      await syncAllProjects()
      await refresh()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cloud sync</CardTitle>
          <CardDescription>
            Projects you’ve opted into sync round-trip between this device and
            your cloud account. Everything stays on this device too.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!available ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Sign in to a cloud account to sync your projects across devices.
              </p>
              <Button asChild size="sm">
                <Link href="/login?next=/settings">Sign in</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={syncAll} disabled={syncing || rows.length === 0}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                  Sync all now
                </Button>
                <CloudProjectsButton onPulled={refresh} />
              </div>

              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : rows.length === 0 ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <CloudOff className="h-4 w-4" />
                  No projects are syncing yet. Turn sync on from a project, or pull
                  one with “From cloud”.
                </div>
              ) : (
                <ul className="divide-y rounded-md border">
                  {rows.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="truncate text-sm font-medium">{r.title}</span>
                      <Badge
                        variant={r.status === "error" ? "destructive" : "secondary"}
                        className="shrink-0 text-[10px]"
                      >
                        {r.status === "error"
                          ? r.error || "error"
                          : r.status === "syncing"
                            ? "syncing…"
                            : r.status === "offline"
                              ? "offline"
                              : `synced ${ago(r.lastSyncedAt)}`}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
