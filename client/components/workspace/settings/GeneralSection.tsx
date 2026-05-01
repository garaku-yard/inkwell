"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, Loader2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { deleteWorkspace, updateWorkspace, type Workspace } from "@/services/workspace"

interface GeneralSectionProps {
  workspace: Workspace
  /** Called after a successful save / avatar change. Lets the parent
   *  refresh the in-memory workspace object so other sections see fresh
   *  data without remounting. */
  onUpdated: (workspace: Workspace) => void
  /** Called after a successful delete so the parent can navigate away
   *  before this section unmounts. */
  onDeleted: () => void
}

function workspaceInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase()
}

/** General workspace settings — name + description form, avatar upload,
 *  and the delete-workspace danger zone. Owns its own form state and
 *  the delete-confirmation dialog. */
export function GeneralSection({ workspace, onUpdated, onDeleted }: GeneralSectionProps) {
  const { toast } = useToast()
  const [name, setName] = useState(workspace.name)
  const [description, setDescription] = useState(workspace.description ?? "")
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Keep the inputs synced when the parent reloads the workspace (e.g.
  // after a save in another tab). Without this, props would update but
  // the form would stay on the previous values.
  useEffect(() => {
    setName(workspace.name)
    setDescription(workspace.description ?? "")
  }, [workspace.name, workspace.description])

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await updateWorkspace(workspace.id, { name, description })
      onUpdated(updated)
      toast({ title: "Workspace updated" })
    } catch {
      toast({ title: "Failed to save changes", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const updated = await updateWorkspace(workspace.id, { avatar_url: dataUrl })
      onUpdated(updated)
      toast({ title: "Avatar updated" })
    } catch {
      toast({ title: "Failed to upload avatar", variant: "destructive" })
    } finally {
      setAvatarUploading(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ""
    }
  }

  const handleRemoveAvatar = async () => {
    setAvatarUploading(true)
    try {
      const updated = await updateWorkspace(workspace.id, { avatar_url: "" })
      onUpdated(updated)
      toast({ title: "Avatar removed" })
    } catch {
      toast({ title: "Failed to remove avatar", variant: "destructive" })
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteWorkspace(workspace.id)
      toast({ title: "Workspace deleted" })
      onDeleted()
    } catch {
      toast({ title: "Failed to delete workspace", variant: "destructive" })
      setDeleting(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">General</h2>
        <p className="text-sm text-muted-foreground">Basic workspace information</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="flex items-center gap-5">
            <div className="relative">
              {workspace.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={workspace.avatar_url}
                  alt={workspace.name}
                  className="h-16 w-16 rounded-[18px] object-cover border border-border"
                />
              ) : (
                <div className="h-16 w-16 rounded-[18px] bg-muted flex items-center justify-center border border-border text-lg font-bold text-muted-foreground">
                  {workspaceInitials(name || workspace.name || "?")}
                </div>
              )}
              {avatarUploading && (
                <div className="absolute inset-0 rounded-[18px] bg-background/70 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={avatarUploading}
                onClick={() => avatarInputRef.current?.click()}
              >
                <Camera className="h-3.5 w-3.5" />
                {workspace.avatar_url ? "Change photo" : "Upload photo"}
              </Button>
              {workspace.avatar_url && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground text-xs"
                  disabled={avatarUploading}
                  onClick={handleRemoveAvatar}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Workspace name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-desc">Description</Label>
            <Input
              id="ws-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this workspace for?"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Save changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
          <CardDescription>Permanently delete this workspace and all its data.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete workspace
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{workspace.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the workspace and all its data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete workspace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
