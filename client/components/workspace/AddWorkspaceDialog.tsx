"use client"

import { useState, useEffect } from "react"
import { CheckCircle2, Loader2, Building2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/AuthContext"
import { useWorkspace } from "@/lib/WorkspaceContext"
import { createPersonalWorkspaces, listCategories, type Category } from "@/services/workspace"
import { CategoryIcon, CATEGORY_COLORS } from "./CategoryIcon"

interface AddWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSwitchToOrg: () => void
}

export function AddWorkspaceDialog({ open, onOpenChange, onSwitchToOrg }: AddWorkspaceDialogProps) {
  const { user } = useAuth()
  const { workspaces, refetch } = useWorkspace()
  const [categories, setCategories] = useState<Category[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isFetching, setIsFetching] = useState(true)

  const ownedSlugs = new Set(
    (workspaces.personal ?? []).map((ws) => ws.categories?.[0]?.slug).filter(Boolean)
  )

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    setIsFetching(true)
    listCategories()
      .then(setCategories)
      .catch(console.error)
      .finally(() => setIsFetching(false))
  }, [open])

  const toggle = (slug: string) => {
    if (ownedSlugs.has(slug)) return
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(slug) ? next.delete(slug) : next.add(slug)
      return next
    })
  }

  const handleCreate = async () => {
    if (!user?.id || selected.size === 0) return
    setIsSubmitting(true)
    try {
      await createPersonalWorkspaces(user.id, Array.from(selected))
      await refetch()
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to create workspaces:", err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add a workspace</DialogTitle>
          <DialogDescription>
            Pick a writing format to get a dedicated workspace with the right tools.
          </DialogDescription>
        </DialogHeader>

        {isFetching ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 py-2">
            {categories.map((cat) => {
              const owned = ownedSlugs.has(cat.slug)
              const isSelected = selected.has(cat.slug)
              const ringColor = CATEGORY_COLORS[cat.slug]?.ring ?? "#6366f1"

              return (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => toggle(cat.slug)}
                  disabled={owned}
                  className={cn(
                    "relative flex items-center gap-3 rounded-xl border-2 px-3 py-3 text-left transition-all duration-150",
                    owned
                      ? "border-border bg-muted/40 opacity-50 cursor-not-allowed"
                      : isSelected
                      ? "border-transparent bg-muted/60"
                      : "border-border hover:border-border/80 hover:bg-muted/50"
                  )}
                  style={isSelected ? { borderColor: ringColor, backgroundColor: `${ringColor}10` } : undefined}
                >
                  {(isSelected || owned) && (
                    <CheckCircle2
                      className="absolute top-2 right-2 h-3.5 w-3.5"
                      style={{ color: owned ? undefined : ringColor }}
                    />
                  )}
                  <CategoryIcon slug={cat.slug} size={36} rounded={10} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight"
                      style={isSelected ? { color: ringColor } : undefined}>
                      {cat.name}
                    </p>
                    {owned
                      ? <p className="text-xs text-muted-foreground">Already added</p>
                      : <p className="text-xs text-muted-foreground leading-tight mt-0.5 line-clamp-1">{cat.description}</p>
                    }
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <button
            type="button"
            onClick={() => { onOpenChange(false); onSwitchToOrg() }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Building2 className="h-4 w-4" />
            Create an organization instead
          </button>
          <Button
            onClick={handleCreate}
            disabled={selected.size === 0 || isSubmitting}
            size="sm"
          >
            {isSubmitting
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Adding...</>
              : `Add${selected.size > 0 ? ` ${selected.size}` : ""} workspace${selected.size !== 1 ? "s" : ""}`
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
