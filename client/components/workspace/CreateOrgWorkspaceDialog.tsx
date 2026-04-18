"use client"

import { useState, useEffect } from "react"
import { Check, Loader2 } from "lucide-react"
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
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/lib/WorkspaceContext"
import { createOrgWorkspace, listCategories, type Category } from "@/services/workspace"

interface CreateOrgWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateOrgWorkspaceDialog({ open, onOpenChange }: CreateOrgWorkspaceDialogProps) {
  const { refetch, setActiveWorkspace } = useWorkspace()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      listCategories().then(setCategories).catch(console.error)
    }
  }, [open])

  const toggle = (slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev)
      next.has(slug) ? next.delete(slug) : next.add(slug)
      return next
    })
  }

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Organization name is required.")
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const ws = await createOrgWorkspace({
        name: name.trim(),
        description: description.trim() || undefined,
        category_slugs: Array.from(selectedSlugs),
      })
      await refetch()
      setActiveWorkspace(ws)
      onOpenChange(false)
      setName("")
      setDescription("")
      setSelectedSlugs(new Set())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create organization.")
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
            Create a shared workspace for your team. You can invite members after creation.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="org-name">Organization name</Label>
            <Input
              id="org-name"
              placeholder="e.g. Acme Productions"
              value={name}
              onChange={(e) => setName(e.target.value)}
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

          {categories.length > 0 && (
            <div className="grid gap-2">
              <Label>Writing categories</Label>
              <div className="grid grid-cols-2 gap-2">
                {categories.map((cat) => {
                  const isSelected = selectedSlugs.has(cat.slug)
                  return (
                    <button
                      key={cat.slug}
                      type="button"
                      onClick={() => toggle(cat.slug)}
                      disabled={isLoading}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-left transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:border-muted-foreground/40"
                      )}
                    >
                      <Check className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                      {cat.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
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
