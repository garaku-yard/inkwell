"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
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
import { useWorkspace } from "@/lib/WorkspaceContext"
import { createOrganization } from "@/services/organization"

interface CreateOrganizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Creates a first-class organization (the GitHub-style team entity). Unlike a
 *  personal workspace, an org is a flat shared project pool — no category
 *  bundle — so the form is just a name + description. On success the new org
 *  becomes the active context. */
export function CreateOrganizationDialog({ open, onOpenChange }: CreateOrganizationDialogProps) {
  const { refetch, setActiveOrg } = useWorkspace()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Organization name is required.")
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const org = await createOrganization({
        name: name.trim(),
        description: description.trim() || undefined,
      })
      await refetch()
      setActiveOrg(org)
      onOpenChange(false)
      setName("")
      setDescription("")
    } catch (err: unknown) {
      // The cases that actually occur here now arrive with actionable copy of
      // their own — gateway unreachable (UNAVAILABLE, naming the origin), the
      // Business-plan gate (FAILED_PRECONDITION), an expired session
      // (UNAUTHENTICATED) — so surface that verbatim and only substitute text
      // when something threw with none to give.
      const message = err instanceof Error && err.message.trim() ? err.message.trim() : null
      setError(message ?? "Couldn't create the organization. Try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New organization</DialogTitle>
          <DialogDescription>
            A shared space for your team to write together. Invite members and manage
            seats once it&apos;s created. Organizations are part of the Business plan.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="org-name">Organization name</Label>
            <Input
              id="org-name"
              autoFocus
              placeholder="e.g. Acme Productions"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && !isLoading) handleCreate()
              }}
              disabled={isLoading}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="org-description">Description (optional)</Label>
            <Input
              id="org-description"
              placeholder="What does this organization work on?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || isLoading}>
            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating...</> : "Create organization"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
