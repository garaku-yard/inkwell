"use client"

/**
 * CloudProjectsButton — "From cloud" on the dashboard (desktop only).
 *
 * Lists the user's cloud projects and pulls a chosen one onto this device, which
 * writes its rows into the local store and enables sync for it. This is how a
 * project made in the browser or on another device reaches this machine — the
 * editor's sync toggle only covers projects that already live here. Renders
 * nothing without the `sync` capability; prompts for sign-in when unlinked.
 */

import { useState } from "react"
import Link from "next/link"
import { CloudDownload, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getStorage, type CloudProject } from "@/lib/storage"
import { isSyncAvailable, listCloudProjects, pullCloudProject } from "@/services/sync"

export function CloudProjectsButton({ onPulled }: { onPulled?: () => void }) {
  // capabilities is a stable Set bound at boot — safe to read at render.
  const supported = getStorage().capabilities.has("sync")
  const [open, setOpen] = useState(false)
  const [available, setAvailable] = useState(true)
  const [items, setItems] = useState<CloudProject[] | null>(null)
  const [pulling, setPulling] = useState<string | null>(null)

  if (!supported) return null

  const load = async () => {
    setItems(null)
    const ok = await isSyncAvailable()
    setAvailable(ok)
    if (!ok) {
      setItems([])
      return
    }
    try {
      setItems(await listCloudProjects())
    } catch {
      setItems([])
    }
  }

  const handlePull = async (id: string) => {
    setPulling(id)
    try {
      await pullCloudProject(id)
      setItems((prev) => prev?.map((p) => (p.id === id ? { ...p, onThisDevice: true } : p)) ?? null)
      onPulled?.()
    } finally {
      setPulling(null)
    }
  }

  const cloudOnly = items?.filter((p) => !p.onThisDevice) ?? []

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true)
          void load()
        }}
      >
        <CloudDownload className="h-4 w-4 mr-2" />
        From cloud
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cloud projects</DialogTitle>
            <DialogDescription>
              Pull a project from your account onto this device. It then syncs
              like any other project here.
            </DialogDescription>
          </DialogHeader>

          {!available ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Sign in to a cloud account to pull your projects onto this device.
              </p>
              <Button asChild size="sm" className="w-full">
                <Link href="/login?next=/dashboard">Sign in</Link>
              </Button>
            </div>
          ) : items === null ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : cloudOnly.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {items.length === 0
                ? "No projects in your cloud account yet."
                : "Everything in your cloud account is already on this device."}
            </p>
          ) : (
            <ScrollArea className="max-h-80 -mx-2 px-2">
              <ul className="space-y-1">
                {cloudOnly.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.title || "Untitled"}</p>
                      <Badge variant="secondary" className="mt-0.5 text-[10px] capitalize">
                        {p.category}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handlePull(p.id)}
                      disabled={pulling === p.id}
                    >
                      {pulling === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
