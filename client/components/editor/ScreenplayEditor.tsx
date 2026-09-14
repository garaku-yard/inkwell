"use client"

import type React from "react"
import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import { useDebouncedCallback } from "use-debounce"
import { ProjectShell } from "./shared/ProjectShell"
import { EditorToolbar } from "./shared/EditorToolbar"
import { type RailEntry } from "./shared/EditorToolRail"
import { PagedSheets, type SheetMetrics } from "./shared/PagedSheets"
import { RemoteCarets } from "./shared/RemoteCarets"
import { useEditorRealtime } from "./shared/useEditorRealtime"
import { paginate } from "@/lib/editor/paginate"
import { SidePanel } from "./SidePanel"
import { EditableElement } from "./EditableElement"
import { parseFdx } from "@/lib/import/screenplay-fdx"
import { importIntoProject } from "@/lib/import/import-into-project"
import {
  updateElementContent,
  updateSceneHeading,
  getFullProject,
  type FullProject,
  type Scene,
  type ProjectElement,
} from "@/services/project"
import { dispatchKey } from "@/lib/editor/keymap";
import { createScreenplayKeymap } from "./screenplay/keymap";
import { ELEMENT_ORDER, SCRIPT_ELEMENT_CONFIG, type ToolbarScriptElementType } from "@/lib/helpers/screenplay-config"
import { AIChatPanel } from "./AIChatPanel"
import { useScreenplayElements } from "./screenplay/useScreenplayElements"
import { useEditorComments } from "./shared/useEditorComments"
import { useAuth } from "@/lib/AuthContext"
import { useTheme } from "@/lib/ThemeContext"
import { exportScreenplayToFDX } from "@/lib/export/screenplay-fdx"
import { useExportToast } from "@/lib/export/use-export-toast"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type ScriptItem = { type: "SCENE_HEADING"; data: Scene } | { type: "ELEMENT"; data: ProjectElement }

interface ScreenplayEditorProps {
  projectData: FullProject
}

/** Screenplay element vocabulary for the right-edge tool rail — the
 *  active (non "coming soon") element types in script order. Clicking one
 *  transforms the focused element or inserts a fresh one; with nothing focused,
 *  Scene starts a new scene and everything else inserts. */
const SCREENPLAY_RAIL_ITEMS: RailEntry[] = ELEMENT_ORDER.filter(
  (type) => !("comingSoon" in SCRIPT_ELEMENT_CONFIG[type] && SCRIPT_ELEMENT_CONFIG[type].comingSoon),
).map((type) => ({
  type,
  label: SCRIPT_ELEMENT_CONFIG[type].tooltip,
  icon: SCRIPT_ELEMENT_CONFIG[type].icon,
}))

/** True US-Letter geometry for the screenplay sheets. Page count is semantic
 *  here (1 page ≈ 1 minute of screen time), so the 8.5×11in paper and inch
 *  margins are preserved exactly from the old EditorPane. */
const US_LETTER: SheetMetrics = {
  width: "8.5in",
  minHeight: "11in",
  paddingClass: "pt-[1in] pb-[1in] pl-[1.5in] pr-[1in]",
  contentClass: "text-[12pt] leading-[1.5]",
  pageNumber: { position: "top-right", render: (n) => `Page ${n}` },
}

/** One renderable unit on a screenplay page — a scene heading or an element,
 *  carrying its precomputed owning-scene id so renderBlock stays dumb. */
type ScreenplayBlock = { key: string; item: ScriptItem; currentSceneId: string }

// Page-height estimate constants, ported verbatim from the old EditorPane so the
// page count is byte-for-byte identical (US Letter: 9in content × 96 DPI).
const PAGE_CONTENT_HEIGHT = 9 * 96 // 864px
const LINE_HEIGHT = 24 // 12pt at 1.5 line-height
const ELEMENT_PADDING = 8 // py-1 = 4px top + 4px bottom

function estimateScreenplayBlock(b: ScreenplayBlock): number {
  const content = b.item.type === "SCENE_HEADING" ? b.item.data.scene_heading : b.item.data.content
  const lines = Math.max(1, Math.ceil((content?.length || 0) / 60))
  return lines * LINE_HEIGHT + ELEMENT_PADDING
}


/** Interactive empty state for a script with no scenes yet. Focusable, and
 *  creates the first scene on a double-Enter (matching the original behaviour). */
function ScreenplayEmptyState({ onAddNewScene }: { onAddNewScene: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const lastEnterRef = useRef(0)
  const DOUBLE_ENTER_THRESHOLD = 300

  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return
    e.preventDefault()
    const now = Date.now()
    if (now - lastEnterRef.current < DOUBLE_ENTER_THRESHOLD) onAddNewScene()
    lastEnterRef.current = now
  }

  return (
    <div
      ref={ref}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex h-full items-start justify-center pt-20 outline-none"
    >
      <div className="text-muted-foreground text-sm text-center">
        <p className="mb-2">
          Press <kbd className="px-2 py-1 bg-muted rounded border">Enter</kbd> twice to create a new scene
        </p>
        <p>or click Scene in the toolbar</p>
      </div>
    </div>
  )
}

export function ScreenplayEditor({ projectData: initialProjectData }: ScreenplayEditorProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const { editorFontStack } = useTheme()
  const runExport = useExportToast()
  const [project, setProject] = useState<FullProject>(initialProjectData)
  const [activeElementId, setActiveElementId] = useState<string | null>(null)
  const [activeElementType, setActiveElementType] = useState<ToolbarScriptElementType | "SCENE_HEADING" | null>(null)
  const [focusAtEndId, setFocusAtEndId] = useState<string | null>(null)
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const elementRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const sidePanelRef = useRef<HTMLDivElement>(null)

  // Live co-editing + remote carets (no-op on the desktop build). The shared
  // hook works on a Scene[] setter, so adapt the FullProject state to one.
  const writeSurfaceRef = useRef<HTMLDivElement | null>(null)
  const setScenes = useCallback((value: React.SetStateAction<Scene[]>) => {
    setProject((p) => ({
      ...p,
      scenes: typeof value === "function" ? (value as (s: Scene[]) => Scene[])(p.scenes ?? []) : value,
    }))
  }, [])
  // The scene the caret sits in — derived from the focused element (which may be
  // a scene heading or one of its elements) — reported as focus so screenplay
  // users take part in presence "editing X" and durable soft-locks. Screenplay's
  // writing surface is paginated (no scene rail on the page), so the soft-lock
  // pips live in the SidePanel's scene lists (peersByElement, keyed by scene id);
  // the header presence bar covers who else is in the room.
  const activeScene = activeElementId
    ? (project.scenes ?? []).find(
        (s) => s.id === activeElementId || (s.elements ?? []).some((el) => el.id === activeElementId),
      )
    : undefined
  const { broadcastEdit, subscribeCarets, peersByElement } = useEditorRealtime({
    projectId: project.id,
    userId: user?.id,
    scenes: project.scenes ?? [],
    setScenes,
    surfaceRef: writeSurfaceRef,
    focusId: activeScene?.id,
    focusLabel: activeScene?.scene_heading || "Untitled",
  })

  // Comments use the same shared model as the other five editors: a flat list
  // loaded once + reload-after-write. The inline EditableElement badge and the
  // SidePanel both derive from this list (see unresolvedCountByElement below).
  const {
    comments: projectComments,
    onAddComment: handleAddComment,
    onUpdateComment: handleUpdateComment,
    onDeleteComment: handleDeleteComment,
    onToggleCommentResolved: handleToggleCommentResolved,
  } = useEditorComments(project.id)

  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasInitialFocused = useRef(false)

  const handleFocusHandled = useCallback(() => {
    setFocusAtEndId(null)
  }, [])

  const debouncedSave = useDebouncedCallback((id: string, content: string, isScene: boolean) => {
    if (id.startsWith("new-")) return
    if (!user?.id) return

    setIsSaving(true)
    if (isScene) {
      updateSceneHeading(id, user.id, content)
        .catch((err) => console.error("Scene save failed:", err))
        .finally(() => setIsSaving(false))
    } else {
      updateElementContent(id, user.id, content)
        .catch((err) => console.error("Element save failed:", err))
        .finally(() => setIsSaving(false))
    }
  }, 2000)

  const allScenes = useMemo(() => project?.scenes || [], [project.scenes])
  const totalScenes = allScenes.length
  const totalElements = useMemo(
    () => allScenes.reduce((acc, scene) => acc + (scene.elements?.length || 0), 0),
    [allScenes],
  )

  const flattenedScriptItems: ScriptItem[] = useMemo(() => {
    if (!project?.scenes?.length) return []

    return project.scenes.flatMap((scene) => [
      { type: "SCENE_HEADING", data: scene },
      ...(scene.elements?.map((el): ScriptItem => ({ type: "ELEMENT", data: el })) || []),
    ])
  }, [project.scenes])

  // Scroll an element into view by its own DOM node. Nothing is virtualized, so
  // every element is always mounted in elementRefs — landing on the element
  // itself is more precise than the old scroll-to-its-page-center hop.
  const scrollToElement = useCallback((elementId: string) => {
    elementRefs.current.get(elementId)?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])

  // Helper function to focus an element and place cursor at end
  const focusElementAtEnd = useCallback((elementId: string, delay: number = 100) => {
    setTimeout(() => {
      const element = elementRefs.current.get(elementId)
      if (element) {
        element.focus()
        // Place cursor at end after focus
        requestAnimationFrame(() => {
          const selection = window.getSelection()
          if (selection && element) {
            const range = document.createRange()
            range.selectNodeContents(element)
            range.collapse(false) // false = collapse to end
            selection.removeAllRanges()
            selection.addRange(range)
          }
        })
      }
    }, delay)
  }, [])

  // Focus the last element when opening the project. All elements mount on the
  // first render (no virtualization), so focusElementAtEnd's own timeout +
  // requestAnimationFrame is enough — no 500ms / double-rAF dance needed.
  useEffect(() => {
    if (hasInitialFocused.current || flattenedScriptItems.length === 0) return
    hasInitialFocused.current = true
    const lastId = flattenedScriptItems[flattenedScriptItems.length - 1].data.id
    scrollToElement(lastId)
    focusElementAtEnd(lastId, 0)
  }, [flattenedScriptItems, scrollToElement, focusElementAtEnd])

  // Unresolved-comment count per element/scene id, derived from the flat list —
  // drives the inline badge in EditableElement (and matches how SidePanel
  // counts). Recomputed only when the comment list changes.
  const unresolvedCountByElement = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of projectComments) {
      if (c.isResolved || !c.elementId) continue
      map.set(c.elementId, (map.get(c.elementId) ?? 0) + 1)
    }
    return map
  }, [projectComments])

  const handleContentChange = useCallback(
    (id: string, content: string, isScene: boolean) => {
      debouncedSave(id, content, isScene)
      broadcastEdit(id, content, isScene)
    },
    [debouncedSave, broadcastEdit],
  )

  const handleFinalizeUpdate = useCallback(
    (id: string, content: string, isScene: boolean) => {
      debouncedSave.cancel()

      if (id.startsWith("new-")) return
      if (!user?.id) return

      // Sync the finalised content into React state so the sidebar (scene list,
      // structure tab) reflects what the user actually typed. We only do this on
      // blur, not on every keystroke — contentEditable owns keystroke-level state
      // to avoid a re-render cascade across all elements while typing.
      setProject((prevProject) => {
        if (!prevProject.scenes) return prevProject
        const newScenes = prevProject.scenes.map((scene: Scene) => {
          if (isScene && scene.id === id) {
            return { ...scene, scene_heading: content }
          }
          if (!isScene && scene.elements?.some((el: ProjectElement) => el.id === id)) {
            return {
              ...scene,
              elements: scene.elements.map((el: ProjectElement) =>
                el.id === id ? { ...el, content } : el,
              ),
            }
          }
          return scene
        })
        return { ...prevProject, scenes: newScenes }
      })

      if (isScene) {
        updateSceneHeading(id, user.id, content).catch((err) => console.error("Scene save failed on blur:", err))
      } else {
        updateElementContent(id, user.id, content).catch((err) => console.error("Element save failed on blur:", err))
      }
    },
    [debouncedSave, user?.id],
  )

  const handleFocus = useCallback((id: string, type: ToolbarScriptElementType | "SCENE_HEADING" | null) => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }
    setActiveElementId(id)
    if (type && type !== "SCENE_HEADING") {
      setActiveElementType(type)
    } else {
      setActiveElementType(null)
    }
  }, [])

  const handleBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => {
      // Keep the active element when focus moves into the side panel (e.g.
      // clicking a comment). Rail clicks are handled separately —
      // handleRailSelect cancels this timeout before it can fire.
      if (sidePanelRef.current && sidePanelRef.current.contains(document.activeElement)) {
        return
      }
      setActiveElementId(null)
      setActiveElementType(null)
    }, 50)
  }, [])

  const {
    handleInsertElement,
    handleTransformElement,
    handleDeleteElement,
    handleDeleteScene,
    handleSelectAll,
    handleChangeElementType,
    handleNavigateToPrevious,
    handleNavigateToNext,
    handleAddNewScene,
  } = useScreenplayElements({
    project,
    setProject,
    activeElementId,
    setActiveElementType,
    flattenedScriptItems,
    allScenes,
    elementRefs,
    scrollToElement,
    focusElementAtEnd,
    userId: user?.id,
    toast,
  })

  const keyMap = useMemo(() => createScreenplayKeymap({
    handleFinalizeUpdate,
    handleInsertElement,
    handleDeleteScene,
    handleDeleteElement,
    handleSelectAll,
    handleChangeElementType,
    handleNavigateToPrevious,
    handleNavigateToNext,
    handleAddNewScene,
  }), [
    handleFinalizeUpdate,
    handleInsertElement,
    handleDeleteScene,
    handleDeleteElement,
    handleSelectAll,
    handleChangeElementType,
    handleNavigateToPrevious,
    handleNavigateToNext,
    handleAddNewScene,
  ]);

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLDivElement>,
      elementId: string,
      isScene: boolean,
      elementType: ToolbarScriptElementType | "SCENE_HEADING",
    ) => {
      dispatchKey(e, keyMap, { elementId, isScene, elementType });
    },
    [keyMap],
  );

  // Rail click — with an element focused, retype it (unless it's already that
  // type); with nothing focused, Scene starts a new scene and everything else
  // inserts. The rail lives in the page margin, so clicking it blurs the editor;
  // cancel the pending blur-clear first so the active element survives until the
  // transform runs (handleTransformElement reads activeElementId).
  const handleRailSelect = useCallback(
    (type: string) => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current)
        blurTimeoutRef.current = null
      }
      const t = type as ToolbarScriptElementType | "SCENE_HEADING"
      if (activeElementId) {
        if (activeElementType !== t) handleTransformElement(t)
      } else if (t === "SCENE_HEADING") {
        handleAddNewScene()
      } else {
        handleInsertElement(t as ToolbarScriptElementType)
      }
    },
    [activeElementId, activeElementType, handleTransformElement, handleInsertElement, handleAddNewScene],
  )

  const toggleAIChat = useCallback(() => {
    setIsAIChatOpen((prev) => !prev)
  }, [])

  // Import a Final Draft (.fdx) file as new scenes appended to THIS project
  // (the dashboard's Import still creates a new project — editor Import imports
  // into the open one).
  const handleImportFdx = async (text: string, fileName: string) => {
    if (!user?.id) return
    try {
      const parsed = parseFdx(text)
      const created = await importIntoProject(project.id, user.id, parsed, project.scenes?.length ?? 0)
      setProject((prev) => ({ ...prev, scenes: [...(prev.scenes ?? []), ...created] }))
      if (created[0]) scrollToElement(created[0].id)
      const word = created.length === 1 ? "scene" : "scenes"
      toast({ title: "Import complete", description: `Added ${created.length} ${word} from ${fileName}.` })
    } catch (err) {
      console.error("Failed to import FDX:", err)
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : "Couldn't import that file.",
        variant: "destructive",
      })
    }
  }

  // Pack scene headings + elements onto US-Letter sheets. The estimate is the
  // old EditorPane's verbatim, so the page count is identical; no
  // startsNewSheetBefore — a scene mid-page is correct for screenplays.
  const pages = useMemo<ScreenplayBlock[][]>(() => {
    const blocks: ScreenplayBlock[] = flattenedScriptItems.map((item) => ({
      key: item.data.id,
      item,
      currentSceneId: item.type === "SCENE_HEADING" ? item.data.id : (item.data.scene_id || ""),
    }))
    return paginate(blocks, estimateScreenplayBlock, { maxHeight: PAGE_CONTENT_HEIGHT })
  }, [flattenedScriptItems])

  const renderBlock = useCallback(
    (b: ScreenplayBlock) => (
      <div className="relative">
        <EditableElement
          ref={(el) => { elementRefs.current.set(b.item.data.id, el) }}
          element={b.item.data}
          onContentChange={handleContentChange}
          onFinalizeUpdate={handleFinalizeUpdate}
          onKeyDown={handleKeyDown}
          activeElementId={activeElementId}
          onFocus={handleFocus}
          onBlur={handleBlur}
          focusAtEnd={focusAtEndId === b.item.data.id}
          onFocusHandled={handleFocusHandled}
          scenes={allScenes}
          currentSceneId={b.currentSceneId}
          unresolvedCommentsCount={unresolvedCountByElement.get(b.item.data.id) ?? 0}
        />
      </div>
    ),
    [
      handleContentChange,
      handleFinalizeUpdate,
      handleKeyDown,
      activeElementId,
      handleFocus,
      handleBlur,
      focusAtEndId,
      handleFocusHandled,
      allScenes,
      unresolvedCountByElement,
    ],
  )

  return (
    <ProjectShell
      projectId={project.id}
      title={project.title}
      category={project.category}
      current="editor"
      sidebar={
      <SidePanel
        ref={sidePanelRef}
        project={project}
        allScenes={allScenes}
        totalScenes={totalScenes}
        totalElements={totalElements}
        onScrollToElement={scrollToElement}
        activeElementId={activeElementId}
        peersByScene={peersByElement}
        comments={projectComments}
        onAddComment={handleAddComment}
        onUpdateComment={handleUpdateComment}
        onDeleteComment={handleDeleteComment}
        onToggleCommentResolved={handleToggleCommentResolved}
      />
      }
      toolbar={
      <EditorToolbar
        title={project.title}
        projectId={project.id}
        category={project.category}
        saveStatus={isSaving ? "saving" : "saved"}
        onToggleAI={toggleAIChat}
        isAIOpen={isAIChatOpen}
        importItems={[
          {
            label: "Final Draft (.fdx)",
            accept: ".fdx",
            onFile: (text, fileName) => void handleImportFdx(text, fileName),
          },
        ]}
        exportItems={[
          {
            label: "Export as PDF",
            onClick: () => void runExport({
              extension: "pdf",
              projectTitle: project.title,
              run: async () => {
                // jspdf is heavy — load it only when the user exports.
                const { exportScreenplayToPDF } = await import("@/lib/export/screenplay-pdf")
                await exportScreenplayToPDF(project)
              },
            }),
          },
          {
            label: "Export as FDX (Final Draft)",
            onClick: () => void runExport({
              extension: "fdx",
              projectTitle: project.title,
              run: () => exportScreenplayToFDX(project),
            }),
          },
        ]}
      />
      }
    >
      <div className="flex h-full overflow-hidden">
        <div ref={writeSurfaceRef} className={cn("relative flex-1 flex flex-col overflow-hidden", isAIChatOpen && "border-r")}>
          <PagedSheets
            pages={pages}
            renderBlock={renderBlock}
            fontFamily={editorFontStack("screenplay")}
            pageSize={US_LETTER}
            pageIdPrefix="screenplay-page"
            railItems={SCREENPLAY_RAIL_ITEMS}
            onRailSelect={handleRailSelect}
            railStorageKey="editor.rail.screenplay"
            isEmpty={flattenedScriptItems.length === 0}
            emptyState={<ScreenplayEmptyState onAddNewScene={handleAddNewScene} />}
          />
          <RemoteCarets containerRef={writeSurfaceRef} subscribeCarets={subscribeCarets} />
        </div>
        <AIChatPanel
          isOpen={isAIChatOpen}
          onClose={() => setIsAIChatOpen(false)}
          category={project.category}
          projectId={project.id}
          currentUnitId={activeScene?.id ?? allScenes[0]?.id}
          currentElement={activeElementId || undefined}
          onToolComplete={() => {
            if (!user?.id) return
            void getFullProject(project.id, user.id).then(setProject).catch(() => {})
          }}
        />
      </div>
    </ProjectShell>
  )
}
