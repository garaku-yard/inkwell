"use client"

import { useEffect, useState } from "react"

import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

import type { ApprovalRequest } from "@/lib/storage/local/tools"

/**
 * The gate in front of every destructive tool call (ADR 0027).
 *
 * Mounted once for the window, not per surface, because both consumers ask
 * through the same broker: the in-app chat, whose panel may not even be open by
 * the time the model gets to the call, and the MCP bridge, which has no surface
 * of its own at all. A dialog owned by the chat panel would answer for neither.
 *
 * Deliberately modal. This is the one moment where the writer's words are about
 * to go, and a toast that can be missed is not a gate.
 */
export function AgentApproval() {
  const [queue, setQueue] = useState<ApprovalRequest[]>([])
  const [remember, setRemember] = useState(false)

  useEffect(() => {
    let dispose: (() => void) | undefined
    let cancelled = false

    void (async () => {
      // Dynamic, like the bridge: the broker lives under storage/local, which
      // reaches SQLite through a Tauri-only plugin. Nothing here is meaningful
      // in the web build, where no tool loop runs.
      const { subscribeApprovals } = await import("@/lib/storage/local/tools")
      const unsubscribe = subscribeApprovals(setQueue)
      if (cancelled) {
        unsubscribe()
        return
      }
      dispose = unsubscribe
    })()

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [])

  // One at a time, oldest first. A model can emit several calls in one turn, and
  // stacking dialogs would invite answering the wrong one.
  const current = queue[0]

  // Each request is a separate decision — carrying the tick over from the last
  // one would grant a standing allowance the writer never ticked for this tool.
  useEffect(() => {
    setRemember(false)
  }, [current?.id])

  const answer = async (allow: boolean) => {
    if (!current) return
    const { resolveApproval } = await import("@/lib/storage/local/tools")
    resolveApproval(current.id, allow, allow && remember)
  }

  if (!current) return null

  const who =
    current.source === "mcp" ? "A connected agent" : "The assistant in this project"

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        // Dismissing is declining. There is no neutral close for a question the
        // tool loop is blocked on — leaving it unanswered would hang the call
        // until it expires.
        if (!next) void answer(false)
      }}
    >
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Approve this change?
          </DialogTitle>
          <DialogDescription>
            {who} wants to make a change that removes writing.
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {current.detail || current.label}
        </p>
        <p className="text-xs text-muted-foreground">
          You can reverse this afterwards from Recent AI changes.
        </p>

        <div className="flex items-center gap-2">
          <Checkbox
            id="agent-approval-remember"
            checked={remember}
            onCheckedChange={(checked) => setRemember(checked === true)}
          />
          <Label
            htmlFor="agent-approval-remember"
            className="text-xs font-normal text-muted-foreground"
          >
            Don&apos;t ask again for {current.tool} in this project
          </Label>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => void answer(false)}>
            Don&apos;t allow
          </Button>
          <Button variant="destructive" size="sm" onClick={() => void answer(true)}>
            Allow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
