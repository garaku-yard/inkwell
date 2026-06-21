import { useRef, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Bot, ChevronDown, Download, Upload } from "lucide-react"

import { AppHeaderActions } from "@/components/AppHeaderActions"
import { SyncControl } from "@/components/sync/SyncControl"
import { Button } from "@/components/ui/button"
import { ProjectKnowledgeButton } from "../ProjectKnowledgeButton"
import { ProjectNavMenu } from "./ProjectNavMenu"
import { SaveStatusPill } from "./SaveStatusPill"
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

export interface EditorHeaderImportItem {
  /** Menu/button label, e.g. "Markdown / Text (.md, .txt)". */
  label: string
  /** Accept filter for the file picker, e.g. ".md,.txt". */
  accept: string
  /** Called with the chosen file's text + name. The editor parses it and
   *  imports into the current project. */
  onFile: (text: string, fileName: string) => void
}

interface EditorHeaderProps {
  /** Title shown in the header h1. Usually `projectData.title`. */
  title: string
  /** One-line subtitle under the title — the format name (Novel,
   *  Lyrics, Comic Script, Tabletop RPG). */
  subtitle: string
  /** Right-side stat slot: word count, line count, page+panel count.
   *  Renders as `<span>` inside the right cluster. Omit to hide it (e.g.
   *  screenplay shows its scene count in the sidebar, not the header). */
  statRight?: ReactNode
  saveStatus: SaveStatus
  onToggleAI: () => void
  /** Whether the Writing Buddy panel is currently open. Drives
   *  aria-pressed so screen readers announce the toggle state. */
  isAIOpen?: boolean
  /** Items that populate the Export dropdown menu. Pass an empty list
   *  to hide the menu entirely (no current call site does that). */
  exportItems: EditorHeaderExportItem[]
  /** Import formats this editor accepts. Each opens a file picker and hands the
   *  chosen file's text to `onFile`. Omit/empty to hide the Import control. */
  importItems?: EditorHeaderImportItem[]
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
  importItems,
  extras,
  projectId,
  category,
}: EditorHeaderProps) {
  const router = useRouter()
  // One hidden file input drives every import item; the pending item's onFile +
  // accept are swapped in just before we open the picker.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingOnFile = useRef<EditorHeaderImportItem["onFile"] | null>(null)

  const triggerImport = (item: EditorHeaderImportItem) => {
    pendingOnFile.current = item.onFile
    const input = fileInputRef.current
    if (!input) return
    input.accept = item.accept
    input.value = "" // reset so re-selecting the same file still fires change
    input.click()
  }

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    pendingOnFile.current?.(text, file.name)
  }

  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-3 border-b shrink-0">
      {/* Left: back button + project title. */}
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => router.push("/dashboard")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold leading-tight">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {/* Center: cross-feature nav pills, balanced between the two side clusters. */}
      <div className="flex justify-center">
        {projectId && (
          <ProjectNavMenu projectId={projectId} category={category} current="editor" />
        )}
      </div>
      {/* Save status lives in a floating bottom-right pill, not the header. */}
      <SaveStatusPill status={saveStatus} />
      {/* Hidden picker shared by all import items (see triggerImport). */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChosen} />
      {/* Right: stats + import + export + actions. */}
      <div className="flex items-center justify-end gap-4 text-xs text-muted-foreground">
        {statRight != null && <span>{statRight}</span>}
        {extras}
        {importItems && importItems.length === 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => triggerImport(importItems[0])}
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
        )}
        {importItems && importItems.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                <Upload className="h-3.5 w-3.5" />
                Import
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {importItems.map((item) => (
                <DropdownMenuItem key={item.label} onClick={() => triggerImport(item)}>
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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
        <SyncControl projectId={projectId} />
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
