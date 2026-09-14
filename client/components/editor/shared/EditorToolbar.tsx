"use client"

/**
 * EditorToolbar — the slim, view-specific action row an editor renders into
 * {@link ProjectShell}'s `toolbar` slot. It carries the things that change with
 * the editor (import, export, the Writing Buddy toggle, vault-as-knowledge) plus
 * a `leading` slot for per-format view switches like Interactive Fiction's
 * Write/Graph/Play. The generic header above it (back, title, the cross-feature
 * nav, sync, app actions) stays identical across every view.
 *
 * It carries the universal "export as .iw" item alongside each format's own
 * import/export, so every editor keeps a lossless export regardless of format.
 */

import { useRef, type ReactNode } from "react"
import { Bot, ChevronDown, Download, Upload } from "lucide-react"

import { useAuth } from "@/lib/AuthContext"
import { exportProjectToIw } from "@/lib/export/iw"
import { useExportToast } from "@/lib/export/use-export-toast"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import { ProjectKnowledgeButton } from "../ProjectKnowledgeButton"
import { SaveStatusPill } from "./SaveStatusPill"
import type { SaveStatus } from "./useElementAutosave"

/** An entry in an editor's Export menu. */
export interface EditorToolbarExportItem {
  label: string
  onClick: () => void
}

/** An import format an editor accepts. Each opens a file picker and hands the
 *  chosen file's text + name to `onFile`, which parses and imports it. */
export interface EditorToolbarImportItem {
  /** Menu/button label, e.g. "Markdown / Text (.md, .txt)". */
  label: string
  /** Accept filter for the file picker, e.g. ".md,.txt". */
  accept: string
  onFile: (text: string, fileName: string) => void
}

interface EditorToolbarProps {
  /** Project title — used to name the universal `.iw` export. */
  title: string
  projectId?: string
  category?: string
  saveStatus: SaveStatus
  onToggleAI: () => void
  /** Whether the Writing Buddy panel is open (drives aria-pressed). */
  isAIOpen?: boolean
  /** Per-format export items; the lossless `.iw` export is appended here. */
  exportItems: EditorToolbarExportItem[]
  /** Import formats this editor accepts. Omit/empty to hide the Import control. */
  importItems?: EditorToolbarImportItem[]
  /** Leading controls, pinned left (e.g. IF's Write/Graph/Play switch). */
  leading?: ReactNode
}

/** The view-specific action row for editors hosted inside ProjectShell. */
export function EditorToolbar({
  title,
  projectId,
  category,
  saveStatus,
  onToggleAI,
  isAIOpen,
  exportItems,
  importItems,
  leading,
}: EditorToolbarProps) {
  const { user } = useAuth()
  const runExport = useExportToast()

  // Universal lossless "save the whole project as .iw", appended to every
  // non-vault editor's Export menu. See lib/iw/format.
  const allExportItems: EditorToolbarExportItem[] =
    projectId && category && category !== "vault" && user?.id
      ? [
          ...exportItems,
          {
            label: "Inkwell project (.iw)",
            onClick: () =>
              void runExport({
                extension: "iw",
                projectTitle: title,
                run: () => exportProjectToIw(projectId, user.id),
              }),
          },
        ]
      : exportItems

  // One hidden file input drives every import item; the pending item's onFile +
  // accept are swapped in just before we open the picker.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingOnFile = useRef<EditorToolbarImportItem["onFile"] | null>(null)

  const triggerImport = (item: EditorToolbarImportItem) => {
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
    <div className="flex h-11 shrink-0 items-center justify-between gap-4 border-b bg-background px-4">
      {/* Left: per-format view controls. */}
      <div className="flex min-w-0 items-center gap-2">{leading}</div>

      {/* Hidden picker shared by all import items (see triggerImport). */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChosen} />

      {/* Right: import + export + knowledge + Writing Buddy. */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
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
        {allExportItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" />
                Export
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {allExportItems.map((item) => (
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
      </div>

      {/* Floating bottom-right save pill (rendered here, positioned fixed). */}
      <SaveStatusPill status={saveStatus} avoidRightPanel={isAIOpen} />
    </div>
  )
}
