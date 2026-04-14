"use client"

import { useState } from "react"
import { Shield, Smartphone, Key, LogOut, Trash2, Loader2, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { changePassword } from "@/services/settings"

interface Session {
  id: string
  device: string
  location: string
  lastActive: string
  current: boolean
}

export function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([
    { id: "1", device: "Chrome on Windows", location: "New York, US", lastActive: "Active now", current: true },
    { id: "2", device: "Safari on iPhone", location: "New York, US", lastActive: "2 hours ago", current: false },
    { id: "3", device: "Firefox on macOS", location: "London, UK", lastActive: "3 days ago", current: false },
  ])
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
    } catch (error) {
      toast({ title: "Failed to change password", description: "Current password may be incorrect.", variant: "destructive" })
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleLogoutAllDevices = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      toast({ title: "Logged out", description: "All other devices have been logged out." })
    } catch (error) {
      toast({ title: "Failed to logout devices", variant: "destructive" })
    }
  }

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await new Promise(resolve => setTimeout(resolve, 500))
      setSessions(sessions.filter(s => s.id !== sessionId))
      toast({ title: "Session revoked", description: "Device has been logged out." })
    } catch (error) {
      toast({ title: "Failed to revoke session", variant: "destructive" })
    }
  }

  const handleToggle2FA = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      setTwoFactorEnabled(!twoFactorEnabled)
      toast({ 
        title: twoFactorEnabled ? "2FA disabled" : "2FA enabled",
        description: twoFactorEnabled 
          ? "Two-factor authentication has been disabled." 
          : "Two-factor authentication has been enabled."
      })
    } catch (error) {
      toast({ title: "Failed to update 2FA", variant: "destructive" })
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
          <div className="flex justify-between items-center pt-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Last changed: Never
            </p>
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Two-Factor Authentication</CardTitle>
              <CardDescription>
                Add an extra layer of security to your account
              </CardDescription>
            </div>
            {twoFactorEnabled && (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Enabled
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
              <Smartphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium mb-1">Authenticator App</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Use an authenticator app to generate one-time codes
              </p>
              {twoFactorEnabled && (
                <Button variant="outline" size="sm" className="mt-2">
                  <Key className="h-4 w-4 mr-2" />
                  View Recovery Codes
                </Button>
              )}
            </div>
            <Button 
              variant={twoFactorEnabled ? "destructive" : "default"}
              onClick={handleToggle2FA}
            >
              {twoFactorEnabled ? "Disable" : "Enable"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>
            Manage devices and locations where you're currently signed in
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-start justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-800">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-2">
                  <Shield className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm">{session.device}</h4>
                    {session.current && (
                      <Badge variant="secondary" className="text-xs">Current</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{session.location}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{session.lastActive}</p>
                </div>
              </div>
              {!session.current && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => handleRevokeSession(session.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
            <Button variant="outline" onClick={handleLogoutAllDevices} className="w-full">
              <LogOut className="h-4 w-4 mr-2" />
              Log Out All Other Devices
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
