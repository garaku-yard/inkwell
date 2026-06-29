"use client"

/**
 * PresencePips — a tiny inline cluster of per-user colour dots marking that one
 * or more collaborators are editing a particular thing (a passage in the sidebar
 * list, say). It's the compact, list-friendly counterpart to the header's
 * PresenceBar avatars and acts as a soft lock: you can see a passage is occupied
 * before you open it. Renders nothing when no one is there.
 */

import { cn } from "@/lib/utils"
import { hueFor } from "@/lib/realtime/presence-ui"
import type { Peer } from "@/lib/realtime/protocol"

/** How many dots before collapsing to "+N". */
const MAX_PIPS = 3

export function PresencePips({ peers, className }: { peers: Peer[]; className?: string }) {
  if (peers.length === 0) return null

  const shown = peers.slice(0, MAX_PIPS)
  const overflow = peers.length - shown.length
  const names = peers.map((p) => p.name).join(", ")

  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      title={`${names} ${peers.length === 1 ? "is" : "are"} editing`}
      aria-label={`${names} ${peers.length === 1 ? "is" : "are"} editing`}
    >
      {shown.map((p) => (
        <span
          key={p.userId}
          className="size-2 rounded-full ring-1 ring-background"
          style={{ backgroundColor: `hsl(${hueFor(p.userId)} 60% 50%)` }}
        />
      ))}
      {overflow > 0 && <span className="text-[10px] text-muted-foreground">+{overflow}</span>}
    </span>
  )
}
