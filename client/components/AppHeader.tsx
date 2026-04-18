"use client"

import Link from "next/link"
import { UserIcon, Inbox, Moon, Sun, Settings, Briefcase, LogOut } from "lucide-react"
import { useAuth } from "@/lib/AuthContext"
import { useTheme } from "@/lib/ThemeContext"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface AppHeaderProps {
  inviteCount?: number
}

export function AppHeader({ inviteCount = 0 }: AppHeaderProps) {
  const { isAuthenticated, logout, user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  return (
    <header className="border-b bg-background shrink-0">
      <div className="container mx-auto flex items-center justify-between py-3 px-4 sm:px-6 lg:px-8">

        {/* Left — logo + nav */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background font-serif font-bold text-lg select-none">
              I
            </div>
            <h1 className="text-xl font-bold">Inkwell</h1>
          </div>

        </div>

        {/* Right — actions + user */}
        <div className="flex items-center gap-1">
          {isAuthenticated ? (
            <>
              {/* Theme toggle */}
              <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8">
                {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </Button>

              {/* Inbox */}
              <Link href="/invites">
                <Button variant="ghost" size="icon" className="relative h-8 w-8">
                  <Inbox className="h-4 w-4" />
                  {inviteCount > 0 && (
                    <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-teal-500" />
                  )}
                </Button>
              </Link>

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full ml-1">
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
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="outline" size="sm">Log In</Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Sign Up</Button>
              </Link>
            </>
          )}
        </div>

      </div>
    </header>
  )
}
