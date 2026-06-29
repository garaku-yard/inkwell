"use client"

import { useState, useRef } from "react"
import { Building2, Plus, Settings2, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/lib/WorkspaceContext"
import { AddWorkspaceDialog } from "./AddWorkspaceDialog"
import { CreateOrganizationDialog } from "./CreateOrganizationDialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Workspace } from "@/services/workspace"
import type { Organization } from "@/services/organization"
import { getStorage } from "@/lib/storage"
import { CategoryIcon } from "./CategoryIcon"

function initials(name: string): string {
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
  isDragOver,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  workspace: Workspace
  isActive: boolean
  isDragOver?: boolean
  onClick: () => void
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: () => void
}) {
  const primarySlug = workspace.categories?.[0]?.slug ?? ""

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          draggable
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          className={cn("relative transition-all duration-150", isDragOver && "translate-y-0.5 opacity-50")}
        >
          {isDragOver && <span className="absolute -top-1.5 left-1 right-1 h-0.5 rounded-full bg-primary" />}
          <button
            onClick={onClick}
            className={cn(
              "relative flex h-10 w-10 items-center justify-center rounded-[14px] text-sm font-bold transition-all duration-150 select-none border",
              "hover:rounded-[10px]",
              isActive ? "rounded-[10px] border-transparent bg-muted" : "border-border hover:border-foreground/20",
            )}
            aria-label={workspace.name}
          >
            {workspace.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={workspace.avatar_url} alt={workspace.name} className="h-10 w-10 rounded-[inherit] object-cover" />
            ) : primarySlug ? (
              <CategoryIcon slug={primarySlug} size={40} active={isActive} />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-[inherit] bg-muted text-muted-foreground text-sm font-bold">
                {initials(workspace.name)}
              </span>
            )}
            {isActive && <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-foreground" />}
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        <p>{workspace.name}</p>
      </TooltipContent>
    </Tooltip>
  )
}

/** Org tiles read as "a team" rather than a writing format: a squared tile with
 *  the org initials (or avatar) and a small Building2 badge, visually distinct
 *  from the colourful per-format workspace icons above. */
function OrgIcon({ org, isActive, onClick }: { org: Organization; isActive: boolean; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "relative flex h-10 w-10 items-center justify-center rounded-[12px] text-xs font-bold transition-all duration-150 select-none border",
            "hover:rounded-[8px]",
            isActive
              ? "rounded-[8px] border-transparent bg-primary/15 text-primary"
              : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
          )}
          aria-label={org.name}
        >
          {org.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.avatar_url} alt={org.name} className="h-10 w-10 rounded-[inherit] object-cover" />
          ) : (
            initials(org.name)
          )}
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-background border border-border shadow-sm">
            <Building2 className="h-2.5 w-2.5 text-muted-foreground" />
          </span>
          {isActive && <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-primary" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        <p>{org.name}</p>
        <p className="text-xs text-muted-foreground">Organization</p>
      </TooltipContent>
    </Tooltip>
  )
}

export function WorkspaceSwitcher() {
  const {
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    reorderWorkspaces,
    organizations,
    activeOrg,
    setActiveOrg,
    isLoading,
  } = useWorkspace()
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [createOrgOpen, setCreateOrgOpen] = useState(false)
  const draggedId = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const allPersonal = workspaces.personal ?? []
  // Local-first builds don't bind collaboration, so hide the "Shared with me"
  // rail icon (no remote graph to receive shares from). Orgs are similarly
  // hosted-only; on desktop `organizations` is simply empty.
  const hasCollaboration = getStorage().capabilities.has("collaboration")

  const handleDragStart = (ws: Workspace) => (e: React.DragEvent) => {
    draggedId.current = ws.id
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (ws: Workspace) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (ws.id !== draggedId.current) setDragOverId(ws.id)
  }

  const handleDrop = (targetWs: Workspace) => (e: React.DragEvent) => {
    e.preventDefault()
    setDragOverId(null)
    const fromId = draggedId.current
    if (!fromId || fromId === targetWs.id) return

    const list = [...allPersonal]
    const fromIdx = list.findIndex((w) => w.id === fromId)
    const toIdx = list.findIndex((w) => w.id === targetWs.id)
    if (fromIdx === -1 || toIdx === -1) return

    const reordered = [...list]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    reorderWorkspaces(reordered, workspaces.org ?? [])
  }

  const handleDragEnd = () => {
    draggedId.current = null
    setDragOverId(null)
  }

  return (
    <>
      <aside className="flex h-full w-16 flex-col items-center gap-2 border-r bg-sidebar py-3 shrink-0">
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
                isActive={!activeOrg && activeWorkspace?.id === ws.id}
                isDragOver={dragOverId === ws.id}
                onClick={() => setActiveWorkspace(ws)}
                onDragStart={handleDragStart(ws)}
                onDragOver={handleDragOver(ws)}
                onDrop={handleDrop(ws)}
                onDragEnd={handleDragEnd}
              />
            ))}

            {/* Divider between personal workspaces and organizations */}
            {allPersonal.length > 0 && organizations.length > 0 && <div className="my-1 h-px w-8 bg-border" />}

            {/* Organizations — the team zone */}
            {organizations.map((org) => (
              <OrgIcon key={org.id} org={org} isActive={activeOrg?.id === org.id} onClick={() => setActiveOrg(org)} />
            ))}
          </>
        )}

        {/* Spacer pushes the buttons to the bottom */}
        <div className="flex-1" />

        {/* Shared with me — collaboration-capable builds only */}
        {hasCollaboration && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push("/shared")}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-[14px] border border-border",
                  "text-muted-foreground transition-all duration-150 hover:rounded-[10px] hover:border-primary hover:text-primary",
                )}
                aria-label="Shared with me"
              >
                <Users className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Shared with me</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Add workspace / organization */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setAddOpen(true)}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-[14px] border-2 border-dashed border-border",
                "text-muted-foreground transition-all duration-150 hover:rounded-[10px] hover:border-primary hover:text-primary",
              )}
              aria-label="Add workspace or organization"
            >
              <Plus className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Add workspace or organization</p>
          </TooltipContent>
        </Tooltip>

        {/* Settings — personal workspace settings (org settings ship in a later
            stage). Hidden while in org context so this never points at a page
            that doesn't apply to the active scope. */}
        {!activeOrg && activeWorkspace && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push(`/workspace/settings?id=${activeWorkspace.id}`)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-[14px] border border-border",
                  "text-muted-foreground transition-all duration-150 hover:rounded-[10px] hover:border-primary hover:text-primary",
                )}
                aria-label="Workspace settings"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Workspace settings</p>
            </TooltipContent>
          </Tooltip>
        )}
      </aside>

      <AddWorkspaceDialog open={addOpen} onOpenChange={setAddOpen} onSwitchToOrg={() => setCreateOrgOpen(true)} />
      <CreateOrganizationDialog open={createOrgOpen} onOpenChange={setCreateOrgOpen} />
    </>
  )
}
