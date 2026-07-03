"use client"

/**
 * ProjectShell — the shared chrome for a project's non-editor views (Beat Board,
 * and later Outline / Analytics): the left chapter rail + the top bar (back,
 * title, the Editor/Beat Board/Outline/Analytics nav, optional per-view actions,
 * and the app actions). It exists so switching tabs keeps the same workspace
 * layout instead of jumping to a bespoke page.
 *
 * The rail is list-only here (navigation): clicking a chapter jumps to it in the
 * Editor. The editors keep their own richer EditorSidebar (comments + scroll-to)
 * for now; migrating them onto this shell is a later stage. Stable per-format
 * labels come from the caller (`chapterLabel`).
 */

import React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, BookText } from "lucide-react"

import { AppHeaderActions } from "@/components/AppHeaderActions"
import { SyncControl } from "@/components/sync/SyncControl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { PresenceProvider, useProjectPresence } from "@/lib/realtime/PresenceContext"
import { ProjectNavMenu } from "./ProjectNavMenu"
import { PresenceBar } from "./PresenceBar"

export interface ProjectShellChapter {
  id: string
  title: string
}

/** Human format names for the header subtitle, so every view reads the same as
 *  the editor ("Interactive Fiction", "Tabletop RPG", …). */
const FORMAT_NAMES: Record<string, string> = {
  screenplay: "Screenplay",
  novel: "Novel",
  memoir: "Memoir",
  comic: "Comic Script",
  poetry: "Poetry",
  lyrics: "Lyrics",
  interactive_fiction: "Interactive Fiction",
  ttrpg: "Tabletop RPG",
  vault: "Vault",
  board: "Board",
}

interface ProjectShellProps {
  projectId: string
  title: string
  category?: string
  current: "editor" | "beat-board" | "outline-editor" | "analytics"
  /** The project's chapters/units, format-labelled by `chapterLabel`. Used by the
   *  built-in navigation rail; ignored when a custom `sidebar` is supplied. */
  chapters?: ProjectShellChapter[]
  /** Plural rail label, matching the editor's (Chapters / Pages / Poems / …). */
  chapterLabel?: string
  /** Click handler for a chapter; defaults to navigating to it in the Editor. */
  onChapterSelect?: (id: string) => void
  /** Replaces the built-in chapter rail entirely. The editors pass their richer
   *  EditorSidebar here (search + comments + scroll-to) while the beat board /
   *  outline / analytics views fall back to the built-in list rail. */
  sidebar?: React.ReactNode
  /** A slim view-specific toolbar rendered directly under the generic header
   *  (e.g. the editor's Write/Graph/Play switch + import/export/AI). The header
   *  itself stays generic across every view. */
  toolbar?: React.ReactNode
  /** Per-view actions rendered in the header before the app actions. */
  headerActions?: React.ReactNode
  children: React.ReactNode
}

export function ProjectShell({
  projectId,
  title,
  category,
  current,
  chapters = [],
  chapterLabel = "Chapters",
  onChapterSelect,
  sidebar,
  toolbar,
  headerActions,
  children,
}: ProjectShellProps) {
  const router = useRouter()
  const selectChapter =
    onChapterSelect ?? (() => router.push(`/projects/editor?id=${projectId}`))

  return (
    <PresenceProvider projectId={projectId}>
    <div className="flex h-screen bg-background">
      {/* Left rail — the editor's own sidebar when supplied, otherwise the
          built-in list rail (mirrors the editor's, list-only for navigation). */}
      {sidebar ?? (
      <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar">
        <div className="shrink-0 space-y-2 border-b p-3">
          <div className="flex items-center gap-2">
            <BookText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{chapterLabel}</span>
          </div>
          <Badge variant="secondary" className="gap-1 font-normal">
            {chapters.length} {chapterLabel.toLowerCase()}
          </Badge>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2">
          {chapters.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">Nothing here yet.</p>
          ) : (
            chapters.map((ch, i) => (
              <button
                key={ch.id}
                onClick={() => selectChapter(ch.id)}
                className="group w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-accent"
              >
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <span className="shrink-0 text-xs text-muted-foreground/50">{i + 1}</span>
                  <span className="truncate text-sm text-muted-foreground group-hover:text-foreground">
                    {ch.title || "Untitled"}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>
      )}

      {/* Main column — header + the view's content. The header is generic to all
          views: back + title (left), the view nav centered, app actions (right).
          View-specific controls live in the view's own toolbar, not here. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b bg-background px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Link>
            </Button>
            <div className="h-5 w-px bg-border" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold leading-tight">{title}</h1>
              {category && FORMAT_NAMES[category] && (
                <p className="truncate text-xs text-muted-foreground">{FORMAT_NAMES[category]}</p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-center">
            {projectId && <ProjectNavMenu projectId={projectId} category={category} current={current} />}
          </div>
          <div className={cn("flex items-center justify-end gap-2")}>
            {headerActions}
            <HeaderPresence />
            <SyncControl projectId={projectId} />
            <AppHeaderActions />
          </div>
        </header>
        {toolbar}
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
    </PresenceProvider>
  )
}

/** The header's live-presence avatars, reading the shared connection. Split out
 *  so it sits inside the PresenceProvider that wraps the shell. */
function HeaderPresence() {
  const { peers } = useProjectPresence()
  return <PresenceBar peers={peers} />
}
