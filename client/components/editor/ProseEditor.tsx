"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { BookOpen, Pilcrow, Quote, Heading, Heading1, Heading2, Heading3, Clock, Asterisk, Hash, Type } from "lucide-react"
import { type RailEntry } from "./shared/EditorToolRail"
import { PagedSheets } from "./shared/PagedSheets"
import {
  EditorSidebar,
  type EditorSidebarItem,
  type EditorSidebarCommentTarget,
} from "./shared/EditorSidebar"
import { useEditorComments } from "./shared/useEditorComments"
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
import { createProseKeymap } from "./prose/keymap"
import { exportProjectToText, exportProjectToMarkdown } from "@/lib/export/text-export"
import { useExportToast } from "@/lib/export/use-export-toast"
import { parseMarkdownToProse } from "@/lib/import/markdown-prose"
import { importIntoProject } from "@/lib/import/import-into-project"
import { StableContentEditable } from "./shared/StableContentEditable"
import { RemoteCarets } from "./shared/RemoteCarets"
import { useEditorRealtime } from "./shared/useEditorRealtime"
import { PresencePips } from "./shared/PresencePips"
import { useScrollSpy } from "./shared/useScrollSpy"
import {
  createScene,
  createSceneElement,
  getFullProject,
  type ProjectElement,
  type FullProject,
} from "@/services/project"
import { deleteScriptElement, updateScriptElement } from "@/services/editor"

type ProseElementType =
  | "chapter_heading"
  | "heading_2"
  | "heading_3"
  | "paragraph"
  | "dialogue"
  | "scene_break"
  | "scene_heading_stinger"

/** Prose's element vocabulary for the right-edge tool rail. Headings collapse
 *  into one expandable group so the rail stays short as the set grows. */
const PROSE_RAIL_ITEMS: RailEntry[] = [
  { type: "paragraph", label: "Paragraph", icon: Pilcrow },
  { type: "dialogue", label: "Dialogue", icon: Quote },
  {
    label: "Heading",
    icon: Heading,
    items: [
      { type: "chapter_heading", label: "Heading 1", icon: Heading1 },
      { type: "heading_2", label: "Heading 2", icon: Heading2 },
      { type: "heading_3", label: "Heading 3", icon: Heading3 },
    ],
  },
  { type: "scene_heading_stinger", label: "Stinger", icon: Clock },
  { type: "scene_break", label: "Scene break", icon: Asterisk },
]

interface ProseEditorProps {
  projectData: FullProject
}

type ProseScene = NonNullable<FullProject["scenes"]>[number]

/**
 * A single renderable unit on a page: a chapter's heading, the empty-chapter
 * placeholder, or one body element. Pagination packs these onto A4 sheets.
 */
type ProseBlock =
  | { key: string; kind: "chapterHead"; scene: ProseScene; chapterIdx: number }
  | { key: string; kind: "emptyChapter"; scene: ProseScene }
  | { key: string; kind: "element"; scene: ProseScene; el: ProjectElement; elIdx: number }

function wordCount(text: string | null | undefined): number {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function ProseEditor({ projectData }: ProseEditorProps) {
  const { user } = useAuth()
  const [scenes, setScenes] = useState(() => projectData.scenes ?? [])
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const chapterRefs = useRef<Map<string, HTMLElement | null>>(new Map())
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
  const activeChapterId = useScrollSpy({
    refs: chapterRefs,
    orderedIds: scenes.map((s) => s.id),
  })

  // Live co-editing + remote carets + soft-lock markers (no-op on the desktop
  // build). focusId reports the chapter in view so collaborators see "editing X"
  // and peersByElement keys live + durable locks by chapter for the rail pips.
  const writeSurfaceRef = useRef<HTMLDivElement | null>(null)
  const { broadcastEdit, subscribeCarets, peersByElement } = useEditorRealtime({
    projectId: projectData.id,
    userId: user?.id,
    scenes,
    setScenes,
    surfaceRef: writeSurfaceRef,
    focusId: activeChapterId,
    focusLabel: scenes.find((s) => s.id === activeChapterId)?.scene_heading || "Untitled",
  })

  // Every chapter needs at least one real `paragraph` element to write into. A
  // chapter with zero elements renders the "Start writing…" placeholder, whose
  // input is a phantom: it isn't persisted and — crucially — isn't broadcast to
  // co-editors, so typing there never syncs (and is lost on reload). Provision a
  // real paragraph lazily for any empty chapter — new, imported, or created before
  // this fix — so the write surface is always a wired element. Guarded so React
  // StrictMode's double-effect (and a burst of re-renders) can't duplicate it.
  const provisioningRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const uid = user?.id
    if (!uid) return
    for (const s of scenes) {
      if ((s.elements?.length ?? 0) > 0 || provisioningRef.current.has(s.id)) continue
      provisioningRef.current.add(s.id)
      void (async () => {
        try {
          const el = await createSceneElement(projectData.id, s.id, uid, {
            element_type: "paragraph",
            content: "",
            order_index: 0,
          })
          setScenes((prev) => prev.map((x) => (x.id === s.id ? { ...x, elements: [el] } : x)))
        } catch {
          provisioningRef.current.delete(s.id) // allow a later retry
        }
      })()
    }
  }, [scenes, user?.id, projectData.id])

  // Track the last-focused block so the right-edge tool rail knows where to act:
  // an empty focused line is transformed into the chosen type, otherwise a new
  // block of that type is inserted after it (screenplay-style). With nothing
  // focused, the rail appends to the chapter currently in view.
  const [activeElement, setActiveElement] = useState<{ sceneId: string; elementId: string | null } | null>(null)

  const totalWords = scenes.reduce((acc, scene) => {
    return acc + (scene.elements ?? []).reduce((s, el) => s + wordCount(el.content), 0)
  }, 0)

  // What a new comment attaches to: the focused body element, or the chapter
  // heading (a scene) when the heading itself is focused.
  const activeCommentTarget = useMemo<EditorSidebarCommentTarget | null>(() => {
    if (activeElement) {
      const scene = scenes.find((s) => s.id === activeElement.sceneId)
      if (scene) {
        if (activeElement.elementId) {
          const el = (scene.elements ?? []).find((e) => e.id === activeElement.elementId)
          if (el) return { item: el, isScene: false }
        }
        return { item: scene, isScene: true }
      }
    }
    // Fall back to the chapter in view so the Comments tab is never a dead end.
    const fallback = scenes.find((s) => s.id === activeChapterId) ?? scenes[0]
    return fallback ? { item: fallback, isScene: true } : null
  }, [activeElement, scenes, activeChapterId])

  const sidebarItems = useMemo<EditorSidebarItem[]>(
    () =>
      scenes.map((scene, i) => {
        const chWords = (scene.elements ?? []).reduce((a, el) => a + wordCount(el.content), 0)
        const here = peersByElement.get(scene.id)
        return {
          id: scene.id,
          title: scene.scene_heading || "Untitled",
          index: i + 1,
          meta: chWords > 0 ? `${chWords.toLocaleString()}w` : undefined,
          commentTargetIds: [scene.id, ...(scene.elements ?? []).map((e) => e.id)],
          adornment: here && here.length ? <PresencePips peers={here} /> : undefined,
        }
      }),
    [scenes, peersByElement],
  )

  const handleContentChange = useCallback((id: string, content: string, isScene: boolean) => {
    if (isScene) {
      setScenes(prev => prev.map(s => s.id === id ? { ...s, scene_heading: content } : s))
    } else {
      setScenes(prev => prev.map(s => ({
        ...s,
        elements: (s.elements ?? []).map(el => el.id === id ? { ...el, content } : el),
      })))
    }
    scheduleSave(id, content, isScene)
    broadcastEdit(id, content, isScene)
  }, [scheduleSave, broadcastEdit])

  const handleAddChapter = async () => {
    if (!user?.id) return
    const newScene = await createScene(projectData.id, user.id, {
      scene_heading: "",
      content: "",
      order_index: scenes.length,
    })
    setScenes(prev => [...prev, { ...newScene, elements: [] }])
    setTimeout(() => {
      chapterRefs.current.get(newScene.id)?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 100)
  }

  // Import Markdown / plain text as new chapters appended to this project.
  const handleImportMarkdown = async (text: string, fileName: string) => {
    if (!user?.id) return
    const title = fileName.replace(/\.[^/.]+$/, "")
    const parsed = parseMarkdownToProse(text, title)
    try {
      const created = await importIntoProject(projectData.id, user.id, parsed, scenes.length)
      setScenes((prev) => [...prev, ...created])
      const firstNew = created[0]
      if (firstNew) {
        setTimeout(() => {
          chapterRefs.current.get(firstNew.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
        }, 100)
      }
      const chapterWord = created.length === 1 ? "chapter" : "chapters"
      toast({ title: "Import complete", description: `Added ${created.length} ${chapterWord} from ${fileName}.` })
    } catch (err) {
      console.error("Failed to import:", err)
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : "Couldn't import that file.",
        variant: "destructive",
      })
    }
  }

  const handleAddElement = async (sceneId: string, type: ProseElementType, afterIdx?: number) => {
    if (!user?.id) return
    const scene = scenes.find(s => s.id === sceneId)
    if (!scene) return
    const insertAt = afterIdx !== undefined ? afterIdx + 1 : (scene.elements?.length ?? 0)
    const el = await createSceneElement(projectData.id, sceneId, user.id, {
      element_type: type,
      content: type === "scene_break" ? "* * *" : "",
      order_index: insertAt,
    })
    setScenes(prev => prev.map(s => {
      if (s.id !== sceneId) return s
      const els = [...(s.elements ?? [])]
      els.splice(insertAt, 0, el)
      return { ...s, elements: els }
    }))
    setTimeout(() => {
      document.getElementById(`el-${el.id}`)?.focus()
    }, 50)
  }

  // Change an element's type in place (slash on an empty line: "turn this into X").
  const handleTransformElement = async (sceneId: string, elementId: string, type: ProseElementType) => {
    setScenes(prev => prev.map(s => s.id !== sceneId ? s : {
      ...s,
      elements: (s.elements ?? []).map(el =>
        el.id === elementId
          ? { ...el, element_type: type, content: type === "scene_break" ? "* * *" : el.content }
          : el,
      ),
    }))
    try {
      await updateScriptElement(elementId, { elementType: type })
    } catch (err) {
      toast({
        title: "Couldn't change that element",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      })
    }
    setTimeout(() => document.getElementById(`el-${elementId}`)?.focus(), 50)
  }

  // Rail click: transform a focused empty line, else insert after the focused
  // block, else append to the chapter in view.
  const handleRailSelect = (type: string) => {
    const t = type as ProseElementType
    const a = activeElement
    if (a?.elementId) {
      const scene = scenes.find((s) => s.id === a.sceneId)
      const idx = scene?.elements?.findIndex((e) => e.id === a.elementId) ?? -1
      const el = idx >= 0 ? scene!.elements![idx] : null
      if (el && (el.content ?? "") === "") {
        void handleTransformElement(a.sceneId, a.elementId, t)
        return
      }
      if (idx >= 0) {
        void handleAddElement(a.sceneId, t, idx)
        return
      }
    }
    const sceneId = a?.sceneId ?? activeChapterId ?? scenes[0]?.id
    if (sceneId) void handleAddElement(sceneId, t)
  }

  const handleDeleteElement = useCallback(
    async (sceneId: string, elementId: string) => {
      // Find the previous editable element id so we can land focus
      // there after the row vanishes — otherwise the document scrolls
      // to wherever React parks the next focusable element.
      const ids: string[] = []
      for (const s of scenes) {
        for (const el of s.elements ?? []) {
          if (el.element_type === "scene_break") continue
          ids.push(el.id)
        }
      }
      const idx = ids.indexOf(elementId)
      const prevId = idx > 0 ? ids[idx - 1] : null

      setScenes((prev) =>
        prev.map((s) =>
          s.id !== sceneId
            ? s
            : { ...s, elements: (s.elements ?? []).filter((el) => el.id !== elementId) },
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
    [scenes, toast],
  )

  const keyMap = useMemo(
    () =>
      createProseKeymap({
        scenes,
        insertParagraphAfter: (sceneId, afterIdx) =>
          void handleAddElement(sceneId, "paragraph", afterIdx),
        insertElementAfter: (sceneId, type, afterIdx) =>
          void handleAddElement(sceneId, type, afterIdx),
        insertNewChapter: () => void handleAddChapter(),
        deleteEmptyElement: (sceneId, elementId) =>
          void handleDeleteElement(sceneId, elementId),
      }),
    // handleAddElement/handleAddChapter are closed over scenes/user via useState/useAuth;
    // recreating the keymap when scenes changes is cheap and keeps the
    // navigation lookup honest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenes, handleDeleteElement],
  )

  const handleElementKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLDivElement>,
      sceneId: string,
      el: ProjectElement,
      elIdx: number,
    ) => {
      dispatchKey(e, keyMap, { sceneId, elementId: el.id, elementIndex: elIdx })
    },
    [keyMap],
  )

  // Pack chapter heads + elements onto A4 sheets the way the screenplay packs
  // its US-Letter pages: estimate each block's height and start a fresh sheet
  // when the running total would overflow. Each chapter also opens a new sheet
  // (book convention) — which keeps a focused paragraph from reparenting across
  // a chapter boundary while typing. The estimate is deliberately coarse and a
  // touch generous; sheets use min-height so an off-by-a-line never clips text.
  const pages = useMemo<ProseBlock[][]>(() => {
    const CHARS_PER_LINE = 78
    const LINE_PX = 30 // text-base at leading-loose
    const A4_CONTENT_PX = 940 // ~297mm less the top/bottom page padding

    const estimate = (b: ProseBlock): number => {
      if (b.kind === "chapterHead") return 150
      if (b.kind === "emptyChapter") return 40
      const { el } = b
      if (el.element_type === "scene_break") return 80
      const len = (el.content ?? "").length
      if (el.element_type === "chapter_heading") {
        return 56 + Math.max(1, Math.ceil(len / CHARS_PER_LINE)) * 34
      }
      if (el.element_type === "heading_2") {
        return 44 + Math.max(1, Math.ceil(len / CHARS_PER_LINE)) * 30
      }
      if (el.element_type === "heading_3") {
        return 36 + Math.max(1, Math.ceil(len / CHARS_PER_LINE)) * 28
      }
      if (el.element_type === "scene_heading_stinger") {
        return 96 + Math.max(1, Math.ceil(len / CHARS_PER_LINE)) * LINE_PX
      }
      const perLine = el.element_type === "dialogue" ? 70 : CHARS_PER_LINE
      return 12 + Math.max(1, Math.ceil(len / perLine)) * LINE_PX
    }

    const result: ProseBlock[][] = []
    let cur: ProseBlock[] = []
    let curH = 0

    scenes.forEach((scene, chapterIdx) => {
      if (cur.length) { result.push(cur); cur = []; curH = 0 } // new chapter → new sheet
      const head: ProseBlock = { key: `head-${scene.id}`, kind: "chapterHead", scene, chapterIdx }
      cur.push(head)
      curH += estimate(head)

      const els = scene.elements ?? []
      if (els.length === 0) {
        const empty: ProseBlock = { key: `empty-${scene.id}`, kind: "emptyChapter", scene }
        cur.push(empty)
        curH += estimate(empty)
        return
      }
      els.forEach((el, elIdx) => {
        const block: ProseBlock = { key: el.id, kind: "element", scene, el, elIdx }
        const h = estimate(block)
        if (curH + h > A4_CONTENT_PX && cur.length > 0) {
          result.push(cur)
          cur = []
          curH = 0
        }
        cur.push(block)
        curH += h
      })
    })
    if (cur.length) result.push(cur)
    return result
  }, [scenes])

  /** Render one body element with its per-type prose styling. */
  const renderElement = (scene: ProseScene, el: ProjectElement, elIdx: number) => {
    const onFocus = () => setActiveElement({ sceneId: scene.id, elementId: el.id })
    if (el.element_type === "scene_break") {
      return (
        <div key={el.id} className="text-center text-muted-foreground my-8 tracking-widest select-none">
          * * *
        </div>
      )
    }
    if (el.element_type === "chapter_heading") {
      return (
        <StableContentEditable
          key={el.id}
          id={`el-${el.id}`}
          value={el.content}
          onValueChange={(next) => handleContentChange(el.id, next, false)}
          onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
          onFocus={onFocus}
          className="text-xl font-semibold mt-10 mb-3 outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50"
          data-placeholder="Heading 1"
        />
      )
    }
    if (el.element_type === "heading_2") {
      return (
        <StableContentEditable
          key={el.id}
          id={`el-${el.id}`}
          value={el.content}
          onValueChange={(next) => handleContentChange(el.id, next, false)}
          onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
          onFocus={onFocus}
          className="text-lg font-semibold mt-8 mb-2 outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50"
          data-placeholder="Heading 2"
        />
      )
    }
    if (el.element_type === "heading_3") {
      return (
        <StableContentEditable
          key={el.id}
          id={`el-${el.id}`}
          value={el.content}
          onValueChange={(next) => handleContentChange(el.id, next, false)}
          onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
          onFocus={onFocus}
          className="text-base font-semibold mt-6 mb-1 outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50"
          data-placeholder="Heading 3"
        />
      )
    }
    if (el.element_type === "scene_heading_stinger") {
      // Stage-direction-style opener: small caps, italic, hairline rule.
      return (
        <StableContentEditable
          key={el.id}
          id={`el-${el.id}`}
          value={el.content}
          onValueChange={(next) => handleContentChange(el.id, next, false)}
          onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
          onFocus={onFocus}
          className="mt-12 mb-6 italic text-base tracking-wider uppercase text-foreground/80 border-b border-border/40 pb-2 outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 empty:before:not-italic empty:before:normal-case empty:before:tracking-normal"
          data-placeholder="Stinger…"
        />
      )
    }
    if (el.element_type === "dialogue") {
      // Hanging indent + opening curly quote, set apart from prose.
      return (
        <StableContentEditable
          key={el.id}
          id={`el-${el.id}`}
          value={el.content}
          onValueChange={(next) => handleContentChange(el.id, next, false)}
          onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
          onFocus={onFocus}
          className="outline-none min-h-[1.75rem] pl-10 -indent-6 leading-relaxed before:content-['“'] before:mr-1 before:text-muted-foreground/60 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 empty:before:pl-0 empty:before:mr-0"
          data-placeholder="Dialogue…"
        />
      )
    }
    // paragraph — first-line indent except right after a break/heading
    return (
      <StableContentEditable
        key={el.id}
        id={`el-${el.id}`}
        value={el.content}
        onValueChange={(next) => handleContentChange(el.id, next, false)}
        onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
        onFocus={onFocus}
        className={cn(
          "outline-none min-h-[1.75rem]",
          elIdx === 0 ||
            ["chapter_heading", "heading_2", "heading_3", "scene_heading_stinger", "dialogue", "scene_break"].includes(
              (scene.elements ?? [])[elIdx - 1]?.element_type ?? "",
            )
            ? ""
            : "pl-10",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 empty:before:pl-0",
        )}
        data-placeholder={elIdx === 0 ? "Start writing…" : ""}
      />
    )
  }

  /** Render any block — chapter head, empty-chapter placeholder, or element. */
  const renderBlock = (b: ProseBlock) => {
    if (b.kind === "chapterHead") {
      return (
        <div
          key={b.key}
          ref={(el) => { chapterRefs.current.set(b.scene.id, el) }}
        >
          <p className="text-center text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2 select-none">
            Chapter {b.chapterIdx + 1}
          </p>
          <StableContentEditable
            id={`head-${b.scene.id}`}
            value={b.scene.scene_heading ?? ""}
            onValueChange={(next) => handleContentChange(b.scene.id, next, true)}
            className="text-center text-2xl font-semibold leading-tight outline-none mb-12 min-h-[2rem] empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50"
            data-placeholder="Untitled"
          />
        </div>
      )
    }
    if (b.kind === "emptyChapter") {
      return (
        <StableContentEditable
          key={b.key}
          value=""
          onValueChange={() => { /* placeholder; real input arrives once the first paragraph exists */ }}
          onFocus={() => setActiveElement({ sceneId: b.scene.id, elementId: null })}
          className="outline-none min-h-[1.75rem] empty:before:content-['Start\00a0writing…'] empty:before:text-muted-foreground/50"
          onKeyDown={async (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              await handleAddElement(b.scene.id, "paragraph")
            }
          }}
        />
      )
    }
    return renderElement(b.scene, b.el, b.elIdx)
  }

  return (
    <ProjectShell
      projectId={projectData.id}
      title={projectData.title}
      category={projectData.category}
      current="editor"
      sidebar={
      /* Chapter sidebar — shared rail with list + comments. */
      <EditorSidebar
        headerIcon={BookOpen}
        headerLabel="Chapters"
        stats={[
          { icon: Hash, label: `${scenes.length} ${scenes.length === 1 ? "chapter" : "chapters"}` },
          { icon: Type, label: `${totalWords.toLocaleString()} words` },
        ]}
        items={sidebarItems}
        activeItemId={activeChapterId}
        onItemClick={(id) =>
          chapterRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
        addLabel="Add chapter"
        onAdd={handleAddChapter}
        emptyLabel="No chapters yet."
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
          importItems={[
            {
              label: "Markdown / Text (.md, .txt)",
              accept: ".md,.markdown,.txt",
              onFile: (text, fileName) => void handleImportMarkdown(text, fileName),
            },
          ]}
          exportItems={[
            {
              label: "Export as Plain Text (.txt)",
              onClick: () => void runExport({
                extension: "txt",
                projectTitle: projectData.title,
                run: () => exportProjectToText({ ...projectData, scenes }),
              }),
            },
            {
              label: "Export as Markdown (.md)",
              onClick: () => void runExport({
                extension: "md",
                projectTitle: projectData.title,
                run: () => exportProjectToMarkdown({ ...projectData, scenes }),
              }),
            },
            {
              label: "Export as EPUB 3 (.epub)",
              onClick: () => void runExport({
                extension: "epub",
                projectTitle: projectData.title,
                run: async () => {
                  // fflate is heavy — load it only when the user exports.
                  const { exportProseToEpub } = await import("@/lib/export/prose-epub")
                  await exportProseToEpub({ ...projectData, scenes })
                },
              }),
            },
          ]}
        />
      }
    >
        <div ref={writeSurfaceRef} className="relative flex h-full overflow-hidden">
          <PagedSheets
            pages={pages}
            renderBlock={renderBlock}
            fontFamily={editorFontStack("prose")}
            railItems={PROSE_RAIL_ITEMS}
            onRailSelect={handleRailSelect}
            railStorageKey="editor.rail.prose"
            pageIdPrefix="prose-page"
            isEmpty={scenes.length === 0}
            emptyState={
              <EmptyEditorState
                message="No chapters yet."
                actionLabel="Add first chapter"
                onAction={handleAddChapter}
              />
            }
          />
          <AIChatPanel
            isOpen={isAIChatOpen}
            onClose={() => setIsAIChatOpen(false)}
            category={projectData.category}
            projectId={projectData.id}
            currentUnitId={activeElement?.sceneId ?? activeChapterId ?? scenes[0]?.id}
            onToolComplete={() => {
              if (!user?.id) return
              void getFullProject(projectData.id, user.id).then((fresh) => setScenes(fresh.scenes ?? [])).catch(() => {})
            }}
          />
          <RemoteCarets containerRef={writeSurfaceRef} subscribeCarets={subscribeCarets} />
        </div>
    </ProjectShell>
  )
}
