"use client"

import { useEffect, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { CheckCircle2, Cloud, Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"

interface DriveAuthStatus {
  configured: boolean
  connected: boolean
  accountEmail?: string
}

export function IntegrationsSection() {
  const [desktop, setDesktop] = useState(false)
  const [status, setStatus] = useState<DriveAuthStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const inDesktop = isTauri()
    setDesktop(inDesktop)
    if (inDesktop) {
      void invoke<DriveAuthStatus>("google_drive_status")
        .then(setStatus)
        .catch(error => toast({
          title: "Could not check Google Drive",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        }))
    }
  }, [toast])

  const connect = async () => {
    setBusy(true)
    try {
      setStatus(await invoke<DriveAuthStatus>("google_drive_connect"))
      toast({ title: "Google Drive connected" })
    } catch (error) {
      toast({
        title: "Google Drive connection failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    try {
      setStatus(await invoke<DriveAuthStatus>("google_drive_disconnect"))
      toast({ title: "Google Drive disconnected" })
    } catch (error) {
      toast({
        title: "Could not disconnect Google Drive",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900/30">
              <Cloud className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Google Drive backup</CardTitle>
              <CardDescription>
                Keep a one-way copy of your projects in your own Google Drive
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium">Google Drive</h4>
                {status?.connected && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Connected
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {status?.connected
                  ? status.accountEmail
                  : "Inkwell can access only the Drive files it creates for your backups."}
              </p>
            </div>
            {desktop && status?.connected ? (
              <Button variant="outline" disabled={busy} onClick={() => void disconnect()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Disconnect
              </Button>
            ) : (
              <Button disabled={!desktop || busy || status?.configured === false} onClick={() => void connect()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Connect Google Drive
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {desktop
              ? "Backups are manual and one-way. Connecting does not upload anything until you choose Back up all now."
              : "Google Drive backup is available in the Inkwell desktop app."}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
