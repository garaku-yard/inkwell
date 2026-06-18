"use client"

/**
 * NotificationBell — the in-app notification inbox in the app header.
 *
 * Renders only on builds that support server-side notifications (the
 * `notifications` capability); the desktop build has no feed, so this returns
 * null and the header just shows the existing invites inbox. Unread count is
 * polled lightly; the full feed loads when the dropdown opens.
 */

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getStorage, type Notification } from "@/lib/storage"
import { cn } from "@/lib/utils"

const POLL_MS = 60_000

export function NotificationBell() {
  // capabilities is a stable Set bound at boot, safe to read at render.
  const supported = getStorage().capabilities.has("notifications")
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const refreshCount = useCallback(() => {
    getStorage()
      .notifications.unreadCount()
      .then(setUnread)
      .catch(() => {})
  }, [])

  // Poll the unread count while mounted so the badge stays roughly current.
  useEffect(() => {
    if (!supported) return
    refreshCount()
    const t = setInterval(refreshCount, POLL_MS)
    return () => clearInterval(t)
  }, [supported, refreshCount])

  // Load the feed each time the dropdown opens.
  useEffect(() => {
    if (!open) return
    getStorage()
      .notifications.listNotifications({ limit: 20 })
      .then((feed) => {
        setItems(feed.notifications)
        setUnread(feed.unreadCount)
      })
      .catch(() => {})
  }, [open])

  if (!supported) return null

  const handleItemClick = async (n: Notification) => {
    setOpen(false)
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
      setUnread((c) => Math.max(0, c - 1))
      try {
        await getStorage().notifications.markRead(n.id)
      } catch {
        /* badge will self-correct on next poll */
      }
    }
    if (n.link) router.push(n.link)
  }

  const handleMarkAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })))
    setUnread(0)
    try {
      await getStorage().notifications.markAllRead()
    } catch {
      /* badge will self-correct on next poll */
    }
  }

  const hasUnread = items.some((n) => !n.read)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8"
          aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground"
              aria-hidden="true"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {hasUnread && (
            <button
              type="button"
              onClick={handleMarkAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No notifications yet
            </p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleItemClick(n)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50",
                  !n.read && "bg-muted/30",
                )}
              >
                <div className="flex w-full items-center gap-2">
                  {!n.read && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  )}
                  <span className="text-sm font-medium">{n.title}</span>
                </div>
                <span className="text-xs text-muted-foreground">{n.body}</span>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
