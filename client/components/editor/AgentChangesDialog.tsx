"use client"

import { useCallback, useEffect, useState } from "react"

import { Bot, RotateCcw, Terminal } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { announceDataChanged } from "@/lib/live-refresh"
import type { UndoEntry } from "@/lib/storage/local/tools"

/**
 * "Recent AI changes" — the recovery half of ADR 0027.
 *
 * Confirmation only covers the calls the writer refuses. This covers the ones
 * they approved and regretted, which is the failure that actually costs words:
 * the model asked to rewrite a scene, the writer said yes, and what came back
 * was not what they wanted. The rows are still on disk either way — this is
 * what makes them reachable.
 */
export function AgentChangesDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [entries, setEntries] = useState<UndoEntry[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { listUndo } = await import("@/lib/storage/local/tools")
      setEntries(await listUndo(projectId))
    } catch {
      // No journal table (web build, or a database that predates 0016) — an
      // empty list is the honest answer, and the dialog says so.
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const undo = async (id: string) => {
    setBusy(id)
    try {
      const { undoEntry } = await import("@/lib/storage/local/tools")
      if (await undoEntry(id)) {
        // The restore went straight to SQLite, so the open editor is showing
        // rows that no longer match disk until it is told.
        announceDataChanged({ projectId, source: "undo_agent_change" })
      }
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Recent AI changes</DialogTitle>
          <DialogDescription>
            Changes that removed or replaced writing in this project. Undo puts
            the previous version back.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing yet. Deletions and rewrites made by the assistant or a
            connected agent show up here.
          </p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-md border bg-card px-3 py-2"
              >
                {entry.source === "mcp" ? (
                  <Terminal className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{entry.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                    {entry.source === "mcp" ? " · connected agent" : " · chat"}
                  </p>
                </div>
                {entry.undoneAt ? (
                  <span className="shrink-0 text-xs text-muted-foreground">Undone</span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1"
                    disabled={busy === entry.id}
                    onClick={() => void undo(entry.id)}
                  >
                    <RotateCcw className="h-3 w-3" />
                    {busy === entry.id ? "Undoing…" : "Undo"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
