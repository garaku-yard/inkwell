"use client"

/**
 * PresenceBar — the row of overlapping avatars in the project header showing who
 * else is editing right now. Each avatar wears a per-user colour ring and, when
 * that person has an element focused, a live dot; the tooltip reads
 * "Name — editing <label>". Renders nothing when the room is empty (or on the
 * desktop build, where there is no presence).
 */

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getApiBaseUrl } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { Peer } from "@/lib/realtime/protocol"

/** How many avatars to show before collapsing the rest into a "+N" chip. */
const MAX_AVATARS = 4

/** Resolves a possibly-relative avatar path against the gateway origin. */
function avatarSrc(url?: string): string | undefined {
  if (!url) return undefined
  return /^https?:\/\//.test(url) ? url : `${getApiBaseUrl()}${url}`
}

/** Up-to-two-letter initials from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** A stable hue (0–359) derived from the user id, so a person's colour is consistent. */
function hueFor(userId: string): number {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 360
}

interface PresenceBarProps {
  peers: Peer[]
  className?: string
}

export function PresenceBar({ peers, className }: PresenceBarProps) {
  if (peers.length === 0) return null

  const shown = peers.slice(0, MAX_AVATARS)
  const overflow = peers.length - shown.length

  return (
    <div
      className={cn("flex items-center", className)}
      role="group"
      aria-label={`${peers.length} ${peers.length === 1 ? "person" : "people"} editing`}
    >
      {shown.map((peer) => {
        const hue = hueFor(peer.userId)
        const editing = Boolean(peer.elementId)
        const title = editing && peer.label ? `${peer.name} — editing ${peer.label}` : peer.name
        return (
          <div key={peer.connId} className="relative -ml-2 first:ml-0" title={title}>
            <Avatar
              className="size-7 border-2 border-background ring-2"
              style={{ ["--tw-ring-color" as string]: `hsl(${hue} 65% 55%)` }}
            >
              {avatarSrc(peer.avatarUrl) && (
                <AvatarImage src={avatarSrc(peer.avatarUrl)} alt={peer.name} />
              )}
              <AvatarFallback
                className="text-xs font-medium text-white"
                style={{ backgroundColor: `hsl(${hue} 55% 45%)` }}
              >
                {initials(peer.name)}
              </AvatarFallback>
            </Avatar>
            {editing && (
              <span
                className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-emerald-500"
                aria-hidden
              />
            )}
          </div>
        )
      })}
      {overflow > 0 && (
        <div className="-ml-2 flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground">
          +{overflow}
        </div>
      )}
    </div>
  )
}
