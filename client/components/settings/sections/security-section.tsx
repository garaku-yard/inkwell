"use client"

import { useEffect, useState } from "react"
import { Loader2, Smartphone, Shield, Monitor } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { changePassword } from "@/services/settings"
import {
  listSessions,
  revokeSession,
  enrollTwoFactor,
  confirmTwoFactor,
  disableTwoFactor,
  type Session,
  type TwoFactorEnrollment,
} from "@/services/auth"
import { useAuth } from "@/lib/AuthContext"

/** Derive a friendly "Browser on OS" label from a raw user-agent string. */
function deviceLabel(ua: string): string {
  if (!ua) return "Unknown device"
  const browser = /Firefox/.test(ua)
    ? "Firefox"
    : /Edg\//.test(ua)
      ? "Edge"
      : /Chrome/.test(ua)
        ? "Chrome"
        : /Safari/.test(ua)
          ? "Safari"
          : "Browser"
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : ""
  return os ? `${browser} on ${os}` : browser
}

/** Compact relative-time label (e.g. "3h ago") for a last-used timestamp. */
function formatRelative(iso: string): string {
  if (!iso) return "unknown"
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return "unknown"
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const { toast } = useToast()

  // Active sessions. null = loading; [] = none/desktop; error flag for failures.
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [sessionsError, setSessionsError] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    listSessions()
      .then((s) => active && setSessions(s))
      .catch(() => active && setSessionsError(true))
    return () => {
      active = false
    }
  }, [])

  const handleRevokeSession = async (id: string) => {
    setRevokingId(id)
    try {
      await revokeSession(id)
      setSessions((prev) => (prev ? prev.filter((s) => s.id !== id) : prev))
      toast({ title: "Signed out", description: "That device's session was revoked." })
    } catch {
      toast({ title: "Failed to revoke session", variant: "destructive" })
    } finally {
      setRevokingId(null)
    }
  }

  // ── Two-factor (TOTP) ──
  const { user, updateUser } = useAuth()
  const twoFactorEnabled = !!user?.twoFactorEnabled
  const [twoFAMode, setTwoFAMode] = useState<"idle" | "enrolling" | "recovery" | "disabling">("idle")
  const [enrollment, setEnrollment] = useState<TwoFactorEnrollment | null>(null)
  const [twoFACode, setTwoFACode] = useState("")
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [twoFABusy, setTwoFABusy] = useState(false)

  const cancelTwoFA = () => {
    setTwoFAMode("idle")
    setEnrollment(null)
    setTwoFACode("")
    setRecoveryCodes([])
  }

  const handleStartEnroll = async () => {
    setTwoFABusy(true)
    try {
      const e = await enrollTwoFactor()
      setEnrollment(e)
      setTwoFACode("")
      setTwoFAMode("enrolling")
    } catch (err) {
      toast({
        title: "Couldn't start 2FA setup",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setTwoFABusy(false)
    }
  }

  const handleVerifyEnroll = async () => {
    setTwoFABusy(true)
    try {
      const codes = await confirmTwoFactor(twoFACode.trim())
      setRecoveryCodes(codes)
      setEnrollment(null)
      setTwoFACode("")
      setTwoFAMode("recovery")
      updateUser({ twoFactorEnabled: true })
      toast({ title: "Two-factor enabled", description: "Save your recovery codes." })
    } catch {
      toast({ title: "Invalid code", description: "Check your authenticator app and try again.", variant: "destructive" })
    } finally {
      setTwoFABusy(false)
    }
  }

  const handleDisable = async () => {
    setTwoFABusy(true)
    try {
      await disableTwoFactor(twoFACode.trim())
      updateUser({ twoFactorEnabled: false })
      setTwoFACode("")
      setTwoFAMode("idle")
      toast({ title: "Two-factor disabled" })
    } catch {
      toast({ title: "Invalid code", description: "Enter a current code or a recovery code.", variant: "destructive" })
    } finally {
      setTwoFABusy(false)
    }
  }

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

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
              <Smartphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Two-Factor Authentication
                {twoFactorEnabled && <Badge variant="secondary">On</Badge>}
              </CardTitle>
              <CardDescription>
                {twoFactorEnabled
                  ? "Your account requires a one-time code at sign-in."
                  : "Add a one-time code from an authenticator app to your sign-in."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {twoFactorEnabled && twoFAMode === "idle" && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Protected by an authenticator app.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTwoFACode("")
                  setTwoFAMode("disabling")
                }}
              >
                Disable
              </Button>
            </div>
          )}

          {!twoFactorEnabled && twoFAMode === "idle" && (
            <Button onClick={handleStartEnroll} disabled={twoFABusy}>
              {twoFABusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enable two-factor
            </Button>
          )}

          {twoFAMode === "enrolling" && enrollment && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Scan the QR code with your authenticator app (or enter the secret
                manually), then enter the 6-digit code to confirm.
              </p>
              {enrollment.qrDataUri && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={enrollment.qrDataUri}
                  alt="Two-factor QR code"
                  className="h-44 w-44 rounded border bg-white p-2"
                />
              )}
              <p className="text-xs text-muted-foreground">
                Secret:{" "}
                <code className="font-mono text-foreground break-all">{enrollment.secret}</code>
              </p>
              <div className="max-w-xs space-y-2">
                <Label htmlFor="twoFACode">Verification code</Label>
                <Input
                  id="twoFACode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  value={twoFACode}
                  onChange={(e) => setTwoFACode(e.target.value)}
                  disabled={twoFABusy}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleVerifyEnroll} disabled={twoFABusy || twoFACode.trim().length < 6}>
                  {twoFABusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Verify &amp; enable
                </Button>
                <Button variant="outline" onClick={cancelTwoFA} disabled={twoFABusy}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {twoFAMode === "recovery" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-900/10">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Save these recovery codes somewhere safe. Each one works once if
                  you lose your authenticator — <strong>they won&apos;t be shown again.</strong>
                </p>
              </div>
              <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
                {recoveryCodes.map((c) => (
                  <li key={c} className="rounded bg-muted px-2 py-1 text-center">{c}</li>
                ))}
              </ul>
              <Button onClick={() => setTwoFAMode("idle")}>Done</Button>
            </div>
          )}

          {twoFAMode === "disabling" && (
            <div className="max-w-xs space-y-3">
              <Label htmlFor="disableCode">Enter a current code to disable</Label>
              <Input
                id="disableCode"
                inputMode="text"
                autoComplete="one-time-code"
                placeholder="Code or recovery code"
                value={twoFACode}
                onChange={(e) => setTwoFACode(e.target.value)}
                disabled={twoFABusy}
              />
              <div className="flex gap-2">
                <Button variant="destructive" onClick={handleDisable} disabled={twoFABusy || !twoFACode.trim()}>
                  {twoFABusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Disable 2FA
                </Button>
                <Button variant="outline" onClick={cancelTwoFA} disabled={twoFABusy}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-2">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Active Sessions</CardTitle>
              <CardDescription>
                Devices currently signed in to your account
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {sessions === null && !sessionsError && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading sessions…
            </div>
          )}
          {sessionsError && (
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load sessions. Session management is a hosted feature;
              the desktop app keeps everything on your device.
            </p>
          )}
          {sessions && sessions.length === 0 && !sessionsError && (
            <p className="text-sm text-muted-foreground">No active sessions found.</p>
          )}
          {sessions && sessions.length > 0 && (
            <>
              <ul className="space-y-3">
                {sessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <Monitor className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <span className="truncate">{deviceLabel(s.deviceInfo)}</span>
                          {s.isCurrent && <Badge variant="secondary">This device</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.ipAddress || "Unknown IP"} · last active {formatRelative(s.lastUsedAt)}
                        </p>
                      </div>
                    </div>
                    {!s.isCurrent && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={revokingId === s.id}
                        onClick={() => handleRevokeSession(s.id)}
                      >
                        {revokingId === s.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Sign out"
                        )}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Signing out a device revokes its session immediately. If that
                device has the app open, it may keep access until its sign-in
                expires (up to 24 hours).
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
