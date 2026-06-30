"use client"

import { useState, useCallback, useMemo, useRef } from "react"
import { Files, LayoutGrid, Plus, Square, User, MessageSquare, Captions, Zap, ArrowRightLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/AuthContext"
import { useTheme } from "@/lib/ThemeContext"
import { useToast } from "@/hooks/use-toast"
import { AIChatPanel } from "./AIChatPanel"
import { ProjectShell } from "./shared/ProjectShell"
import { EditorToolbar } from "./shared/EditorToolbar"
import { EmptyEditorState } from "./shared/EmptyEditorState"
import { useElementAutosave } from "./shared/useElementAutosave"
import { dispatchKey } from "@/lib/editor/keymap"
import { createComicKeymap, type ComicElementType as KeymapComicElementType } from "./comic/keymap"
import { exportProjectToText } from "@/lib/export/text-export"
import { useExportToast } from "@/lib/export/use-export-toast"
import { StableContentEditable } from "./shared/StableContentEditable"
import { RemoteCarets } from "./shared/RemoteCarets"
import { useEditorRealtime } from "./shared/useEditorRealtime"
import { useScrollSpy } from "./shared/useScrollSpy"
import {
  EditorSidebar,
  type EditorSidebarItem,
  type EditorSidebarCommentTarget,
} from "./shared/EditorSidebar"
import { useEditorComments } from "./shared/useEditorComments"
import { PagedSheets } from "./shared/PagedSheets"
import { type RailEntry } from "./shared/EditorToolRail"
import { paginate } from "@/lib/editor/paginate"
import {
  createScene,
  createSceneElement,
  type ProjectElement,
  type FullProject,
} from "@/services/project"
import { deleteScriptElement } from "@/services/editor"

// Element types follow standard Marvel/DC comic script conventions:
// panel       — visual action description for a panel
// character   — character name line (e.g. BATMAN or JOKER (off-panel))
// balloon     — dialogue that follows a character line
// caption     — narration caption box
// sfx         — sound effect
// transition  — page/scene transition (e.g. CUT TO—)
type ComicElementType = KeymapComicElementType

interface ComicScriptEditorProps {
  projectData: FullProject
}

type ComicScene = NonNullable<FullProject["scenes"]>[number]

/** One renderable unit on a comic-script sheet — a page header, the
 *  empty-page placeholder, or a single script element. Pagination packs
 *  these onto A4 sheets; every page header opens a fresh sheet. */
type ComicBlock =
  | { key: string; kind: "pageHead"; page: ComicScene; pageIdx: number; panels: number }
  | { key: string; kind: "emptyPage"; page: ComicScene }
  | { key: string; kind: "element"; page: ComicScene; el: ProjectElement; elIdx: number; panelNum: number }

/** Comic's element vocabulary for the right-edge tool rail. Mirrors the
 *  Marvel/DC script element set the old inline toolbar exposed. */
const COMIC_RAIL_ITEMS: RailEntry[] = [
  { type: "panel", label: "Panel", icon: Square },
  { type: "character", label: "Character", icon: User },
  { type: "balloon", label: "Dialogue", icon: MessageSquare },
  { type: "caption", label: "Caption", icon: Captions },
  { type: "sfx", label: "SFX", icon: Zap },
  { type: "transition", label: "Transition", icon: ArrowRightLeft },
]

function panelCount(elements: ProjectElement[]): number {
  return elements.filter(el => el.element_type === "panel").length
}

export function ComicScriptEditor({ projectData }: ComicScriptEditorProps) {
  const { user } = useAuth()
  const [pages, setPages] = useState(() => projectData.scenes ?? [])
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const pageRefs = useRef<Map<string, HTMLElement | null>>(new Map())
  const { saveStatus, scheduleSave } = useElementAutosave({ userId: user?.id })
  const runExport = useExportToast()
  const { toast } = useToast()
  const { editorFontStack } = useTheme()
  const {
    comments: projectComments,
    onAddComment,
    onUpdateComment,
    onDeleteComment,
    onToggleCommentResolved,
  } = useEditorComments(projectData.id)
  // Last-focused element — what a new comment attaches to (set by a single
  // focus listener on the scroll container that reads the focused el-<id>).
  const [focusedElementId, setFocusedElementId] = useState<string | null>(null)
  const activePageId = useScrollSpy({ refs: pageRefs, orderedIds: pages.map((p) => p.id) })

  // Live co-editing + remote carets (no-op on the desktop build).
  const writeSurfaceRef = useRef<HTMLDivElement | null>(null)
  const { broadcastEdit, subscribeCarets } = useEditorRealtime({
    projectId: projectData.id,
    userId: user?.id,
    setScenes: setPages,
    surfaceRef: writeSurfaceRef,
  })

  const totalPanels = pages.reduce((acc, p) => acc + panelCount(p.elements ?? []), 0)

  const activeCommentTarget = useMemo<EditorSidebarCommentTarget | null>(() => {
    if (focusedElementId) {
      for (const p of pages) {
        const el = (p.elements ?? []).find((e) => e.id === focusedElementId)
        if (el) return { item: el, isScene: false }
      }
    }
    // Fall back to the page in view so the Comments tab is never a dead end.
    const page = pages.find((p) => p.id === activePageId) ?? pages[0]
    return page ? { item: page, isScene: true } : null
  }, [focusedElementId, pages, activePageId])

  const sidebarItems = useMemo<EditorSidebarItem[]>(
    () =>
      pages.map((page, i) => {
        const pc = panelCount(page.elements ?? [])
        return {
          id: page.id,
          title: page.scene_heading || `Page ${i + 1}`,
          index: i + 1,
          meta: pc > 0 ? `${pc} panel${pc !== 1 ? "s" : ""}` : undefined,
          commentTargetIds: [page.id, ...(page.elements ?? []).map((e) => e.id)],
        }
      }),
    [pages],
  )

  const handleContentChange = useCallback((id: string, content: string, isScene: boolean) => {
    if (isScene) {
      setPages(prev => prev.map(p => p.id === id ? { ...p, scene_heading: content } : p))
    } else {
      setPages(prev => prev.map(p => ({
        ...p,
        elements: (p.elements ?? []).map(el => el.id === id ? { ...el, content } : el),
      })))
    }
    scheduleSave(id, content, isScene)
    broadcastEdit(id, content, isScene)
  }, [scheduleSave, broadcastEdit])

  const handleAddPage = async () => {
    if (!user?.id) return
    const page = await createScene(projectData.id, user.id, {
      scene_heading: "",
      content: "",
      order_index: pages.length,
    })
    setPages(prev => [...prev, { ...page, elements: [] }])
    setTimeout(() => {
      pageRefs.current.get(page.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 100)
  }

  const insertElement = async (
    pageId: string,
    type: ComicElementType,
    content: string,
    afterIdx?: number,
  ) => {
    if (!user?.id) return null
    const page = pages.find(p => p.id === pageId)
    if (!page) return null
    const insertAt = afterIdx !== undefined ? afterIdx + 1 : (page.elements?.length ?? 0)
    const el = await createSceneElement(projectData.id, pageId, user.id, {
      element_type: type,
      content,
      order_index: insertAt,
    })
    setPages(prev => prev.map(p => {
      if (p.id !== pageId) return p
      const els = [...(p.elements ?? [])]
      els.splice(insertAt, 0, el)
      return { ...p, elements: els }
    }))
    return el
  }

  const handleAddElement = async (pageId: string, type: ComicElementType, afterIdx?: number) => {
    const el = await insertElement(pageId, type, "", afterIdx)
    if (el) setTimeout(() => document.getElementById(`el-${el.id}`)?.focus(), 50)
  }

  const handleAddPanel = async (pageId: string, afterIdx?: number) => {
    const el = await insertElement(pageId, "panel", "", afterIdx)
    if (el) setTimeout(() => document.getElementById(`el-${el.id}`)?.focus(), 50)
  }

  const handleDeleteElement = useCallback(
    async (pageId: string, elementId: string) => {
      const ids: string[] = []
      for (const p of pages) {
        for (const el of p.elements ?? []) {
          ids.push(el.id)
        }
      }
      const idx = ids.indexOf(elementId)
      const prevId = idx > 0 ? ids[idx - 1] : null

      setPages((prev) =>
        prev.map((p) =>
          p.id !== pageId
            ? p
            : { ...p, elements: (p.elements ?? []).filter((el) => el.id !== elementId) },
        ),
      )
      try {
        await deleteScriptElement(elementId)
      } catch (err) {
        console.error("Failed to delete element:", err)
        toast({
          title: "Couldn't delete that element",
          description: err instanceof Error ? err.message : "Try again, or refresh if it persists.",
          variant: "destructive",
        })
      }
      if (prevId) {
        setTimeout(() => {
          document.getElementById(`el-${prevId}`)?.focus()
        }, 50)
      }
    },
    [pages, toast],
  )

  const keyMap = useMemo(
    () =>
      createComicKeymap({
        pages,
        insertElementAfter: (pageId, type, afterIdx) =>
          void handleAddElement(pageId, type, afterIdx),
        deleteEmptyElement: (pageId, elementId) => void handleDeleteElement(pageId, elementId),
      }),
    // handleAddElement intentionally omitted to avoid re-creating the keymap each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pages, handleDeleteElement],
  )

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLDivElement>,
      pageId: string,
      el: ProjectElement,
      elIdx: number,
    ) => {
      dispatchKey(e, keyMap, {
        pageId,
        elementId: el.id,
        elementType: el.element_type as ComicElementType,
        elementIndex: elIdx,
      })
    },
    [keyMap],
  )

  // Pack each page's header + elements onto A4 sheets; every page opens a
  // fresh sheet (one comic page = one manuscript sheet).
  const sheets = useMemo<ComicBlock[][]>(() => {
    const blocks: ComicBlock[] = []
    pages.forEach((page, pageIdx) => {
      const els = page.elements ?? []
      blocks.push({ key: `head-${page.id}`, kind: "pageHead", page, pageIdx, panels: panelCount(els) })
      if (els.length === 0) {
        blocks.push({ key: `empty-${page.id}`, kind: "emptyPage", page })
        return
      }
      let panelNum = 0
      els.forEach((el, elIdx) => {
        if (el.element_type === "panel") panelNum++
        blocks.push({ key: el.id, kind: "element", page, el, elIdx, panelNum })
      })
    })
    const estimate = (b: ComicBlock): number => {
      if (b.kind === "pageHead") return 70
      if (b.kind === "emptyPage") return 48
      switch (b.el.element_type) {
        case "panel":
          return 64
        case "caption":
          return 56
        case "sfx":
          return 44
        default:
          return 34
      }
    }
    return paginate(blocks, estimate, { maxHeight: 940, startsNewSheetBefore: (b) => b.kind === "pageHead" })
  }, [pages])

  // Rail click: insert after the focused element, else append to the page in view.
  const handleRailSelect = (type: string) => {
    let pageId: string | undefined
    let afterIdx: number | undefined
    if (focusedElementId) {
      for (const p of pages) {
        const idx = (p.elements ?? []).findIndex((e) => e.id === focusedElementId)
        if (idx >= 0) {
          pageId = p.id
          afterIdx = idx
          break
        }
      }
    }
    pageId = pageId ?? activePageId ?? pages[0]?.id
    if (!pageId) return
    void handleAddElement(pageId, type as ComicElementType, afterIdx)
  }

  /** Render one script element with its per-type comic styling. */
  const renderComicElement = (page: ComicScene, el: ProjectElement, elIdx: number, panelNum: number) => {
    if (el.element_type === "panel") {
      return (
        <div className={cn("mt-6", elIdx === 0 && "mt-0")}>
          <div className="text-xs font-bold uppercase tracking-widest text-primary mb-1 select-none">
            Panel {panelNum}
          </div>
          <StableContentEditable
            id={`el-${el.id}`}
            value={el.content}
            onValueChange={(next) => handleContentChange(el.id, next, false)}
            onKeyDown={(e) => handleKeyDown(e, page.id, el, elIdx)}
            className="outline-none text-sm leading-relaxed min-h-[1.4rem] empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 empty:before:not-italic"
            data-placeholder="Panel description…"
          />
        </div>
      )
    }
    if (el.element_type === "character") {
      return (
        <div className="mt-4">
          <StableContentEditable
            id={`el-${el.id}`}
            value={el.content}
            onValueChange={(next) => handleContentChange(el.id, next, false)}
            onKeyDown={(e) => handleKeyDown(e, page.id, el, elIdx)}
            className="outline-none text-sm font-bold uppercase tracking-wide min-h-[1.2rem] empty:before:content-['CHARACTER'] empty:before:text-muted-foreground/50"
          />
        </div>
      )
    }
    if (el.element_type === "balloon") {
      return (
        <div className="pl-4">
          <StableContentEditable
            id={`el-${el.id}`}
            value={el.content}
            onValueChange={(next) => handleContentChange(el.id, next, false)}
            onKeyDown={(e) => handleKeyDown(e, page.id, el, elIdx)}
            className="outline-none text-sm leading-relaxed min-h-[1.4rem] empty:before:content-['Dialogue…'] empty:before:text-muted-foreground/50"
          />
        </div>
      )
    }
    if (el.element_type === "caption") {
      return (
        <div className="mt-3 border-l-2 border-muted pl-3">
          <div className="text-xs uppercase tracking-widest text-muted-foreground/60 mb-0.5 select-none">Caption</div>
          <StableContentEditable
            id={`el-${el.id}`}
            value={el.content}
            onValueChange={(next) => handleContentChange(el.id, next, false)}
            onKeyDown={(e) => handleKeyDown(e, page.id, el, elIdx)}
            className="outline-none text-sm italic leading-relaxed min-h-[1.4rem] empty:before:content-['Caption\00a0text…'] empty:before:text-muted-foreground/50"
          />
        </div>
      )
    }
    if (el.element_type === "sfx") {
      return (
        <div className="mt-3">
          <div className="text-xs uppercase tracking-widest text-muted-foreground/60 mb-0.5 select-none">SFX</div>
          <StableContentEditable
            id={`el-${el.id}`}
            value={el.content}
            onValueChange={(next) => handleContentChange(el.id, next, false)}
            onKeyDown={(e) => handleKeyDown(e, page.id, el, elIdx)}
            className="outline-none text-base font-black uppercase tracking-wider min-h-[1.4rem] empty:before:content-['KRAKKK!!!'] empty:before:text-muted-foreground/50"
          />
        </div>
      )
    }
    if (el.element_type === "transition") {
      return (
        <div className="mt-4 text-right">
          <StableContentEditable
            id={`el-${el.id}`}
            value={el.content}
            onValueChange={(next) => handleContentChange(el.id, next, false)}
            onKeyDown={(e) => handleKeyDown(e, page.id, el, elIdx)}
            className="outline-none text-xs uppercase tracking-widest text-muted-foreground min-h-[1.2rem] empty:before:content-['CUT\00a0TO—'] empty:before:text-muted-foreground/50"
          />
        </div>
      )
    }
    return null
  }

  /** Render any block — page header, empty-page placeholder, or element. */
  const renderBlock = (b: ComicBlock) => {
    if (b.kind === "pageHead") {
      return (
        <div ref={(el) => { pageRefs.current.set(b.page.id, el) }} className="mb-6">
          <StableContentEditable
            id={`head-${b.page.id}`}
            value={b.page.scene_heading ?? ""}
            onValueChange={(next) => handleContentChange(b.page.id, next, true)}
            className="text-sm font-bold uppercase tracking-widest outline-none inline-block empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50"
            data-placeholder={`PAGE ${b.pageIdx + 1}`}
          />
          {b.panels > 0 && (
            <span className="text-sm font-bold text-muted-foreground ml-2">
              ({b.panels} {b.panels === 1 ? "PANEL" : "PANELS"})
            </span>
          )}
        </div>
      )
    }
    if (b.kind === "emptyPage") {
      return (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1 font-sans -ml-2 text-muted-foreground/60"
          onClick={() => handleAddPanel(b.page.id)}
        >
          <Plus className="h-3 w-3" /> Add panel
        </Button>
      )
    }
    return renderComicElement(b.page, b.el, b.elIdx, b.panelNum)
  }

  return (
    <ProjectShell
      projectId={projectData.id}
      title={projectData.title}
      category={projectData.category}
      current="editor"
      sidebar={
      /* Pages sidebar — shared rail with list + comments. */
      <EditorSidebar
        headerIcon={Files}
        headerLabel="Pages"
        stats={[
          { icon: Files, label: `${pages.length} ${pages.length === 1 ? "page" : "pages"}` },
          { icon: LayoutGrid, label: `${totalPanels} ${totalPanels === 1 ? "panel" : "panels"}` },
        ]}
        items={sidebarItems}
        activeItemId={activePageId}
        onItemClick={(id) => pageRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        addLabel="Add page"
        onAdd={handleAddPage}
        emptyLabel="No pages yet."
        comments={projectComments}
        activeCommentTarget={activeCommentTarget}
        onAddComment={onAddComment}
        onUpdateComment={onUpdateComment}
        onDeleteComment={onDeleteComment}
        onToggleCommentResolved={onToggleCommentResolved}
      />
      }
      toolbar={
        <EditorToolbar
          title={projectData.title}
          projectId={projectData.id}
          category={projectData.category}
          saveStatus={saveStatus}
          onToggleAI={() => setIsAIChatOpen(o => !o)}
          isAIOpen={isAIChatOpen}
          exportItems={[
            {
              label: "Export as Plain Text (.txt)",
              onClick: () => void runExport({
                extension: "txt",
                projectTitle: projectData.title,
                run: () => exportProjectToText({ ...projectData, scenes: pages }),
              }),
            },
            {
              label: "Export as Comic Book Zip (.cbz)",
              onClick: () => void runExport({
                extension: "cbz",
                projectTitle: projectData.title,
                run: async () => {
                  // fflate is heavy — load it only when the user exports.
                  const { exportComicToCBZ } = await import("@/lib/export/comic-cbz")
                  await exportComicToCBZ({ ...projectData, scenes: pages })
                },
              }),
            },
          ]}
        />
      }
    >
        <div
          ref={writeSurfaceRef}
          className="relative flex h-full overflow-hidden"
          onFocus={(e) => {
            const id = (e.target as HTMLElement)?.id
            if (id?.startsWith("el-")) setFocusedElementId(id.slice(3))
          }}
        >
          <PagedSheets
            pages={sheets}
            renderBlock={renderBlock}
            fontFamily={editorFontStack("comic")}
            railItems={COMIC_RAIL_ITEMS}
            onRailSelect={handleRailSelect}
            railStorageKey="editor.rail.comic"
            pageIdPrefix="comic-page"
            isEmpty={pages.length === 0}
            emptyState={
              <EmptyEditorState
                message="No pages yet."
                actionLabel="Add first page"
                onAction={handleAddPage}
              />
            }
          />
          <AIChatPanel isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} category={projectData.category} projectId={projectData.id} />
          <RemoteCarets containerRef={writeSurfaceRef} subscribeCarets={subscribeCarets} />
        </div>
    </ProjectShell>
  )
}
