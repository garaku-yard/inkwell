import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Bot, ChevronDown, Download } from "lucide-react"

import { AppHeaderActions } from "@/components/AppHeaderActions"
import { Button } from "@/components/ui/button"
import { ProjectKnowledgeButton } from "../ProjectKnowledgeButton"
import { ProjectNavMenu } from "./ProjectNavMenu"
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
  /** Whether the Writing Buddy panel is currently open. Drives
   *  aria-pressed so screen readers announce the toggle state. */
  isAIOpen?: boolean
  /** Items that populate the Export dropdown menu. Pass an empty list
   *  to hide the menu entirely (no current call site does that). */
  exportItems: EditorHeaderExportItem[]
  /** Optional extra slot rendered between the stat and the save status
   *  — used by Poetry for its center-align toggle. Most editors leave
   *  this undefined. */
  extras?: ReactNode
  /** Project id + category drive the cross-feature nav menu under
   *  the title (Editor / Beat Board / Outline / Analytics). When
   *  omitted the menu is hidden — useful in tests or while loading. */
  projectId?: string
  category?: string
}

/** Shared header for the simpler format editors (Prose, Poetry, Comic,
 *  TabletopRPG, Interactive Fiction). Screenplay and Vault have
 *  structurally different headers (different button sets, different
 *  chrome) and stay inline. IF threads its Write/Graph/Play view
 *  toggle through the `extras` slot. */
export function EditorHeader({
  title,
  subtitle,
  statRight,
  saveStatus,
  onToggleAI,
  isAIOpen,
  exportItems,
  extras,
  projectId,
  category,
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
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base font-semibold leading-tight">{title}</h1>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          {projectId && (
            <ProjectNavMenu projectId={projectId} category={category} current="editor" />
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{statRight}</span>
        {extras}
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={cn(
            // BRANDBOOK semantic palette only sanctions success/error/info.
            // Saving is a transient state, not an outcome — muted reads
            // honestly. Unsaved (the failure-adjacent case) earns the
            // destructive token so the writer notices it.
            saveStatus === "unsaved" && "text-destructive",
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
        <ProjectKnowledgeButton projectId={projectId} category={category} />
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", isAIOpen && "bg-muted text-foreground")}
          onClick={onToggleAI}
          aria-label="Toggle Writing Buddy"
          aria-pressed={isAIOpen ?? false}
          title="Writing Buddy"
        >
          <Bot className="h-4 w-4" />
        </Button>
        <div className="h-5 w-px bg-border mx-1" aria-hidden="true" />
        <AppHeaderActions />
      </div>
    </header>
  )
}
