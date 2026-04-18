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
      <div className="container mx-auto flex items-center justify-between py-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background font-serif font-bold text-lg select-none">
            I
          </div>
          <h1 className="text-xl font-bold">Inkwell</h1>
        </div>
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <UserIcon className="h-5 w-5" />
                  {inviteCount > 0 && (
                    <span className="absolute top-0 right-0 block h-2.5 w-2.5 rounded-full bg-teal-500 ring-2 ring-white" />
                  )}
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
                <Link href="/invites" passHref>
                  <DropdownMenuItem>
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center">
                        <Inbox className="mr-2 h-4 w-4" />
                        <span>Inbox</span>
                      </div>
                      {inviteCount > 0 && (
                        <Badge className="h-5 bg-teal-100 text-teal-800 dark:bg-teal-800 dark:text-teal-100">
                          {inviteCount}
                        </Badge>
                      )}
                    </div>
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuItem onClick={toggleTheme}>
                  {theme === "light" ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
                  <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
                </DropdownMenuItem>
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
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
