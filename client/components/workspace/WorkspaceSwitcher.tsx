"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/lib/WorkspaceContext"
import { AddWorkspaceDialog } from "./AddWorkspaceDialog"
import { CreateOrgWorkspaceDialog } from "./CreateOrgWorkspaceDialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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
import type { Workspace } from "@/services/workspace"
import { deleteWorkspace } from "@/services/workspace"
import { CategoryIcon, CATEGORY_COLORS } from "./CategoryIcon"
import { useToast } from "@/hooks/use-toast"

function workspaceInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
}

function WorkspaceIcon({
  workspace,
  isActive,
  onClick,
}: {
  workspace: Workspace
  isActive: boolean
  onClick: () => void
}) {
  // For personal workspaces with a single category, use that category's color
  const primarySlug = workspace.categories?.[0]?.slug ?? ""
  const categoryColor = CATEGORY_COLORS[primarySlug]
  // Use category ring color when active, else subtle default
  const ringColor = categoryColor?.ring ?? "#6366f1"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "relative flex h-10 w-10 items-center justify-center rounded-[14px] text-sm font-bold transition-all duration-150 select-none border",
            "hover:rounded-[10px]",
            isActive ? "rounded-[10px] border-transparent" : "border-black dark:border-black"
          )}
          style={isActive ? {
            boxShadow: `0 0 0 2.5px ${ringColor}, 0 0 0 4px var(--background, #fff)`,
          } : {}}
          aria-label={workspace.name}
        >
          {workspace.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={workspace.avatar_url}
              alt={workspace.name}
              className="h-10 w-10 rounded-[inherit] object-cover"
            />
          ) : primarySlug ? (
            <CategoryIcon slug={primarySlug} size={40} rounded={isActive ? 10 : 14} />
          ) : (
            // org workspace or unknown — initials with dark bg
            <span className="flex h-10 w-10 items-center justify-center rounded-[inherit] bg-muted text-muted-foreground text-sm font-bold">
              {workspaceInitials(workspace.name)}
            </span>
          )}
          {isActive && (
            <span
              className="absolute -left-3 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full"
              style={{ backgroundColor: ringColor }}
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        <p>{workspace.name}</p>
        {workspace.type === "org" && (
          <p className="text-xs text-muted-foreground">Organization</p>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, setActiveWorkspace, isLoading, refetch } = useWorkspace()
  const [addOpen, setAddOpen] = useState(false)
  const [createOrgOpen, setCreateOrgOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const { toast } = useToast()

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await deleteWorkspace(deleteTarget.id)
      toast({ title: "Organization deleted", description: `"${deleteTarget.name}" has been deleted.` })
      // If we deleted the active workspace, switch to the first remaining one
      if (activeWorkspace?.id === deleteTarget.id) {
        const remaining = [
          ...(workspaces.personal ?? []),
          ...(workspaces.org ?? []).filter(w => w.id !== deleteTarget.id),
        ]
        if (remaining.length > 0) setActiveWorkspace(remaining[0])
      }
      setDeleteTarget(null)
      refetch()
    } catch {
      toast({ title: "Failed to delete", description: "Could not delete the organization.", variant: "destructive" })
    } finally {
      setIsDeleting(false)
    }
  }

  const allPersonal = workspaces.personal ?? []
  const allOrg = workspaces.org ?? []

  return (
    <>
      <aside className="flex h-full w-16 flex-col items-center gap-2 border-r bg-background py-3 shrink-0">
        {isLoading ? (
          <>
            <div className="h-10 w-10 rounded-[14px] bg-muted animate-pulse" />
            <div className="h-10 w-10 rounded-[14px] bg-muted animate-pulse" />
          </>
        ) : (
          <>
            {/* Personal workspaces */}
            {allPersonal.map((ws) => (
              <WorkspaceIcon
                key={ws.id}
                workspace={ws}
                isActive={activeWorkspace?.id === ws.id}
                onClick={() => setActiveWorkspace(ws)}
              />
            ))}

            {/* Divider between personal and org */}
            {allPersonal.length > 0 && allOrg.length > 0 && (
              <div className="my-1 h-px w-8 bg-border" />
            )}

            {/* Org workspaces — right-click to delete */}
            {allOrg.map((ws) => (
              <div
                key={ws.id}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setDeleteTarget(ws)
                }}
              >
                <WorkspaceIcon
                  workspace={ws}
                  isActive={activeWorkspace?.id === ws.id}
                  onClick={() => setActiveWorkspace(ws)}
                />
              </div>
            ))}
          </>
        )}

        {/* Spacer pushes the add button to the bottom */}
        <div className="flex-1" />

        {/* Add workspace */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setAddOpen(true)}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-[14px] border-2 border-dashed border-border",
                "text-muted-foreground transition-all duration-150 hover:rounded-[10px] hover:border-primary hover:text-primary"
              )}
              aria-label="Add workspace"
            >
              <Plus className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Add workspace</p>
          </TooltipContent>
        </Tooltip>
      </aside>

      <AddWorkspaceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSwitchToOrg={() => setCreateOrgOpen(true)}
      />
      <CreateOrgWorkspaceDialog
        open={createOrgOpen}
        onOpenChange={setCreateOrgOpen}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deleteTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the organization and all its data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting…" : "Delete organization"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
