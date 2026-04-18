"use client"

import { useState } from "react"
import { Loader2, Smartphone, Shield } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { changePassword } from "@/services/settings"

export function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const { toast } = useToast()

  const getPasswordStrength = (password: string) => {
    if (password.length === 0) return { strength: 0, label: "", color: "" }
    if (password.length < 6) return { strength: 25, label: "Weak", color: "bg-red-500" }
    if (password.length < 10) return { strength: 50, label: "Fair", color: "bg-orange-500" }
    if (password.length < 12 || !/[A-Z]/.test(password) || !/[0-9]/.test(password))
      return { strength: 75, label: "Good", color: "bg-yellow-500" }
    return { strength: 100, label: "Strong", color: "bg-green-500" }
  }

  const passwordStrength = getPasswordStrength(newPassword)

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" })
      return
    }
    if (passwordStrength.strength < 50) {
      toast({ title: "Password too weak", description: "Please choose a stronger password.", variant: "destructive" })
      return
    }
    setIsChangingPassword(true)
    try {
      await changePassword(currentPassword, newPassword)
      toast({ title: "Password changed", description: "Your password has been successfully updated." })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch {
      toast({ title: "Failed to change password", description: "Current password may be incorrect.", variant: "destructive" })
    } finally {
      setIsChangingPassword(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Change your password regularly to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            {newPassword && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${passwordStrength.color} transition-all`}
                      style={{ width: `${passwordStrength.strength}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium">{passwordStrength.label}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Use at least 12 characters with uppercase, lowercase, numbers, and symbols
                </p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <div className="flex justify-end items-center pt-2">
            <Button
              onClick={handleChangePassword}
              disabled={!currentPassword || !newPassword || !confirmPassword || isChangingPassword}
            >
              {isChangingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Change Password
            </Button>
          </div>
        </CardContent>
      </Card>

      {/*
        Two-factor authentication and active-session management are intentionally
        non-functional: the identity service doesn't yet expose the endpoints
        they'd need (TOTP enrolment, session inventory, device revocation). We
        surface them as "Coming soon" rather than hide them so users know the
        roadmap, but the controls are disabled to avoid the previous mock
        experience where toggles pretended to succeed.
      */}
      <Card className="opacity-75">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
                <Smartphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle>Two-Factor Authentication</CardTitle>
                <CardDescription>
                  Add an extra layer of security to your account
                </CardDescription>
              </div>
            </div>
            <Badge variant="secondary">Coming soon</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Authenticator-app support (TOTP) and recovery codes are on the roadmap.
            Password changes are already protected by your current password.
          </p>
        </CardContent>
      </Card>

      <Card className="opacity-75">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-2">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Active Sessions</CardTitle>
                <CardDescription>
                  View and manage where you&apos;re signed in
                </CardDescription>
              </div>
            </div>
            <Badge variant="secondary">Coming soon</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Per-device session inventory and remote sign-out will land once the
            identity service tracks device fingerprints. To sign out the current
            device, use the avatar menu in the top-right.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
