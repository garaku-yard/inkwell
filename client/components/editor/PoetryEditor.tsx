"use client"

import { useState, useCallback, useMemo, useRef } from "react"
import { AlignCenter, AlignLeft, IndentIncrease, IndentDecrease, Music, Hash, Feather, Minus, Tag, Repeat2, Grid2X2, Pilcrow, Heading2 } from "lucide-react"
import { syllable } from "syllable"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/AuthContext"
import { useTheme } from "@/lib/ThemeContext"
import { useToast } from "@/hooks/use-toast"
import { ProjectShell } from "./shared/ProjectShell"
import { EditorToolbar } from "./shared/EditorToolbar"
import { EmptyEditorState } from "./shared/EmptyEditorState"
import { useElementAutosave } from "./shared/useElementAutosave"
import { dispatchKey } from "@/lib/editor/keymap"
import { createPoetryKeymap } from "./poetry/keymap"
import { exportProjectToText } from "@/lib/export/text-export"
import { exportProjectToChordPro } from "@/lib/export/chordpro"
import { useExportToast } from "@/lib/export/use-export-toast"
import { parsePlainTextToPoetry, parseChordProToPoetry } from "@/lib/import/poetry"
import { importIntoProject } from "@/lib/import/import-into-project"
import { type ParsedProject } from "@/lib/import/types"
import { StableContentEditable } from "./shared/StableContentEditable"
import { InlineTextEditable, InlineFormattingToolbar } from "./shared/InlineTextEditable"
import { plainInlineText, readInlineRuns, writeInlineRuns } from "@/lib/editor/inline-content"
import { EditorWorkspace } from "./shared/EditorWorkspace"
import { useEditorRealtime } from "./shared/useEditorRealtime"
import { PresencePips } from "./shared/PresencePips"
import { useScrollSpy } from "./shared/useScrollSpy"
import { useEditorDocument } from "./shared/useEditorDocument"
import { useEditorCommentTarget } from "./shared/useEditorCommentTarget"
import { useEditorMutations } from "./shared/useEditorMutations"
import {
  EditorSidebar,
  type EditorSidebarItem,
} from "./shared/EditorSidebar"
import { useEditorComments } from "./shared/useEditorComments"
import { PagedSheets } from "./shared/PagedSheets"
import { DocumentMetadataDialog } from "./shared/DocumentMetadataDialog"
import { DocumentFoundationDialog } from "./shared/DocumentFoundationDialog"
import { useDocumentFoundation } from "./shared/useDocumentFoundation"
import { EditorCommandPalette, type EditorCommand } from "./shared/EditorCommandPalette"
import { readDocumentMetadata, writeDocumentMetadata, type DocumentMetadata } from "@/lib/editor/document-metadata"
import { chordRowIssues, transposeChord, transposeChordRow } from "@/lib/editor/song-tools"
import { VerseToolsDialog } from "./poetry/VerseToolsDialog"
import { updateElementContent, updateSceneContent } from "@/services/project"
import { type RailEntry } from "./shared/EditorToolRail"
import { paginate } from "@/lib/editor/paginate"
import {
  type ProjectElement,
  type FullProject,
} from "@/services/project"

interface PoetryEditorProps {
  projectData: FullProject
}

type PoetryScene = NonNullable<FullProject["scenes"]>[number]

/** One renderable unit on a poem sheet — the title, an empty-poem placeholder,
 *  or a single body element (line / stanza break / section label / chord row). */
type PoemBlock =
  | { key: string; kind: "poemHead"; scene: PoetryScene; poemIdx: number }
  | { key: string; kind: "emptyPoem"; scene: PoetryScene }
  | { key: string; kind: "element"; scene: PoetryScene; el: ProjectElement; elIdx: number; lineNumber: number }

function countLines(elements: ProjectElement[]): number {
  return elements.filter(el => el.element_type === "line").length
}
function countProseBlocks(elements: ProjectElement[]): number {
  return elements.filter(el => el.element_type === "prose_block").length
}

export function PoetryEditor({ projectData }: PoetryEditorProps) {
  const { user } = useAuth()
  const isLyrics = projectData.category === "lyrics"
  const [scenes, setScenes] = useState(() => projectData.scenes ?? [])
  const [showSyllables, setShowSyllables] = useState(false)
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const poemRefs = useRef<Map<string, HTMLElement | null>>(new Map())
  // Poetry uses a snappier debounce than the prose-shaped editors —
  // lyrics/poem lines are short and the longer delay felt sluggish.
  const { saveStatus, scheduleSave } = useElementAutosave({ userId: user?.id, debounceMs: 1200 })
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
  // Last-focused body element — the target a new comment attaches to. Set by a
  // single focus listener on the scroll container (reads the focused el-<id>).
  const [focusedElementId, setFocusedElementId] = useState<string | null>(null)
  const activePoemId = useScrollSpy({
    refs: poemRefs,
    orderedIds: scenes.map((s) => s.id),
  })

  // Live co-editing + remote carets (no-op on the desktop build).
  const writeSurfaceRef = useRef<HTMLDivElement | null>(null)
  const { broadcastEdit, subscribeCarets, peersByElement } = useEditorRealtime({
    projectId: projectData.id,
    userId: user?.id,
    scenes,
    setScenes,
    surfaceRef: writeSurfaceRef,
    focusId: activePoemId,
    focusLabel: scenes.find((s) => s.id === activePoemId)?.scene_heading || "Untitled",
  })

  const { handleContentChange, refreshDocument } = useEditorDocument({
    projectId: projectData.id,
    userId: user?.id,
    units: scenes,
    setUnits: setScenes,
    scheduleSave,
    broadcastEdit,
    emptyUnitElementType: "line",
  })
  const { createUnit, insertElement: insertDocumentElement, deleteElement } = useEditorMutations({
    projectId: projectData.id,
    userId: user?.id,
    units: scenes,
    setUnits: setScenes,
  })
  const foundation = useDocumentFoundation({ projectId: projectData.id, userId: user?.id, scenes, setScenes })

  const totalLines = scenes.reduce((acc, s) => acc + countLines(s.elements ?? []), 0)
  const totalProseBlocks = scenes.reduce((acc, s) => acc + countProseBlocks(s.elements ?? []), 0)

  const saveMetadata = async (sceneId: string, metadata: DocumentMetadata) => {
    if (!user?.id) throw new Error("Sign in to save metadata.")
    const scene = scenes.find((item) => item.id === sceneId)
    if (!scene) throw new Error("This poem is no longer available.")
    const content = writeDocumentMetadata(scene.content, metadata)
    await updateSceneContent(sceneId, user.id, content)
    setScenes((current) => current.map((item) => item.id === sceneId ? { ...item, content } : item))
  }

  const activeScene = scenes.find((scene) => scene.id === activePoemId) ?? scenes[0]
  const activeMetadata = activeScene ? readDocumentMetadata(activeScene.content) : {}
  const indentFocusedLine = (direction: 1 | -1) => {
    const element = scenes.flatMap((scene) => scene.elements ?? []).find((item) => item.id === focusedElementId)
    if (!element || element.element_type !== "line") return
    const runs = readInlineRuns(element.content)
    if (direction === 1) runs.unshift({ text: "    " })
    else if (runs[0]) runs[0] = { ...runs[0], text: runs[0].text.replace(/^ {1,4}/, "") }
    handleContentChange(element.id, writeInlineRuns(runs), false)
  }
  const togglePoemAlignment = (sceneId: string) => {
    const scene = scenes.find((item) => item.id === sceneId)
    if (!scene) return
    const metadata = readDocumentMetadata(scene.content)
    void saveMetadata(sceneId, { ...metadata, alignment: metadata.alignment === "center" ? "left" : "center" }).catch((error) =>
      toast({ title: "Could not save alignment", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
    )
  }

  const applyTransposition = async (sceneId: string, semitones: number) => {
    if (!user?.id || !Number.isInteger(semitones) || Math.abs(semitones) > 11 || semitones === 0) return
    const scene = scenes.find((item) => item.id === sceneId)
    if (!scene) throw new Error("This song is no longer available.")
    const rows = (scene.elements ?? []).filter((item) => item.element_type === "chord_row")
    if (rows.some((row) => chordRowIssues(row.content).length)) throw new Error("Correct unrecognized chords before transposing.")
    try {
      for (const row of rows) await updateElementContent(row.id, user.id, transposeChordRow(row.content, semitones))
      const metadata = readDocumentMetadata(scene.content)
      const key = metadata.key ? transposeChord(metadata.key, semitones) : null
      if (key) await saveMetadata(sceneId, { ...metadata, key })
      setScenes((current) => current.map((item) => item.id === sceneId ? {
        ...item, elements: (item.elements ?? []).map((row) => row.element_type === "chord_row" ? { ...row, content: transposeChordRow(row.content, semitones) } : row),
      } : item))
    } catch (error) {
      await refreshDocument()
      throw error
    }
  }

  const activeCommentTarget = useEditorCommentTarget({ units: scenes, focusedElementId, activeUnitId: activePoemId })

  const sidebarItems = useMemo<EditorSidebarItem[]>(
    () =>
      scenes.map((scene, i) => {
        const lc = countLines(scene.elements ?? [])
        const pc = countProseBlocks(scene.elements ?? [])
        const here = peersByElement.get(scene.id)
        return {
          id: scene.id,
          title: scene.scene_heading || "Untitled",
          index: i + 1,
          meta: [lc > 0 ? `${lc} ${lc === 1 ? "line" : "lines"}` : "", pc > 0 ? `${pc} ${pc === 1 ? "paragraph" : "paragraphs"}` : ""].filter(Boolean).join(" · ") || undefined,
          commentTargetIds: [scene.id, ...(scene.elements ?? []).map((e) => e.id)],
          adornment: here && here.length ? <PresencePips peers={here} /> : undefined,
        }
      }),
    [scenes, peersByElement],
  )

  const handleAddPoem = async () => {
    const s = await createUnit()
    if (!s) return
    setTimeout(() => {
      poemRefs.current.get(s.id)?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 100)
  }

  // Import a poem/song file as new poems appended to this project. The parser
  // is chosen by the caller (plain text vs ChordPro).
  const runImport = async (
    parse: (text: string, title: string) => ParsedProject,
    text: string,
    fileName: string,
  ) => {
    if (!user?.id) return
    const title = fileName.replace(/\.[^/.]+$/, "")
    const parsed = parse(text, title)
    try {
      const created = await importIntoProject(projectData.id, user.id, parsed, scenes.length)
      setScenes((prev) => [...prev, ...created])
      if (created[0]) {
        setTimeout(() => {
          poemRefs.current.get(created[0].id)?.scrollIntoView({ behavior: "smooth", block: "start" })
        }, 100)
      }
      const word = created.length === 1 ? (isLyrics ? "song" : "poem") : isLyrics ? "songs" : "poems"
      toast({ title: "Import complete", description: `Added ${created.length} ${word} from ${fileName}.` })
    } catch (err) {
      console.error("Failed to import:", err)
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : "Couldn't import that file.",
        variant: "destructive",
      })
    }
  }

  const insertElement = async (
    sceneId: string,
    type: string,
    content: string,
    afterIdx?: number,
  ) => {
    return insertDocumentElement(sceneId, {
      elementType: type,
      content,
      afterIndex: afterIdx,
    })
  }

  const handleAddLine = async (sceneId: string, afterIdx?: number) => {
    const el = await insertElement(sceneId, "line", "", afterIdx)
    if (el) setTimeout(() => document.getElementById(`el-${el.id}`)?.focus(), 50)
  }

  const handleAddProseBlock = async (sceneId: string, afterIdx?: number) => {
    const el = await insertElement(sceneId, "prose_block", "", afterIdx)
    if (el) setTimeout(() => document.getElementById(`el-${el.id}`)?.focus(), 50)
  }

  const handleAddStanzaBreak = async (sceneId: string, afterIdx?: number) => {
    await insertElement(sceneId, "stanza_break", "", afterIdx)
  }

  const handleAddSectionLabel = async (sceneId: string, label: string, afterIdx?: number) => {
    const labelEl = await insertElement(sceneId, "section_label", label, afterIdx)
    if (!labelEl) return
    const scene = scenes.find(s => s.id === sceneId)
    const newAfter = afterIdx !== undefined ? afterIdx + 1 : (scene?.elements?.length ?? 0)
    const lineEl = await insertElement(sceneId, "line", "", newAfter)
    if (lineEl) setTimeout(() => document.getElementById(`el-${lineEl.id}`)?.focus(), 50)
  }

  const handleAddChordRow = async (sceneId: string, afterIdx?: number) => {
    const el = await insertElement(sceneId, "chord_row", "", afterIdx)
    if (el) setTimeout(() => document.getElementById(`el-${el.id}`)?.focus(), 50)
  }

  const handleDeleteElement = useCallback(
    async (sceneId: string, elementId: string) => {
      const ids: string[] = []
      for (const s of scenes) {
        for (const el of s.elements ?? []) {
          if (el.element_type === "stanza_break") continue
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
          title: "Couldn't delete that line",
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
      createPoetryKeymap({
        scenes,
        isLyrics,
        insertLineAfter: (sceneId, afterIdx) => void handleAddLine(sceneId, afterIdx),
        insertProseBlockAfter: (sceneId, afterIdx) => void handleAddProseBlock(sceneId, afterIdx),
        insertStanzaBreakAfter: (sceneId, afterIdx) =>
          void handleAddStanzaBreak(sceneId, afterIdx),
        insertSectionLabelAfter: (sceneId, afterIdx) =>
          void handleAddSectionLabel(sceneId, "Verse", afterIdx),
        insertChordRowAfter: (sceneId, afterIdx) => void handleAddChordRow(sceneId, afterIdx),
        deleteEmptyElement: (sceneId, elementId) => void handleDeleteElement(sceneId, elementId),
      }),
    // handleAdd* insert handlers intentionally omitted to avoid re-creating the keymap each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenes, isLyrics, handleDeleteElement],
  )

  const handleElementKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLDivElement>,
      sceneId: string,
      el: ProjectElement,
      elIdx: number,
    ) => {
      dispatchKey(e, keyMap, {
        sceneId,
        elementId: el.id,
        elementType: el.element_type,
        elementIndex: elIdx,
      })
    },
    [keyMap],
  )

  // Pack each poem's title + body onto A4 sheets; every poem opens a fresh sheet.
  const pages = useMemo<PoemBlock[][]>(() => {
    const blocks: PoemBlock[] = []
    scenes.forEach((scene, poemIdx) => {
      blocks.push({ key: `head-${scene.id}`, kind: "poemHead", scene, poemIdx })
      const els = scene.elements ?? []
      if (els.length === 0) {
        blocks.push({ key: `empty-${scene.id}`, kind: "emptyPoem", scene })
        return
      }
      let lineNumber = 0
      els.forEach((el, elIdx) => {
        if (el.element_type === "line") lineNumber++
        blocks.push({ key: el.id, kind: "element", scene, el, elIdx, lineNumber })
      })
    })
    const estimate = (b: PoemBlock): number => {
      if (b.kind === "poemHead") return 110
      if (b.kind === "emptyPoem") return 40
      switch (b.el.element_type) {
        case "stanza_break":
          return 20
        case "section_label":
          return 48
        case "prose_block":
          return Math.max(30, Math.ceil(plainInlineText(b.el.content).length / 65) * 30)
        case "chord_row":
          return 24
        case "tab_row":
        case "grid_row":
          return 24
        default:
          return 30
      }
    }
    return paginate(blocks, estimate, { maxHeight: 940, startsNewSheetBefore: (b) => b.kind === "poemHead" })
  }, [scenes])

  const railItems: RailEntry[] = [
    { type: "line", label: "Line", icon: AlignLeft },
    { type: "stanza_break", label: "Stanza break", icon: Minus },
    ...(!isLyrics ? [
      { type: "prose_block", label: "Prose poem paragraph", icon: Pilcrow },
      { type: "section_label", label: "Section heading", icon: Heading2 },
      { label: "Poem layout", icon: IndentIncrease, items: [
        { type: "indent_line", label: "Indent focused line", icon: IndentIncrease },
        { type: "outdent_line", label: "Outdent focused line", icon: IndentDecrease },
        { type: "toggle_center", label: "Center poem", icon: AlignCenter, active: activeMetadata.alignment === "center" },
      ] },
    ] : []),
    ...(isLyrics
      ? [
          { type: "section_label", label: "Section", icon: Tag },
          { type: "chord_row", label: "Chords", icon: Music },
          { type: "section_repeat", label: "Repeat section", icon: Repeat2 },
          { type: "tab_row", label: "Tab row", icon: AlignLeft },
          { type: "grid_row", label: "Chord grid", icon: Grid2X2 },
        ]
      : []),
  ]

  // Rail click: insert after the focused element, else append to the poem in view.
  const handleRailSelect = (type: string) => {
    let sceneId: string | undefined
    let afterIdx: number | undefined
    if (focusedElementId) {
      for (const s of scenes) {
        const idx = (s.elements ?? []).findIndex((e) => e.id === focusedElementId)
        if (idx >= 0) {
          sceneId = s.id
          afterIdx = idx
          break
        }
      }
    }
    sceneId = sceneId ?? activePoemId ?? scenes[0]?.id
    if (!sceneId) return
    switch (type) {
      case "line":
        void handleAddLine(sceneId, afterIdx)
        break
      case "prose_block":
        void handleAddProseBlock(sceneId, afterIdx)
        break
      case "stanza_break":
        void handleAddStanzaBreak(sceneId, afterIdx)
        break
      case "indent_line":
        indentFocusedLine(1)
        break
      case "outdent_line":
        indentFocusedLine(-1)
        break
      case "toggle_center":
        togglePoemAlignment(sceneId)
        break
      case "section_label":
        void handleAddSectionLabel(sceneId, isLyrics ? "Verse" : "Section", afterIdx)
        break
      case "chord_row":
        void handleAddChordRow(sceneId, afterIdx)
        break
      case "section_repeat":
        void insertElement(sceneId, type, "Chorus", afterIdx)
        break
      case "tab_row":
      case "grid_row":
        void insertElement(sceneId, type, "", afterIdx)
        break
    }
  }

  const renderBlock = (b: PoemBlock) => {
    if (b.kind === "poemHead") {
      return (
        <div key={b.key} ref={(el) => { poemRefs.current.set(b.scene.id, el) }}>
          <StableContentEditable
            id={`head-${b.scene.id}`}
            value={b.scene.scene_heading ?? ""}
            onValueChange={(next) => handleContentChange(b.scene.id, next, true)}
            className={cn(
              "text-2xl font-semibold outline-none mb-10 min-h-[2rem]",
              "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50",
              isLyrics ? "" : "text-center",
            )}
            data-placeholder={isLyrics ? "Song title" : "Poem title"}
          />
        </div>
      )
    }
    if (b.kind === "emptyPoem") {
      return (
        <StableContentEditable
          key={b.key}
          value=""
          onValueChange={() => { /* placeholder; first Enter creates a real line */ }}
          className="outline-none leading-loose min-h-[1.5rem] text-base empty:before:content-['First\00a0line…'] empty:before:text-muted-foreground/50"
          onKeyDown={async (e) => {
            if (e.key === "Enter") { e.preventDefault(); await handleAddLine(b.scene.id) }
          }}
        />
      )
    }
    const { scene, el, elIdx, lineNumber } = b
    if (el.element_type === "section_label") {
      return (
        <div key={el.id} className={cn("mt-8 mb-2", elIdx === 0 && "mt-0")}>
          <StableContentEditable
            id={`el-${el.id}`}
            value={el.content}
            onValueChange={(next) => handleContentChange(el.id, next, false)}
            onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
            className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground outline-none"
          />
        </div>
      )
    }
    if (el.element_type === "section_repeat" || el.element_type === "chorus_repeat") {
      return <div key={el.id} className="my-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">↻ Repeat
        <StableContentEditable id={`el-${el.id}`} value={el.content}
          onValueChange={(next) => handleContentChange(el.id, next, false)}
          onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
          className="min-w-20 outline-none" />
      </div>
    }
    if (el.element_type === "tab_row" || el.element_type === "grid_row") {
      return <InlineTextEditable key={el.id} id={`el-${el.id}`} value={el.content}
        onValueChange={(next) => handleContentChange(el.id, next, false)}
        onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
        className="min-h-5 whitespace-pre font-mono text-xs leading-6 outline-none empty:before:content-['Tab/grid…'] empty:before:text-muted-foreground/50" />
    }
    if (el.element_type === "chordpro_directive") {
      return <StableContentEditable key={el.id} id={`el-${el.id}`} value={el.content}
        onValueChange={(next) => handleContentChange(el.id, next, false)}
        onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
        className="min-h-5 whitespace-pre font-mono text-xs leading-6 outline-none empty:before:content-['Directive…'] empty:before:text-muted-foreground/50" />
    }
    if (el.element_type === "chord_row") {
      const issues = chordRowIssues(el.content)
      return (
        <div key={el.id} title={issues.length ? `Unrecognized chords: ${issues.join(", ")}` : undefined}>
        <StableContentEditable
          key={el.id}
          id={`el-${el.id}`}
          value={el.content}
          onValueChange={(next) => handleContentChange(el.id, next, false)}
          onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
          className={cn("font-mono text-xs outline-none leading-tight min-h-[1rem] mt-1 empty:before:content-['Chords…'] empty:before:text-muted-foreground/50", issues.length ? "text-amber-700 dark:text-amber-400" : "text-primary/70")}
        />
        </div>
      )
    }
    if (el.element_type === "stanza_break") {
      return <div key={el.id} className="h-5" />
    }
    if (el.element_type === "prose_block") {
      return <InlineTextEditable key={el.id} id={`el-${el.id}`} value={el.content}
        onValueChange={(next) => handleContentChange(el.id, next, false)}
        onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
        className="min-h-[1.5rem] whitespace-pre-wrap text-base leading-loose outline-none empty:before:content-['Prose\00a0paragraph…'] empty:before:text-muted-foreground/50" />
    }
    const metadata = readDocumentMetadata(scene.content)
    const centered = !isLyrics && metadata.alignment === "center"
    const numbering = metadata.lineNumbering ?? "every5"
    const showLineNum = !isLyrics && (numbering === "all" || (numbering === "every5" && lineNumber % 5 === 0))
    const lineText = plainInlineText(el.content)
    const sylCount = showSyllables && lineText.trim() ? syllable(lineText) : null
    return (
      <div key={el.id} className={cn("relative group/line", centered && !isLyrics && "text-center")}>
        {showLineNum && (
          <span className="absolute -right-8 top-0 text-xs text-muted-foreground/50 select-none leading-loose tabular-nums">
            {lineNumber}
          </span>
        )}
        {sylCount !== null && (
          <span
            className={cn(
              "absolute top-0 text-xs text-muted-foreground/60 select-none leading-loose tabular-nums",
              showLineNum ? "-right-16" : "-right-8",
            )}
            title={`${sylCount} syllable${sylCount === 1 ? "" : "s"}`}
          >
            {sylCount}σ
          </span>
        )}
        <InlineTextEditable
          id={`el-${el.id}`}
          value={el.content}
          onValueChange={(next) => handleContentChange(el.id, next, false)}
          onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
          className="outline-none leading-loose text-base min-h-[1.5rem] whitespace-pre-wrap empty:before:content-['\200b']"
        />
      </div>
    )
  }

  const commands: EditorCommand[] = [
    { id: "new-unit", label: isLyrics ? "New song" : "New poem", group: "Document", run: () => handleAddPoem() },
    { id: "line", label: "Insert line", group: "Insert", keywords: ["verse"], run: () => handleRailSelect("line") },
    { id: "stanza", label: "Insert stanza break", group: "Insert", run: () => handleRailSelect("stanza_break") },
    ...(!isLyrics ? [
      { id: "prose-block", label: "Insert prose poem paragraph", group: "Insert", run: () => handleRailSelect("prose_block") },
      { id: "poem-section", label: "Insert section heading", group: "Insert", run: () => handleRailSelect("section_label") },
    ] : []),
    ...(isLyrics ? [
      { id: "section", label: "Insert section", group: "Insert", run: () => handleRailSelect("section_label") },
      { id: "chords", label: "Insert chord row", group: "Insert", run: () => handleRailSelect("chord_row") },
      { id: "repeat", label: "Repeat section", group: "Insert", run: () => handleRailSelect("section_repeat") },
      { id: "tab", label: "Insert tab row", group: "Insert", run: () => handleRailSelect("tab_row") },
      { id: "grid", label: "Insert chord grid row", group: "Insert", run: () => handleRailSelect("grid_row") },
    ] : []),
    ...scenes.map((scene, index) => ({
      id: `go-${scene.id}`,
      label: `Go to ${scene.scene_heading || (isLyrics ? "untitled song" : "untitled poem")}`,
      group: "Navigate",
      keywords: [String(index + 1)],
      run: () => {
        poemRefs.current.get(scene.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
        document.getElementById(`head-${scene.id}`)?.focus()
      },
    })),
  ]

  return (
    <ProjectShell
      projectId={projectData.id}
      title={projectData.title}
      category={projectData.category}
      current="editor"
      sidebar={
      /* Poem/song sidebar — shared rail with list + comments. */
      <EditorSidebar
        headerIcon={isLyrics ? Music : Feather}
        headerLabel={isLyrics ? "Songs" : "Poems"}
        stats={[
          {
            icon: Hash,
            label: `${scenes.length} ${isLyrics ? (scenes.length === 1 ? "song" : "songs") : scenes.length === 1 ? "poem" : "poems"}`,
          },
          { icon: AlignLeft, label: `${totalLines} ${totalLines === 1 ? "line" : "lines"}` },
          ...(!isLyrics && totalProseBlocks > 0 ? [{ icon: Pilcrow, label: `${totalProseBlocks} ${totalProseBlocks === 1 ? "paragraph" : "paragraphs"}` }] : []),
        ]}
        items={sidebarItems}
        activeItemId={activePoemId}
        onItemClick={(id) => poemRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        addLabel={isLyrics ? "New song" : "New poem"}
        onAdd={handleAddPoem}
        emptyLabel={`No ${isLyrics ? "songs" : "poems"} yet.`}
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
              label: "Plain Text (.txt)",
              accept: ".txt",
              onFile: (text, fileName) => void runImport(parsePlainTextToPoetry, text, fileName),
            },
            {
              label: "ChordPro (.cho)",
              accept: ".cho,.crd,.chopro,.txt",
              onFile: (text, fileName) => void runImport(parseChordProToPoetry, text, fileName),
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
              label: "Export as ChordPro (.cho)",
              onClick: () => void runExport({
                extension: "cho",
                projectTitle: projectData.title,
                run: () => exportProjectToChordPro({ ...projectData, scenes }),
              }),
            },
            ...(!isLyrics ? [
              {
                label: "Submission PDF (.pdf)",
                onClick: () => void runExport({
                  extension: "pdf", projectTitle: projectData.title,
                  run: async () => {
                    const { downloadManuscript } = await import("@/lib/export/manuscript")
                    downloadManuscript({ ...projectData, scenes }, "poetry", "pdf")
                  },
                }),
              },
              {
                label: "Submission Word (.docx)",
                onClick: () => void runExport({
                  extension: "docx", projectTitle: projectData.title,
                  run: async () => {
                    const { downloadManuscript } = await import("@/lib/export/manuscript")
                    downloadManuscript({ ...projectData, scenes }, "poetry", "docx")
                  },
                }),
              },
            ] : []),
          ]}
          leading={
            <>
              {activeScene && (
                <DocumentMetadataDialog
                  key={activeScene.id}
                  scene={activeScene}
                  label={isLyrics ? "Song" : "Poem"}
                  onSave={saveMetadata}
                />
              )}
              <DocumentFoundationDialog
                category={isLyrics ? "lyrics" : "poetry"}
                scene={activeScene}
                onTemplate={foundation.createFromTemplate}
                onCapture={foundation.captureRevision}
                onVariant={foundation.openVariant}
              />
              {activeScene && <VerseToolsDialog scene={activeScene} isLyrics={isLyrics} onTranspose={applyTransposition} />}
              <EditorCommandPalette commands={commands} />
              <InlineFormattingToolbar />
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-7 w-7", showSyllables && "bg-muted text-foreground")}
                onClick={() => setShowSyllables(v => !v)}
                aria-label="Toggle syllable counts"
                aria-pressed={showSyllables}
                title={showSyllables ? "Hide syllable counts" : "Show syllable counts"}
              >
                <Hash className="h-3.5 w-3.5" />
              </Button>
              {!isLyrics && (
                <>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => indentFocusedLine(-1)} aria-label="Outdent focused line" title="Outdent focused line"><IndentDecrease className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => indentFocusedLine(1)} aria-label="Indent focused line" title="Indent focused line"><IndentIncrease className="h-3.5 w-3.5" /></Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-7 w-7", activeMetadata.alignment === "center" && "bg-muted text-foreground")}
                  onClick={() => activeScene && togglePoemAlignment(activeScene.id)}
                  aria-label="Toggle centered poem alignment"
                  aria-pressed={activeMetadata.alignment === "center"}
                  title={activeMetadata.alignment === "center" ? "Left align" : "Center align"}
                >
                  {activeMetadata.alignment === "center" ? <AlignLeft className="h-3.5 w-3.5" /> : <AlignCenter className="h-3.5 w-3.5" />}
                </Button>
                </>
              )}
            </>
          }
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
          currentUnitId={activePoemId ?? scenes[0]?.id}
          onToolComplete={() => void refreshDocument().catch(() => {})}
          onSurfaceFocus={(e) => {
            const id = (e.target as HTMLElement)?.id
            if (id?.startsWith("el-")) setFocusedElementId(id.slice(3))
          }}
        >
          <PagedSheets
            pages={pages}
            renderBlock={renderBlock}
            fontFamily={editorFontStack("poetry")}
            railItems={railItems}
            onRailSelect={handleRailSelect}
            railStorageKey="editor.rail.poetry"
            pageIdPrefix="poem-page"
            isEmpty={scenes.length === 0}
            emptyState={
              <EmptyEditorState
                message={`No ${isLyrics ? "songs" : "poems"} yet.`}
                actionLabel={isLyrics ? "Write first song" : "Write first poem"}
                onAction={handleAddPoem}
              />
            }
          />
        </EditorWorkspace>
    </ProjectShell>
  )
}
