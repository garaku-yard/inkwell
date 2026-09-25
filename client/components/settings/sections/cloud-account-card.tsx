"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Cloud, CloudOff, Loader2, LogIn, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { CloudHostPicker, type CloudHostMode } from "@/components/cloud-host-picker"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/AuthContext"
import { getApiBaseUrl, getAuthToken, OFFICIAL_GATEWAY_URL } from "@/lib/api"
import { getStorage } from "@/lib/storage"
import {
  getStoredGatewayUrl,
  normalizeGatewayUrl,
  setStoredGatewayUrl,
} from "@/lib/desktop-auth"

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
  // Storage is bound before settings renders. The sync capability identifies
  // the local-first desktop implementation without another runtime-global
  // check that can disagree with the already-selected storage backend.
  const show = getStorage().capabilities.has("sync")

  const router = useRouter()
  const { toast } = useToast()
  const { user, logout } = useAuth()

  const [linked, setLinked] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [hostMode, setHostMode] = useState<CloudHostMode>("official")
  const [gatewayUrl, setGatewayUrl] = useState("")
  const [savingGateway, setSavingGateway] = useState(false)

  useEffect(() => {
    if (!show) return
    setLinked(getAuthToken() !== null)
    const stored = getStoredGatewayUrl()
    if (stored && stored !== OFFICIAL_GATEWAY_URL) {
      setHostMode("custom")
      setGatewayUrl(stored)
    } else {
      setHostMode("official")
      setGatewayUrl("")
    }
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

  const applyGateway = (showSuccess: boolean): boolean => {
    setSavingGateway(true)
    try {
      setStoredGatewayUrl(hostMode === "official" ? null : normalizeGatewayUrl(gatewayUrl))
      if (hostMode === "custom") setGatewayUrl(getStoredGatewayUrl() ?? "")
      if (showSuccess) {
        toast({ title: "Gateway updated", description: `Signing in will use ${getApiBaseUrl()}.` })
      }
      return true
    } catch (err) {
      toast({
        title: "Invalid cloud host",
        description: err instanceof Error ? err.message : "Check the host URL and try again.",
        variant: "destructive",
      })
      return false
    } finally {
      setSavingGateway(false)
    }
  }

  const handleSaveGateway = () => applyGateway(true)

  const openAccountRoute = (path: string) => {
    if (applyGateway(false)) router.push(path)
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
              <Button size="sm" onClick={() => openAccountRoute("/login?next=/settings")}>
                <LogIn className="h-4 w-4 mr-2" />
                Sign in
              </Button>
              <Button size="sm" variant="outline" onClick={() => openAccountRoute("/register?next=/settings")}>
                <UserPlus className="h-4 w-4 mr-2" />
                Create account
              </Button>
            </div>
          </div>
        )}

        <Separator />

        <div className="space-y-3">
          <CloudHostPicker
            mode={hostMode}
            customUrl={gatewayUrl}
            disabled={linked || savingGateway}
            onModeChange={setHostMode}
            onCustomUrlChange={setGatewayUrl}
          />
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleSaveGateway} disabled={linked || savingGateway}>
              Save host
            </Button>
            {linked && <p className="text-sm text-muted-foreground">Sign out to change the host.</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
