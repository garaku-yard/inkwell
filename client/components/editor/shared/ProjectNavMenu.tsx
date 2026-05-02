"use client"

/**
 * Cross-feature navigation for a single project. Lets writers jump
 * between Editor / Beat Board / Outline / Analytics without bouncing
 * back to the dashboard. Mounts inside editor toolbars next to the
 * title.
 *
 * Per CLAUDE.md, vault projects don't carry beats / outline / analytics
 * the same way story-shaped projects do, so the menu hides those
 * entries when category === "vault".
 */

import Link from "next/link"
import { ChevronDown, Pencil, Map, ListTree, BarChart3 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ProjectNavMenuProps {
  projectId: string
  /** Project category — drives which destinations show up. Vault
   *  projects only see Editor (the others don't apply). */
  category?: string
  /** Which destination is currently active, so we can dim it in the
   *  menu. Use the route's path segment ("editor" | "beat-board" |
   *  "outline-editor" | "analytics"). */
  current?: "editor" | "beat-board" | "outline-editor" | "analytics"
}

export function ProjectNavMenu({ projectId, category, current = "editor" }: ProjectNavMenuProps) {
  const isVault = category === "vault"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Switch project view"
          className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {labelFor(current)}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem asChild disabled={current === "editor"}>
          <Link href={`/projects/editor?id=${projectId}`}>
            <Pencil className="mr-2 h-4 w-4" />
            Editor
          </Link>
        </DropdownMenuItem>
        {!isVault && (
          <>
            <DropdownMenuItem asChild disabled={current === "beat-board"}>
              <Link href={`/projects/beat-board?id=${projectId}`}>
                <Map className="mr-2 h-4 w-4" />
                Beat Board
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild disabled={current === "outline-editor"}>
              <Link href={`/projects/outline-editor?id=${projectId}`}>
                <ListTree className="mr-2 h-4 w-4" />
                Outline
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild disabled={current === "analytics"}>
              <Link href={`/analytics?project=${projectId}`}>
                <BarChart3 className="mr-2 h-4 w-4" />
                Analytics
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function labelFor(current: ProjectNavMenuProps["current"]): string {
  switch (current) {
    case "beat-board":
      return "Beat Board"
    case "outline-editor":
      return "Outline"
    case "analytics":
      return "Analytics"
    case "editor":
    default:
      return "Editor"
  }
}
