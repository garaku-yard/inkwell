"use client"

/**
 * Right-cluster of AppHeader, extracted so editor surfaces can mount
 * it inside their own toolbars and keep theme toggle / invites inbox
 * / user menu (settings, admin, log out) reachable while writing.
 *
 * The dashboard's AppHeader still wraps this in its own logo/banner
 * row; everywhere else just renders the cluster directly.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { UserIcon, Inbox, Moon, Sun, Settings, Briefcase, LogOut, LogIn } from "lucide-react"

import { useAuth } from "@/lib/AuthContext"
import { useTheme } from "@/lib/ThemeContext"
import { getPendingInvites } from "@/services/invites"
import { listIncomingOrgInvites } from "@/services/organization"
import { NotificationBell } from "@/components/notifications/NotificationBell"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface AppHeaderActionsProps {
  /** Optional badge count — drives the unread-indicator dot on the
   *  invites inbox button. Defaults to zero (no dot). */
  inviteCount?: number
}

export function AppHeaderActions({ inviteCount = 0 }: AppHeaderActionsProps) {
  const { isAuthenticated, isCloudLinked, logout, user } = useAuth()
  const { theme, toggleTheme } = useTheme()

  // Self-fetch the pending invitation count (project + org invites) so the
  // inbox badge shows on every surface, not just the dashboard. The prop seeds
  // the initial value to avoid a flash. Both calls degrade to [] on the desktop
  // build or a service hiccup.
  const [pendingCount, setPendingCount] = useState(inviteCount)
  useEffect(() => {
    if (!isAuthenticated) {
      setPendingCount(0)
      return
    }
    let cancelled = false
    const refresh = async () => {
      const [projectInvites, orgInvites] = await Promise.all([
        getPendingInvites().catch(() => []),
        listIncomingOrgInvites().catch(() => []),
      ])
      if (!cancelled) setPendingCount(projectInvites.length + orgInvites.length)
    }
    void refresh()
    // An invite arrives out-of-band (someone else invites you), so there's no
    // local signal to react to. Refresh when the window regains focus — so it
    // appears the moment you switch back to Inkwell — and poll as a backstop.
    const interval = setInterval(() => void refresh(), 45_000)
    const onFocus = () => void refresh()
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-1">
        <Link href="/login">
          <Button variant="outline" size="sm">Log In</Button>
        </Link>
        <Link href="/register">
          <Button size="sm">Sign Up</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="h-8 w-8"
      >
        {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </Button>

      {/* In-app notification inbox (hosted builds only; null otherwise) */}
      <NotificationBell />

      {/* Invites inbox */}
      <Link href="/invites" aria-label={pendingCount > 0 ? `Invitations (${pendingCount} pending)` : "Invitations"}>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Inbox className="h-4 w-4" />
          {pendingCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-500 px-1 text-[10px] font-semibold leading-none text-white">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </Button>
      </Link>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="User menu" className="h-8 w-8 rounded-full ml-1">
            <UserIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            {isCloudLinked ? (
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {user?.username && user?.tag ? `${user.username}#${user.tag}` : user?.username || "User"}
                </p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
            ) : (
              // Local-first desktop, not linked: don't present the offline local
              // profile as a cloud account — say so plainly and offer sign-in.
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">Not signed in</p>
                <p className="text-xs leading-none text-muted-foreground">
                  Your work is saved on this device
                </p>
              </div>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings" className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </Link>
          </DropdownMenuItem>
          {isCloudLinked && user?.role === "admin" && (
            <DropdownMenuItem asChild>
              <Link href="/admin/billing" className="cursor-pointer">
                <Briefcase className="mr-2 h-4 w-4" />
                <span>Admin Billing</span>
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {isCloudLinked ? (
            <DropdownMenuItem onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <Link href="/login" className="cursor-pointer">
                <LogIn className="mr-2 h-4 w-4" />
                <span>Sign in</span>
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
