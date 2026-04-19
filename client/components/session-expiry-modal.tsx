"use client"

import React, { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertTriangle, Clock, Loader2 } from "lucide-react"
import { loginUser } from "@/services/auth"
import type { AuthUser } from "@/lib/AuthContext"

interface SessionExpiryModalProps {
  isOpen: boolean
  type: "warning" | "expired"
  userEmail?: string
  onExtendSession?: () => void
  /** Called with the authenticated user after a successful in-modal re-login. */
  onLogin?: (user: AuthUser) => void
  onLogout: () => void
  timeRemaining?: number // in seconds
}

export function SessionExpiryModal({
  isOpen,
  type,
  userEmail,
  onExtendSession,
  onLogin,
  onLogout,
  timeRemaining,
}: SessionExpiryModalProps) {
  const [email, setEmail] = useState(userEmail || "")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const response = await loginUser({ email, password })
      onLogin?.({
        id: response.user.id,
        email: response.user.email,
        username: response.user.username,
        tag: response.user.usernameTag,
        role: response.user.role ?? "user",
        name: response.user.name ?? "",
        lastName: response.user.lastName ?? "",
      })
      setPassword("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  if (type === "warning") {
    return (
      <Dialog open={isOpen}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              Session Expiring Soon
            </DialogTitle>
            <DialogDescription>
              Your session will expire in{" "}
              <span className="font-semibold text-foreground">
                {timeRemaining ? formatTime(timeRemaining) : "a few minutes"}
              </span>
              . Would you like to stay logged in?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={onLogout}>
              Log Out
            </Button>
            <Button onClick={onExtendSession}>
              Stay Logged In
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Session Expired
          </DialogTitle>
          <DialogDescription>
            Your session has expired. Please log in again to continue.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={onLogout}>
              Go to Login Page
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Log In
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
