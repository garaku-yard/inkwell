import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Bot, ChevronDown, Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import type { SaveStatus } from "./useElementAutosave"

export interface EditorHeaderExportItem {
  label: string
  onClick: () => void
}

interface EditorHeaderProps {
  /** Title shown in the header h1. Usually `projectData.title`. */
  title: string
  /** One-line subtitle under the title — the format name (Novel,
   *  Lyrics, Comic Script, Tabletop RPG). */
  subtitle: string
  /** Right-side stat slot: word count, line count, page+panel count.
   *  Renders as `<span>` inside the right cluster. */
  statRight: ReactNode
  saveStatus: SaveStatus
  onToggleAI: () => void
  /** Items that populate the Export dropdown menu. Pass an empty list
   *  to hide the menu entirely (no current call site does that). */
  exportItems: EditorHeaderExportItem[]
  /** Optional extra slot rendered between the stat and the save status
   *  — used by Poetry for its center-align toggle. Most editors leave
   *  this undefined. */
  extras?: ReactNode
}

/** Shared header for the simpler format editors (Prose, Poetry, Comic,
 *  TabletopRPG). Screenplay and Vault have structurally different
 *  headers (different button sets, different chrome) and stay inline.
 *  IF's view toggle sits outside the right-side cluster as a sibling
 *  block, so it also stays inline; folding it in would push a
 *  `rightSlot` prop nobody else wants. */
export function EditorHeader({
  title,
  subtitle,
  statRight,
  saveStatus,
  onToggleAI,
  exportItems,
  extras,
}: EditorHeaderProps) {
  const router = useRouter()
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b shrink-0">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push("/dashboard")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-base font-semibold leading-tight">{title}</h1>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{statRight}</span>
        {extras}
        <span
          className={cn(
            saveStatus === "saved" && "text-green-600 dark:text-green-400",
            saveStatus === "saving" && "text-yellow-600 dark:text-yellow-400",
          )}
        >
          {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Unsaved"}
        </span>
        {exportItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" />
                Export
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {exportItems.map((item) => (
                <DropdownMenuItem key={item.label} onClick={item.onClick}>
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onToggleAI}
          title="Writing Buddy"
        >
          <Bot className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
