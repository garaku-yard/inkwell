"use client"

/**
 * Right-cluster of AppHeader, extracted so editor surfaces can mount
 * it inside their own toolbars and keep theme toggle / invites inbox
 * / user menu (settings, admin, log out) reachable while writing.
 *
 * The dashboard's AppHeader still wraps this in its own logo/banner
 * row; everywhere else just renders the cluster directly.
 */

import Link from "next/link"
import { UserIcon, Inbox, Moon, Sun, Settings, Briefcase, LogOut } from "lucide-react"

import { useAuth } from "@/lib/AuthContext"
import { useTheme } from "@/lib/ThemeContext"
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
  const { isAuthenticated, logout, user } = useAuth()
  const { theme, toggleTheme } = useTheme()

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
      <Link href="/invites" aria-label="Invitations">
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Inbox className="h-4 w-4" />
          {inviteCount > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-teal-500" aria-hidden="true" />
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
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {user?.username && user?.tag ? `${user.username}#${user.tag}` : user?.username || "User"}
              </p>
              <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings" className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </Link>
          </DropdownMenuItem>
          {user?.role === "admin" && (
            <DropdownMenuItem asChild>
              <Link href="/admin/billing" className="cursor-pointer">
                <Briefcase className="mr-2 h-4 w-4" />
                <span>Admin Billing</span>
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
