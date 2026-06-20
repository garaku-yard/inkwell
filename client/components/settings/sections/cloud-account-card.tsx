"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { isTauri } from "@tauri-apps/api/core"
import { Cloud, CloudOff, Loader2, LogIn, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/AuthContext"
import { getApiBaseUrl, getAuthToken } from "@/lib/api"
import { getStoredGatewayUrl, setStoredGatewayUrl } from "@/lib/desktop-auth"

/**
 * Desktop-only "Cloud account" card. Inkwell is local-first: the app works
 * fully offline with no account, and all writing stays in local storage.
 * Linking a cloud account is optional — it signs in against the gateway and
 * stores a token in the OS keychain, the groundwork for cross-device sync.
 *
 * Renders nothing on the web build (where central auth is the page-level login
 * flow). Sign-in / registration reuse the existing /login and /register pages;
 * this card owns the linked-state display, sign-out, and the gateway-URL
 * override a self-hoster needs before signing in.
 */
export function CloudAccountCard() {
  // Defer the isTauri() gate to the client so SSR and first paint agree (the
  // flag only exists in the webview), avoiding a hydration mismatch.
  const [show, setShow] = useState(false)
  useEffect(() => setShow(isTauri()), [])

  const router = useRouter()
  const { toast } = useToast()
  const { user, logout } = useAuth()

  const [linked, setLinked] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [gatewayUrl, setGatewayUrl] = useState("")
  const [savingGateway, setSavingGateway] = useState(false)

  useEffect(() => {
    if (!show) return
    setLinked(getAuthToken() !== null)
    // Show the saved override if any, otherwise the default origin in effect.
    setGatewayUrl(getStoredGatewayUrl() ?? getApiBaseUrl())
  }, [show])

  if (!show) return null

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await logout()
      setLinked(false)
      toast({ title: "Signed out", description: "Your cloud account has been unlinked. Your work stays on this device." })
    } catch {
      toast({ title: "Couldn't sign out", description: "Please try again.", variant: "destructive" })
    } finally {
      setSigningOut(false)
    }
  }

  const handleSaveGateway = () => {
    setSavingGateway(true)
    try {
      setStoredGatewayUrl(gatewayUrl.trim() || null)
      // Reflect the value actually applied (default substituted, slash trimmed).
      setGatewayUrl(getStoredGatewayUrl() ?? getApiBaseUrl())
      toast({ title: "Gateway updated", description: `Signing in will use ${getApiBaseUrl()}.` })
    } finally {
      setSavingGateway(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {linked ? <Cloud className="h-5 w-5" /> : <CloudOff className="h-5 w-5" />}
          Cloud account
        </CardTitle>
        <CardDescription>
          Optional. Inkwell works fully offline — linking an account is the first
          step toward syncing your work across devices. Your writing stays on
          this device either way.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {linked ? (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{user?.email}</div>
              <div className="text-sm text-muted-foreground truncate">
                {user?.username}
                {user?.tag ? `#${user.tag}` : ""}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign out"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Not signed in. Sign in to link this device to your account.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => router.push("/login?next=/settings")}>
                <LogIn className="h-4 w-4 mr-2" />
                Sign in
              </Button>
              <Button size="sm" variant="outline" onClick={() => router.push("/register?next=/settings")}>
                <UserPlus className="h-4 w-4 mr-2" />
                Create account
              </Button>
            </div>
          </div>
        )}

        <Separator />

        {/* Gateway override — self-hosters point at their own stack; everyone
            else leaves it on the default. Editable while signed out so it can be
            set before the first sign-in. */}
        <div className="space-y-2">
          <Label htmlFor="gateway-url">Gateway URL</Label>
          <div className="flex gap-2">
            <Input
              id="gateway-url"
              value={gatewayUrl}
              onChange={(e) => setGatewayUrl(e.target.value)}
              placeholder="https://inkwell.garakuyard.com"
              disabled={linked || savingGateway}
              spellCheck={false}
              autoCapitalize="off"
            />
            <Button variant="outline" size="sm" onClick={handleSaveGateway} disabled={linked || savingGateway}>
              Save
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {linked
              ? "Sign out to change the gateway."
              : "Leave as the default unless you self-host. Clear the field and save to reset to the default."}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
