"use client"

import { useEffect, useRef, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { CheckCircle2, Cloud, Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import type { DriveBackupProgress, DriveBackupProject, DriveBackupStatus } from "@/lib/drive-backup"

interface DriveAuthStatus {
  configured: boolean
  connected: boolean
  accountEmail?: string
}

export function IntegrationsSection() {
  const [desktop, setDesktop] = useState(false)
  const [status, setStatus] = useState<DriveAuthStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [backup, setBackup] = useState<DriveBackupStatus | null>(null)
  const [progress, setProgress] = useState<DriveBackupProgress | null>(null)
  const [projects, setProjects] = useState<DriveBackupProject[]>([])
  const cancelRef = useRef<AbortController | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    const inDesktop = isTauri()
    setDesktop(inDesktop)
    if (inDesktop) {
      void invoke<DriveAuthStatus>("google_drive_status")
        .then(async next => {
          setStatus(next)
          const { getDriveBackupStatus, listDriveBackupProjects } = await import("@/lib/drive-backup")
          const [backupStatus, choices] = await Promise.all([
            getDriveBackupStatus(),
            listDriveBackupProjects(),
          ])
          setBackup(backupStatus)
          setProjects(choices)
        })
        .catch(error => toast({
          title: "Could not check Google Drive",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        }))
    }
  }, [toast])

  const connect = async () => {
    setBusy(true)
    setConnectionError(null)
    try {
      setStatus(await invoke<DriveAuthStatus>("google_drive_connect"))
      toast({ title: "Google Drive connected" })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setConnectionError(message)
      toast({
        title: "Google Drive connection failed",
        description: message,
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

  const backUpProjects = async () => {
    const controller = new AbortController()
    cancelRef.current = controller
    setBusy(true)
    setProgress(null)
    setBackup(current => current ? { ...current, status: "backing_up" } : { status: "backing_up" })
    try {
      const { backupSelectedProjectsToDrive, getDriveBackupStatus } = await import("@/lib/drive-backup")
      const result = await backupSelectedProjectsToDrive(setProgress, controller.signal)
      setBackup(await getDriveBackupStatus())
      toast({
        title: "Google Drive backup complete",
        description: `${result.uploaded} uploaded, ${result.unchanged} unchanged${result.skipped.length ? `, ${result.skipped.length} too large` : ""}.`,
      })
    } catch (error) {
      const { getDriveBackupStatus } = await import("@/lib/drive-backup")
      setBackup(await getDriveBackupStatus().catch(() => ({ status: "error" as const })))
      const stopped = error instanceof Error && error.name === "AbortError"
      toast(stopped ? { title: "Google Drive backup stopped" } : {
          title: "Google Drive backup failed",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        })
    } finally {
      setBusy(false)
      setProgress(null)
      cancelRef.current = null
    }
  }

  const toggleProject = async (projectId: string, enabled: boolean) => {
    const previous = projects
    setProjects(current => current.map(project => project.id === projectId ? { ...project, enabled } : project))
    try {
      const { setDriveBackupProjectEnabled } = await import("@/lib/drive-backup")
      await setDriveBackupProjectEnabled(projectId, enabled)
    } catch (error) {
      setProjects(previous)
      toast({
        title: "Could not update backup selection",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      })
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
            ) : desktop ? (
              <Button disabled={busy || status?.configured === false} onClick={() => void connect()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Connect Google Drive
              </Button>
            ) : (
              <Badge variant="secondary">Desktop app required</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {desktop
              ? "Backups are manual and one-way. Connecting does not upload anything until you choose Back up all now."
              : "Google Drive backup is available in the Inkwell desktop app."}
          </p>
          {connectionError && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              Google Drive connection failed: {connectionError}
            </p>
          )}
          {desktop && status?.connected && (
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">Projects to back up</p>
                {projects.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">No local projects are available.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {projects.map(project => (
                      <label key={project.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={project.enabled}
                          disabled={busy}
                          onCheckedChange={checked => void toggleProject(project.id, checked === true)}
                        />
                        <span>{project.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {project.category === "vault" ? "Vault files" : ".iw + PDF"}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div>
                <p className="text-sm font-medium">
                  {progress
                    ? `Backing up ${progress.project}${progress.path ? ` — ${progress.path}` : ""}`
                    : backup?.status === "error"
                      ? "Last backup failed"
                      : backup?.lastBackupAt
                        ? `Last backup ${new Date(backup.lastBackupAt).toLocaleString()}`
                        : "No backups yet"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {progress
                    ? `${progress.completed} of ${progress.total} backup items`
                    : backup?.error ?? "Vaults keep their files and folders; other projects include a lossless .iw and readable PDF."}
                </p>
              </div>
                {busy ? (
                  <Button variant="destructive" onClick={() => cancelRef.current?.abort()}>
                    Stop backup
                  </Button>
                ) : (
                  <Button
                    disabled={!projects.some(project => project.enabled)}
                    onClick={() => void backUpProjects()}
                  >
                    Back up selected projects
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
