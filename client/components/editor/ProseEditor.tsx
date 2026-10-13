"use client"

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { BookOpen, Pilcrow, Quote, Heading, Heading1, Heading2, Heading3, Clock, Asterisk, Hash, Type } from "lucide-react"
import { type RailEntry } from "./shared/EditorToolRail"
import { PagedSheets, type SheetMetrics } from "./shared/PagedSheets"
import { PROSE_PAPER, isProsePaperSize, type ProsePaperSize } from "@/lib/editor/prose-paper"
import {
  EditorSidebar,
  type EditorSidebarItem,
} from "./shared/EditorSidebar"
import { useEditorComments } from "./shared/useEditorComments"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/AuthContext"
import { useTheme } from "@/lib/ThemeContext"
import { useToast } from "@/hooks/use-toast"
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
import { InlineTextEditable, InlineFormattingToolbar } from "./shared/InlineTextEditable"
import { plainInlineText } from "@/lib/editor/inline-content"
import { EditorWorkspace } from "./shared/EditorWorkspace"
import { useEditorRealtime } from "./shared/useEditorRealtime"
import { PresencePips } from "./shared/PresencePips"
import { useScrollSpy } from "./shared/useScrollSpy"
import { useEditorDocument } from "./shared/useEditorDocument"
import { useEditorCommentTarget } from "./shared/useEditorCommentTarget"
import { useEditorMutations } from "./shared/useEditorMutations"
import {
  type ProjectElement,
  type FullProject,
} from "@/services/project"
import { updateScriptElement } from "@/services/editor"
import { updateSceneContent } from "@/services/project"
import { DocumentMetadataDialog } from "./shared/DocumentMetadataDialog"
import { DocumentFoundationDialog } from "./shared/DocumentFoundationDialog"
import { useDocumentFoundation } from "./shared/useDocumentFoundation"
import { EditorCommandPalette, type EditorCommand } from "./shared/EditorCommandPalette"
import { writeDocumentMetadata, type DocumentMetadata } from "@/lib/editor/document-metadata"
import { ManuscriptExportDialog } from "./shared/ManuscriptExportDialog"
import type { ManuscriptSubmissionOptions } from "@/lib/export/manuscript-options"
import { defaultNovelBlock, NOVEL_BLOCK_KINDS, novelNumbering, novelReferenceLabel, parseNovelBlock, type NovelBlockKind } from "@/lib/editor/novel-blocks"
import { NovelBlockEditor } from "./prose/NovelBlockEditor"

type ProseElementType =
  | "chapter_heading"
  | "heading_2"
  | "heading_3"
  | "paragraph"
  | "dialogue"
  | "scene_break"
  | "scene_heading_stinger"
  | "figure" | "step" | "materials" | "callout" | "build_card" | "cross_reference" | "glossary" | "index"

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

const NOVEL_RAIL_ITEMS: RailEntry[] = [
  ...PROSE_RAIL_ITEMS,
  { type: "figure", label: "Figure", icon: BookOpen },
  { type: "step", label: "Step", icon: Hash },
  { type: "materials", label: "Materials / tools", icon: Pilcrow },
  { type: "callout", label: "Warning / aside", icon: Quote },
  { type: "build_card", label: "Build card", icon: BookOpen },
  { type: "cross_reference", label: "Cross-reference", icon: Hash },
  { type: "glossary", label: "Glossary", icon: BookOpen },
  { type: "index", label: "Index", icon: BookOpen },
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
  return plainInlineText(text).trim().split(/\s+/).filter(Boolean).length
}

export function ProseEditor({ projectData }: ProseEditorProps) {
  const { user } = useAuth()
  const [scenes, setScenes] = useState(() => projectData.scenes ?? [])
  const [manuscriptFormat, setManuscriptFormat] = useState<"pdf" | "docx" | null>(null)
  const [paperSize, setPaperSize] = useState<ProsePaperSize>("a4")
  const [coverImage, setCoverImage] = useState("")
  const [coverAspectRatio, setCoverAspectRatio] = useState(1)
  const coverInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const saved = window.localStorage.getItem(`inkwell.prose.paper.${projectData.id}`)
    if (isProsePaperSize(saved)) setPaperSize(saved)
    setCoverImage(window.localStorage.getItem(`inkwell.prose.cover.${projectData.id}`) ?? "")
  }, [projectData.id])
  useEffect(() => {
    if (!coverImage) return
    const image = new Image()
    image.onload = () => setCoverAspectRatio(image.naturalWidth / image.naturalHeight)
    image.src = coverImage
  }, [coverImage])
  const changePaperSize = (size: ProsePaperSize) => {
    setPaperSize(size)
    window.localStorage.setItem(`inkwell.prose.paper.${projectData.id}`, size)
  }
  const paper = PROSE_PAPER[paperSize]
  const compact = projectData.category === "novel" && (paperSize === "a6" || paperSize === "a7")
  const small = projectData.category === "novel" && paperSize === "a5"
  const pageType = compact
    ? paperSize === "a7"
      ? { content: "font-sans text-[11px] leading-[1.45]", fontPx: 11, linePx: 16, headPx: 98, indent: "", chapter: "text-[17px] mb-5 min-h-[1.4rem]", label: "text-[9px] mb-2" }
      : { content: "font-sans text-[13px] leading-[1.45]", fontPx: 13, linePx: 19, headPx: 120, indent: "", chapter: "text-[21px] mb-6 min-h-[1.7rem]", label: "text-[10px] mb-2" }
    : small
      ? { content: "text-[15px] leading-[1.6]", fontPx: 15, linePx: 24, headPx: 112, indent: "pl-7", chapter: "text-[22px] mb-9 min-h-[1.9rem]", label: "text-xs mb-2" }
      : { content: "text-base leading-loose", fontPx: 16, linePx: 30, headPx: 150, indent: "pl-10", chapter: "text-2xl mb-12 min-h-[2rem]", label: "text-xs mb-2" }
  const sheetMetrics = useMemo<SheetMetrics>(() => ({
    width: `${paper.widthMm}mm`, minHeight: `${paper.heightMm}mm`,
    paddingClass: "", padding: `${paper.marginMm}mm`, contentClass: pageType.content,
    pageNumber: { position: "bottom-right", render: (n) => n },
  }), [paper, pageType.content])
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const chapterRefs = useRef<Map<string, HTMLElement | null>>(new Map())
  const { saveStatus, scheduleSave } = useElementAutosave({ userId: user?.id })
  const runExport = useExportToast()
  const { toast } = useToast()
  const changeCover = (file: File | undefined) => {
    if (!file) return
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 750_000) {
      toast({ title: "Choose a JPG or PNG under 750 KB" })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== "string") return
      try {
        window.localStorage.setItem(`inkwell.prose.cover.${projectData.id}`, reader.result)
        setCoverImage(reader.result)
      } catch {
        toast({ title: "Could not save the cover on this device" })
      }
    }
    reader.readAsDataURL(file)
  }
  const removeCover = () => {
    window.localStorage.removeItem(`inkwell.prose.cover.${projectData.id}`)
    setCoverImage("")
  }
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

  const { handleContentChange, refreshDocument } = useEditorDocument({
    projectId: projectData.id,
    userId: user?.id,
    units: scenes,
    setUnits: setScenes,
    scheduleSave,
    broadcastEdit,
    emptyUnitElementType: "paragraph",
  })
  const { createUnit, insertElement, deleteElement } = useEditorMutations({
    projectId: projectData.id,
    userId: user?.id,
    units: scenes,
    setUnits: setScenes,
  })
  const foundation = useDocumentFoundation({ projectId: projectData.id, userId: user?.id, scenes, setScenes })

  // Track the last-focused block so the right-edge tool rail knows where to act:
  // an empty focused line is transformed into the chosen type, otherwise a new
  // block of that type is inserted after it (screenplay-style). With nothing
  // focused, the rail appends to the chapter currently in view.
  const [activeElement, setActiveElement] = useState<{ sceneId: string; elementId: string | null } | null>(null)

  const totalWords = scenes.reduce((acc, scene) => {
    return acc + (scene.elements ?? []).reduce((s, el) => s + (parseNovelBlock(el) ? 0 : wordCount(el.content)), 0)
  }, 0)
  const numbers = useMemo(() => novelNumbering({ ...projectData, scenes }), [projectData, scenes])
  const referenceTargets = useMemo(() => [
    ...Array.from(numbers.chapterLabels, ([id, label]) => ({ id, type: "chapter" as const, label })),
    ...Array.from(numbers.figureLabels, ([id, label]) => ({ id, type: "figure" as const, label })),
  ], [numbers])

  const saveMetadata = async (sceneId: string, metadata: DocumentMetadata) => {
    if (!user?.id) throw new Error("Sign in to save metadata.")
    const scene = scenes.find((item) => item.id === sceneId)
    if (!scene) throw new Error("This chapter is no longer available.")
    const content = writeDocumentMetadata(scene.content, metadata)
    await updateSceneContent(sceneId, user.id, content)
    setScenes((current) => current.map((item) => item.id === sceneId ? { ...item, content } : item))
  }

  // What a new comment attaches to: the focused body element, or the chapter
  // heading (a scene) when the heading itself is focused.
  const activeCommentTarget = useEditorCommentTarget({
    units: scenes,
    focusedElementId: activeElement?.elementId,
    focusedUnitId: activeElement?.sceneId,
    activeUnitId: activeChapterId,
  })

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

  const handleAddChapter = async () => {
    const newScene = await createUnit()
    if (!newScene) return
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
    const el = await insertElement(sceneId, {
      elementType: type,
      content: NOVEL_BLOCK_KINDS.includes(type as NovelBlockKind) ? JSON.stringify(defaultNovelBlock(type as NovelBlockKind)) : type === "scene_break" ? "* * *" : "",
      afterIndex: afterIdx,
    })
    if (!el) return
    setTimeout(() => {
      document.getElementById(`el-${el.id}`)?.focus()
    }, 50)
  }

  // Change an element's type in place (slash on an empty line: "turn this into X").
  const handleTransformElement = async (sceneId: string, elementId: string, type: ProseElementType) => {
    const content = NOVEL_BLOCK_KINDS.includes(type as NovelBlockKind) ? JSON.stringify(defaultNovelBlock(type as NovelBlockKind)) : type === "scene_break" ? "* * *" : ""
    setScenes(prev => prev.map(s => s.id !== sceneId ? s : {
      ...s,
      elements: (s.elements ?? []).map(el =>
        el.id === elementId
          ? { ...el, element_type: type, content }
          : el,
      ),
    }))
    try {
      await updateScriptElement(elementId, { elementType: type, content })
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
    if (projectData.category === "novel" && t === "build_card") {
      const sceneId = a?.sceneId ?? activeChapterId ?? scenes[0]?.id
      if (!sceneId) return
      const existing = scenes.find(scene => scene.id === sceneId)?.elements?.find(element => element.element_type === "build_card")
      if (existing) document.getElementById(`el-${existing.id}`)?.focus()
      else void handleAddElement(sceneId, t, -1)
      return
    }
    if (a?.elementId) {
      const scene = scenes.find((s) => s.id === a.sceneId)
      const idx = scene?.elements?.findIndex((e) => e.id === a.elementId) ?? -1
      const el = idx >= 0 ? scene!.elements![idx] : null
      if (el && !parseNovelBlock(el) && plainInlineText(el.content ?? "") === "") {
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

      try {
        await deleteElement(sceneId, elementId)
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
    [deleteElement, scenes, toast],
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
    const CHARS_PER_LINE = Math.max(12, Math.round(78 * (paper.widthMm - 2 * paper.marginMm) / 168 * 16 / pageType.fontPx))
    const LINE_PX = pageType.linePx
    const pageContentPx = (paper.heightMm - 2 * paper.marginMm) * 96 / 25.4

    const estimate = (b: ProseBlock): number => {
      if (b.kind === "chapterHead") return pageType.headPx
      if (b.kind === "emptyChapter") return 40
      const { el } = b
      if (NOVEL_BLOCK_KINDS.includes(el.element_type as NovelBlockKind)) {
        const block = parseNovelBlock(el)
        if (block?.kind === "build_card") return compact ? 64 : 100
        if (block?.kind === "callout") return 40 + Math.max(1, Math.ceil(block.body.length / CHARS_PER_LINE)) * LINE_PX
        if (block?.kind === "cross_reference") return LINE_PX + 16
        if (block?.kind === "figure" || block?.kind === "step") return 320
        return block?.kind === "glossary" || block?.kind === "index" ? 280 : 180
      }
      if (el.element_type === "scene_break") return compact ? 48 : small ? 64 : 80
      const len = plainInlineText(el.content ?? "").length
      if (el.element_type === "chapter_heading") {
        return (compact ? 30 : small ? 44 : 56) + Math.max(1, Math.ceil(len / CHARS_PER_LINE)) * (compact ? 24 : small ? 28 : 34)
      }
      if (el.element_type === "heading_2") {
        return (compact ? 25 : small ? 36 : 44) + Math.max(1, Math.ceil(len / CHARS_PER_LINE)) * (compact ? 21 : small ? 26 : 30)
      }
      if (el.element_type === "heading_3") {
        return (compact ? 20 : small ? 30 : 36) + Math.max(1, Math.ceil(len / CHARS_PER_LINE)) * (compact ? 19 : small ? 24 : 28)
      }
      if (el.element_type === "scene_heading_stinger") {
        return (compact ? 52 : small ? 72 : 96) + Math.max(1, Math.ceil(len / CHARS_PER_LINE)) * LINE_PX
      }
      const perLine = el.element_type === "dialogue" ? Math.max(12, CHARS_PER_LINE - 4) : CHARS_PER_LINE
      return (compact ? 8 : small ? 8 : 12) + Math.max(1, Math.ceil(len / perLine)) * LINE_PX
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
        if (curH + h > pageContentPx && cur.length > 0) {
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
  }, [scenes, paper, pageType.fontPx, pageType.linePx, pageType.headPx, compact, small])

  const moveStep = async (sceneId: string, elementId: string, direction: -1 | 1) => {
    const scene = scenes.find(item => item.id === sceneId)
    const steps = (scene?.elements ?? []).filter(item => item.element_type === "step")
    const index = steps.findIndex(item => item.id === elementId)
    const neighbor = steps[index + direction]
    if (!neighbor || !steps[index]) return
    const current = steps[index]
    const currentContent = current.content
    const neighborContent = neighbor.content
    try {
      await updateScriptElement(current.id, { content: neighborContent })
      try {
        await updateScriptElement(neighbor.id, { content: currentContent })
      } catch (error) {
        await updateScriptElement(current.id, { content: currentContent })
        throw error
      }
      setScenes(previous => previous.map(item => item.id !== sceneId ? item : ({
        ...item, elements: (item.elements ?? []).map(element => element.id === current.id ? { ...element, content: neighborContent } : element.id === neighbor.id ? { ...element, content: currentContent } : element),
      })))
    } catch (error) {
      toast({ title: "Could not move step", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" })
      void refreshDocument()
    }
  }

  /** Render one body element with its per-type prose styling. */
  const renderElement = (scene: ProseScene, el: ProjectElement, elIdx: number) => {
    const onFocus = () => setActiveElement({ sceneId: scene.id, elementId: el.id })
    if (projectData.category === "novel") {
      const block = parseNovelBlock(el)
      if (block) {
        const steps = (scene.elements ?? []).filter(item => item.element_type === "step")
        const stepIndex = steps.findIndex(item => item.id === el.id)
        const label = block.kind === "figure" ? numbers.figureLabels.get(el.id)
          : block.kind === "step" ? numbers.stepLabels.get(el.id)
          : block.kind === "cross_reference" ? novelReferenceLabel(block, numbers) : undefined
        return <NovelBlockEditor key={el.id} id={el.id} block={block} label={label} targets={referenceTargets}
          onChange={next => handleContentChange(el.id, JSON.stringify(next), false)} onFocus={onFocus}
          onDelete={() => void handleDeleteElement(scene.id, el.id)}
          onMove={direction => void moveStep(scene.id, el.id, direction)}
          canMoveUp={stepIndex > 0} canMoveDown={stepIndex >= 0 && stepIndex < steps.length - 1} />
      }
    }
    if (el.element_type === "scene_break") {
      return (
        <div key={el.id} className="text-center text-muted-foreground my-8 tracking-widest select-none">
          * * *
        </div>
      )
    }
    if (el.element_type === "chapter_heading") {
      return (
        <InlineTextEditable
          key={el.id}
          id={`el-${el.id}`}
          value={el.content}
          onValueChange={(next) => handleContentChange(el.id, next, false)}
          onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
          onFocus={onFocus}
          className={cn("font-semibold outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50", compact ? "text-[1.2em] mt-6 mb-2" : small ? "text-xl mt-8 mb-3" : "text-xl mt-10 mb-3")}
          data-placeholder="Heading 1"
        />
      )
    }
    if (el.element_type === "heading_2") {
      return (
        <InlineTextEditable
          key={el.id}
          id={`el-${el.id}`}
          value={el.content}
          onValueChange={(next) => handleContentChange(el.id, next, false)}
          onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
          onFocus={onFocus}
          className={cn("font-semibold outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50", compact ? "text-[1.1em] mt-4 mb-1" : small ? "text-lg mt-6 mb-2" : "text-lg mt-8 mb-2")}
          data-placeholder="Heading 2"
        />
      )
    }
    if (el.element_type === "heading_3") {
      return (
        <InlineTextEditable
          key={el.id}
          id={`el-${el.id}`}
          value={el.content}
          onValueChange={(next) => handleContentChange(el.id, next, false)}
          onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
          onFocus={onFocus}
          className={cn("font-semibold outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50", compact ? "text-[1em] mt-3 mb-1" : "text-base mt-6 mb-1")}
          data-placeholder="Heading 3"
        />
      )
    }
    if (el.element_type === "scene_heading_stinger") {
      // Stage-direction-style opener: small caps, italic, hairline rule.
      return (
        <InlineTextEditable
          key={el.id}
          id={`el-${el.id}`}
          value={el.content}
          onValueChange={(next) => handleContentChange(el.id, next, false)}
          onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
          onFocus={onFocus}
          className={cn("italic tracking-wider uppercase text-foreground/80 border-b border-border/40 outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 empty:before:not-italic empty:before:normal-case empty:before:tracking-normal", compact ? "mt-6 mb-3 pb-1" : "mt-12 mb-6 pb-2")}
          data-placeholder="Stinger…"
        />
      )
    }
    if (el.element_type === "dialogue") {
      // Hanging indent + opening curly quote, set apart from prose.
      return (
        <InlineTextEditable
          key={el.id}
          id={`el-${el.id}`}
          value={el.content}
          onValueChange={(next) => handleContentChange(el.id, next, false)}
          onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
          onFocus={onFocus}
          className={cn("outline-none before:content-['“'] before:mr-1 before:text-muted-foreground/60 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 empty:before:pl-0 empty:before:mr-0", compact ? "min-h-[1.2rem] pl-5 -indent-3" : "min-h-[1.75rem] pl-10 -indent-6 leading-relaxed")}
          data-placeholder="Dialogue…"
        />
      )
    }
    // paragraph — first-line indent except right after a break/heading
    return (
      <InlineTextEditable
        key={el.id}
        id={`el-${el.id}`}
        value={el.content}
        onValueChange={(next) => handleContentChange(el.id, next, false)}
        onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
        onFocus={onFocus}
        className={cn(
          "outline-none", compact ? "min-h-[1.2rem] mb-2" : "min-h-[1.75rem]",
          elIdx === 0 ||
            ["chapter_heading", "heading_2", "heading_3", "scene_heading_stinger", "dialogue", "scene_break"].includes(
              (scene.elements ?? [])[elIdx - 1]?.element_type ?? "",
            )
            ? ""
            : pageType.indent,
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
          className={compact ? "border-t border-current/15 pt-4 mt-7" : undefined}
        >
          <p className={cn("tracking-[0.2em] uppercase select-none text-muted-foreground", compact && "font-bold", !compact && "text-center", pageType.label)}>
            Chapter {b.chapterIdx + 1}
          </p>
          <StableContentEditable
            id={`head-${b.scene.id}`}
            value={b.scene.scene_heading ?? ""}
            onValueChange={(next) => handleContentChange(b.scene.id, next, true)}
            className={cn("font-semibold leading-tight outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50", !compact && "text-center", pageType.chapter)}
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

  const commands: EditorCommand[] = [
    { id: "new-unit", label: "New chapter", group: "Document", run: () => handleAddChapter() },
    { id: "paragraph", label: "Insert paragraph", group: "Insert", run: () => handleRailSelect("paragraph") },
    { id: "dialogue", label: "Insert dialogue", group: "Insert", run: () => handleRailSelect("dialogue") },
    { id: "heading-2", label: "Insert heading 2", group: "Insert", run: () => handleRailSelect("heading_2") },
    { id: "heading-3", label: "Insert heading 3", group: "Insert", run: () => handleRailSelect("heading_3") },
    { id: "scene-break", label: "Insert scene break", group: "Insert", run: () => handleRailSelect("scene_break") },
    ...scenes.map((scene, index) => ({
      id: `go-${scene.id}`,
      label: `Go to ${scene.scene_heading || "untitled chapter"}`,
      group: "Navigate",
      keywords: [String(index + 1)],
      run: () => {
        chapterRefs.current.get(scene.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
        document.getElementById(`head-${scene.id}`)?.focus()
      },
    })),
  ]

  const exportManuscript = (options: ManuscriptSubmissionOptions) => {
    if (!manuscriptFormat) return
    const format = manuscriptFormat
    void runExport({
      extension: format, projectTitle: projectData.title,
      run: async () => {
        const { downloadManuscript } = await import("@/lib/export/manuscript")
        downloadManuscript({ ...projectData, scenes }, "prose", format, { ...options, coverImage: projectData.category === "novel" ? coverImage : "", coverAspectRatio })
      },
    })
  }

  return (
    <>
    <ManuscriptExportDialog key={paperSize} project={projectData} profile="prose" paperSize={projectData.category === "novel" ? paperSize : undefined} allowPaperSize={projectData.category === "novel"} format={manuscriptFormat ?? "pdf"} open={manuscriptFormat !== null} onOpenChange={open => { if (!open) setManuscriptFormat(null) }} onExport={exportManuscript} />
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
          leading={<>
            {projectData.category === "novel" && <label className="flex items-center gap-2 text-xs text-muted-foreground">Paper
              <select aria-label="Novel paper size" value={paperSize} onChange={event => changePaperSize(event.target.value as ProsePaperSize)} className="border-input bg-background h-8 rounded-md border px-2 text-foreground">
                {Object.entries(PROSE_PAPER).map(([value, size]) => <option key={value} value={value}>{size.label}</option>)}
              </select>
            </label>}
            {projectData.category === "novel" && <>
              <input ref={coverInputRef} type="file" accept="image/jpeg,image/png" className="hidden" aria-label="Novel cover image" onChange={event => { changeCover(event.target.files?.[0]); event.target.value = "" }} />
              <button type="button" className="text-xs text-foreground underline" onClick={() => coverInputRef.current?.click()}>{coverImage ? "Change cover" : "Add cover"}</button>
              {coverImage && <button type="button" className="text-xs text-muted-foreground underline" onClick={removeCover}>Remove cover</button>}
            </>}
            {(scenes.find((scene) => scene.id === activeChapterId) ?? scenes[0]) && (
              <DocumentMetadataDialog
                key={activeChapterId ?? scenes[0].id}
                scene={scenes.find((scene) => scene.id === activeChapterId) ?? scenes[0]}
                label="Chapter"
                onSave={saveMetadata}
              />
            )}
            <DocumentFoundationDialog
              category="prose"
              scene={scenes.find((scene) => scene.id === activeChapterId) ?? scenes[0]}
              onTemplate={foundation.createFromTemplate}
              onCapture={foundation.captureRevision}
              onVariant={foundation.openVariant}
            />
            <EditorCommandPalette commands={commands} />
            <InlineFormattingToolbar />
          </>}
          importItems={[
            {
              label: "Markdown / Text (.md, .txt)",
              accept: ".md,.markdown,.txt",
              onFile: (text, fileName) => void handleImportMarkdown(text, fileName),
            },
          ]}
          exportItems={[
            ...(projectData.category === "novel" ? (["a6", "a7"] as const).map(preset => ({
              label: `Typesetting HTML (${preset.toUpperCase()})`,
              onClick: () => void runExport({
                extension: "html", projectTitle: projectData.title,
                run: async () => {
                  const { downloadNovelHtml } = await import("@/lib/export/novel-html")
                  downloadNovelHtml({ ...projectData, scenes }, preset)
                },
              }),
            })) : []),
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
            {
              label: "Manuscript PDF (.pdf)",
              onClick: () => setManuscriptFormat("pdf"),
            },
            {
              label: "Manuscript Word (.docx)",
              onClick: () => setManuscriptFormat("docx"),
            },
          ]}
        />
      }
    >
        <EditorWorkspace
          surfaceRef={writeSurfaceRef}
          subscribeCarets={subscribeCarets}
          isAIChatOpen={isAIChatOpen}
          onCloseAIChat={() => setIsAIChatOpen(false)}
          category={projectData.category}
          projectId={projectData.id}
          currentUnitId={activeElement?.sceneId ?? activeChapterId ?? scenes[0]?.id}
          onToolComplete={() => void refreshDocument().catch(() => {})}
        >
          <PagedSheets
            pageSize={projectData.category === "novel" ? sheetMetrics : undefined}
            coverImage={projectData.category === "novel" ? coverImage : undefined}
            pages={pages}
            renderBlock={renderBlock}
            fontFamily={editorFontStack("prose")}
            railItems={projectData.category === "novel" ? NOVEL_RAIL_ITEMS : PROSE_RAIL_ITEMS}
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
        </EditorWorkspace>
    </ProjectShell>
    </>
  )
}
