"use client"

import { useState, useRef } from "react"
import { Plus, Settings2, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/lib/WorkspaceContext"
import { useAuth } from "@/lib/AuthContext"
import { AddWorkspaceDialog } from "./AddWorkspaceDialog"
import { CreateOrgWorkspaceDialog } from "./CreateOrgWorkspaceDialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Workspace } from "@/services/workspace"
import { getStorage } from "@/lib/storage"
import { CategoryIcon } from "./CategoryIcon"

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
  isInvited,
  isDragOver,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  workspace: Workspace
  isActive: boolean
  isInvited?: boolean
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
          className={cn(
            "relative transition-all duration-150",
            isDragOver && "translate-y-0.5 opacity-50"
          )}
        >
          {/* Drop indicator line above */}
          {isDragOver && (
            <span className="absolute -top-1.5 left-1 right-1 h-0.5 rounded-full bg-primary" />
          )}
          <button
            onClick={onClick}
            className={cn(
              "relative flex h-10 w-10 items-center justify-center rounded-[14px] text-sm font-bold transition-all duration-150 select-none border",
              "hover:rounded-[10px]",
              // Quiet active state: the left indicator bar (below) does the
              // signalling; the tile just morphs to a tighter square + a faint
              // fill, rather than a loud high-contrast ring.
              isActive
                ? "rounded-[10px] border-transparent bg-muted"
                : "border-border hover:border-foreground/20"
            )}
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
              <CategoryIcon slug={primarySlug} size={40} active={isActive} />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-[inherit] bg-muted text-muted-foreground text-sm font-bold">
                {workspaceInitials(workspace.name)}
              </span>
            )}
            {isActive && (
              <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-foreground" />
            )}
            {isInvited && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-background border border-border shadow-sm">
                <Users className="h-2.5 w-2.5 text-muted-foreground" />
              </span>
            )}
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        <p>{workspace.name}</p>
        {isInvited ? (
          <p className="text-xs text-muted-foreground">Member (invited)</p>
        ) : workspace.type === "org" ? (
          <p className="text-xs text-muted-foreground">Organization</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, setActiveWorkspace, reorderWorkspaces, isLoading } = useWorkspace()
  const { user } = useAuth()
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [createOrgOpen, setCreateOrgOpen] = useState(false)
  const draggedId = useRef<string | null>(null)
  const draggedGroup = useRef<"personal" | "org" | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const allPersonal = workspaces.personal ?? []
  const allOrg = workspaces.org ?? []
  // Hide the "Shared with me" rail icon on local-first builds where
  // the storage backend doesn't bind the collaboration capability —
  // there's no remote graph to receive shares from, so the icon
  // would lead to a permanently-empty page.
  const hasCollaboration = getStorage().capabilities.has("collaboration")
  const ownedOrgs = allOrg.filter((ws) => ws.owner_id === user?.id)
  const invitedOrgs = allOrg.filter((ws) => ws.owner_id !== user?.id)

  const handleDragStart = (ws: Workspace, group: "personal" | "org") => (e: React.DragEvent) => {
    draggedId.current = ws.id
    draggedGroup.current = group
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (ws: Workspace) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (ws.id !== draggedId.current) setDragOverId(ws.id)
  }

  const handleDrop = (targetWs: Workspace, group: "personal" | "org") => (e: React.DragEvent) => {
    e.preventDefault()
    setDragOverId(null)
    const fromId = draggedId.current
    const fromGroup = draggedGroup.current
    if (!fromId || fromGroup !== group || fromId === targetWs.id) return

    const list = group === "personal" ? [...allPersonal] : [...allOrg]
    const fromIdx = list.findIndex(w => w.id === fromId)
    const toIdx = list.findIndex(w => w.id === targetWs.id)
    if (fromIdx === -1 || toIdx === -1) return

    const reordered = [...list]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)

    const newPersonal = group === "personal" ? reordered : allPersonal
    const newOrg = group === "org" ? reordered : allOrg
    reorderWorkspaces(newPersonal, newOrg)
  }

  const handleDragEnd = () => {
    draggedId.current = null
    draggedGroup.current = null
    setDragOverId(null)
  }

  const makeIconProps = (ws: Workspace, group: "personal" | "org", extra?: object) => ({
    workspace: ws,
    isActive: activeWorkspace?.id === ws.id,
    isDragOver: dragOverId === ws.id,
    onClick: () => setActiveWorkspace(ws),
    onDragStart: handleDragStart(ws, group),
    onDragOver: handleDragOver(ws),
    onDrop: handleDrop(ws, group),
    onDragEnd: handleDragEnd,
    ...extra,
  })

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
              <WorkspaceIcon key={ws.id} {...makeIconProps(ws, "personal")} />
            ))}

            {/* Divider */}
            {allPersonal.length > 0 && (ownedOrgs.length > 0 || invitedOrgs.length > 0) && (
              <div className="my-1 h-px w-8 bg-border" />
            )}

            {/* Owned org workspaces */}
            {ownedOrgs.map((ws) => (
              <WorkspaceIcon key={ws.id} {...makeIconProps(ws, "org")} />
            ))}

            {/* Divider */}
            {ownedOrgs.length > 0 && invitedOrgs.length > 0 && (
              <div className="my-1 h-px w-8 bg-border" />
            )}

            {/* Invited org workspaces */}
            {invitedOrgs.map((ws) => (
              <WorkspaceIcon key={ws.id} {...makeIconProps(ws, "org", { isInvited: true })} />
            ))}
          </>
        )}

        {/* Spacer pushes the buttons to the bottom */}
        <div className="flex-1" />

        {/* Shared with me — only relevant when the backend supports
            collaboration. Local-first / desktop-only storage hides
            this entirely. */}
        {hasCollaboration && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push("/shared")}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-[14px] border border-border",
                  "text-muted-foreground transition-all duration-150 hover:rounded-[10px] hover:border-primary hover:text-primary"
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

        {/* Workspace settings */}
        {activeWorkspace && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push(`/workspace/settings?id=${activeWorkspace.id}`)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-[14px] border border-border",
                  "text-muted-foreground transition-all duration-150 hover:rounded-[10px] hover:border-primary hover:text-primary"
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

      <AddWorkspaceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSwitchToOrg={() => setCreateOrgOpen(true)}
      />
      <CreateOrgWorkspaceDialog
        open={createOrgOpen}
        onOpenChange={setCreateOrgOpen}
      />
    </>
  )
}
