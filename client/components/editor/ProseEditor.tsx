"use client"

import { useState, useCallback, useMemo, useRef } from "react"
import { Plus, BookOpen, Pilcrow, Quote, Heading, Clock, Asterisk } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InsertMenu, type InsertItem } from "./shared/insert-menu"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/AuthContext"
import { useTheme } from "@/lib/ThemeContext"
import { useToast } from "@/hooks/use-toast"
import { AIChatPanel } from "./AIChatPanel"
import { EditorHeader } from "./shared/EditorHeader"
import { EmptyEditorState } from "./shared/EmptyEditorState"
import { useElementAutosave } from "./shared/useElementAutosave"
import { dispatchKey } from "@/lib/editor/keymap"
import { createProseKeymap } from "./prose/keymap"
import { exportProjectToText, exportProjectToMarkdown } from "@/lib/export/text-export"
import { useExportToast } from "@/lib/export/use-export-toast"
import { StableContentEditable } from "./shared/StableContentEditable"
import { useScrollSpy } from "./shared/useScrollSpy"
import {
  createScene,
  createSceneElement,
  type ProjectElement,
  type FullProject,
} from "@/services/project"
import { deleteScriptElement, updateScriptElement } from "@/services/editor"

type ProseElementType =
  | "chapter_heading"
  | "paragraph"
  | "dialogue"
  | "scene_break"
  | "scene_heading_stinger"

/** Prose's element vocabulary for the shared insert menu (gutter + / "/"). */
const PROSE_INSERT_ITEMS: InsertItem[] = [
  { type: "paragraph", command: "p", label: "Paragraph", description: "Body text", icon: Pilcrow },
  { type: "dialogue", command: "d", label: "Dialogue", description: "A spoken line", icon: Quote },
  { type: "chapter_heading", command: "h", label: "Section heading", description: "A titled break", icon: Heading },
  { type: "scene_heading_stinger", command: "s", label: "Stinger", description: "A time or place jump", icon: Clock },
  { type: "scene_break", command: "b", label: "Scene break", description: "* * *", icon: Asterisk },
]

/** Wraps a block so a quiet "+" handle appears in the left gutter on
 *  hover/focus — the mouse way to open the insert menu. */
function ProseBlock({ children, onInsert }: { children: React.ReactNode; onInsert: (rect: DOMRect) => void }) {
  return (
    <div className="group relative">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Insert element"
        onClick={(e) => {
          e.stopPropagation()
          onInsert(e.currentTarget.getBoundingClientRect())
        }}
        className="absolute -left-9 top-0.5 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <Plus className="h-4 w-4" />
      </button>
      {children}
    </div>
  )
}

interface ProseEditorProps {
  projectData: FullProject
}

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
  const activeChapterId = useScrollSpy({
    refs: chapterRefs,
    orderedIds: scenes.map((s) => s.id),
  })

  // The shared insert menu — opened by the gutter "+" (insert after a block) or
  // by "/" on an empty line (transform that block). One menu, two triggers.
  type InsertMenuState =
    | { mode: "insert"; sceneId: string; afterIdx?: number; position: { top: number; left: number } }
    | { mode: "transform"; sceneId: string; elementId: string; position: { top: number; left: number } }
  const [insertMenu, setInsertMenu] = useState<InsertMenuState | null>(null)

  const openInsertAfter = useCallback((sceneId: string, afterIdx: number | undefined, rect: DOMRect) => {
    setInsertMenu({ mode: "insert", sceneId, afterIdx, position: { top: rect.bottom + 6, left: rect.left } })
  }, [])

  const openTransform = useCallback((sceneId: string, elementId: string, rect: DOMRect) => {
    setInsertMenu({ mode: "transform", sceneId, elementId, position: { top: rect.bottom + 6, left: rect.left } })
  }, [])

  const totalWords = scenes.reduce((acc, scene) => {
    return acc + (scene.elements ?? []).reduce((s, el) => s + wordCount(el.content), 0)
  }, 0)

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
  }, [scheduleSave])

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
      // "/" on an empty line opens the insert menu to turn the line into an element.
      if (e.key === "/" && (el.content ?? "") === "") {
        e.preventDefault()
        openTransform(sceneId, el.id, e.currentTarget.getBoundingClientRect())
        return
      }
      dispatchKey(e, keyMap, { sceneId, elementId: el.id, elementIndex: elIdx })
    },
    [keyMap, openTransform],
  )

  return (
    <div className="flex h-screen bg-background">
      {/* Chapter sidebar */}
      <aside className="w-52 border-r flex flex-col shrink-0 bg-sidebar">
        <div className="flex items-center gap-2 p-3 border-b">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Chapters</span>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {scenes.map((scene, i) => {
            const chWords = (scene.elements ?? []).reduce((a, el) => a + wordCount(el.content), 0)
            const isActive = scene.id === activeChapterId
            return (
              <button
                key={scene.id}
                onClick={() => chapterRefs.current.get(scene.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors group",
                  isActive ? "bg-muted text-foreground" : "hover:bg-accent",
                )}
              >
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className={cn("text-xs shrink-0", isActive ? "text-muted-foreground" : "text-muted-foreground/50")}>{i + 1}</span>
                  <span className={cn(
                    "truncate transition-colors",
                    isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                  )}>
                    {scene.scene_heading || "Untitled"}
                  </span>
                </div>
                {chWords > 0 && (
                  <p className="text-xs text-muted-foreground/60 pl-4 mt-0.5">{chWords.toLocaleString()}w</p>
                )}
              </button>
            )
          })}
        </div>

        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full gap-2 justify-start text-xs" onClick={handleAddChapter}>
            <Plus className="h-3.5 w-3.5" />
            Add chapter
          </Button>
        </div>
      </aside>

      {/* Main editor */}
      <div className="flex flex-col flex-1 min-w-0">
        <EditorHeader
          title={projectData.title}
          subtitle={projectData.category === "memoir" ? "Memoir" : "Novel"}
          statRight={`${totalWords.toLocaleString()} words`}
          saveStatus={saveStatus}
          onToggleAI={() => setIsAIChatOpen(o => !o)}
          isAIOpen={isAIChatOpen}
          projectId={projectData.id}
          category={projectData.category}
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

        <div className="flex flex-1 overflow-hidden">
        {/* Manuscript scroll area */}
        <div className="flex-1 overflow-y-auto bg-secondary dark:bg-background">
          <div
            className="inkwell-editor-content max-w-[680px] mx-auto px-10 py-16"
            style={{ fontFamily: editorFontStack("prose") }}
          >
            {scenes.length === 0 ? (
              <EmptyEditorState
                message="No chapters yet."
                actionLabel="Add first chapter"
                onAction={handleAddChapter}
              />
            ) : (
              scenes.map((scene, chapterIdx) => (
                <div
                  key={scene.id}
                  ref={(el) => { chapterRefs.current.set(scene.id, el) }}
                  className={cn("mb-24", chapterIdx > 0 && "pt-16 border-t border-border/40")}
                >
                  {/* Chapter label — centered, small caps feel */}
                  <p className="text-center text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2 select-none">
                    Chapter {chapterIdx + 1}
                  </p>

                  {/* Chapter title — centered, editable */}
                  <StableContentEditable
                    value={scene.scene_heading ?? ""}
                    onValueChange={(next) => handleContentChange(scene.id, next, true)}
                    className="text-center text-2xl font-semibold outline-none mb-14 min-h-[2rem] empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50"
                    data-placeholder="Untitled"
                  />

                  {/* Body elements */}
                  <div className="text-base leading-loose">
                    {(scene.elements ?? []).length === 0 ? (
                      <ProseBlock onInsert={(rect) => openInsertAfter(scene.id, undefined, rect)}>
                        <StableContentEditable
                          value=""
                          onValueChange={() => { /* empty-state placeholder; real input arrives once the first paragraph is created */ }}
                          className="outline-none pl-10 min-h-[1.75rem] empty:before:content-['Start\00a0writing…'] empty:before:text-muted-foreground/50 empty:before:pl-0"
                          onKeyDown={async (e) => {
                            if (e.key === "/") {
                              e.preventDefault()
                              openInsertAfter(scene.id, undefined, e.currentTarget.getBoundingClientRect())
                              return
                            }
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault()
                              await handleAddElement(scene.id, "paragraph")
                            }
                          }}
                        />
                      </ProseBlock>
                    ) : (
                      (scene.elements ?? []).map((el, elIdx) => (
                        <ProseBlock key={el.id} onInsert={(rect) => openInsertAfter(scene.id, elIdx, rect)}>
                          {el.element_type === "scene_break" ? (
                            <div className="text-center text-muted-foreground my-8 tracking-widest select-none">
                              * * *
                            </div>
                          ) : el.element_type === "chapter_heading" ? (
                            <StableContentEditable
                              id={`el-${el.id}`}
                              value={el.content}
                              onValueChange={(next) => handleContentChange(el.id, next, false)}
                              onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
                              className="text-xl font-semibold mt-10 mb-3 outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50"
                              data-placeholder="Section heading"
                            />
                          ) : el.element_type === "scene_heading_stinger" ? (
                            // Stage-direction-style opener: small caps, italic,
                            // hairline rule. "Three weeks later." etc.
                            <StableContentEditable
                              id={`el-${el.id}`}
                              value={el.content}
                              onValueChange={(next) => handleContentChange(el.id, next, false)}
                              onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
                              className="mt-12 mb-6 italic text-base tracking-wider uppercase text-foreground/80 border-b border-border/40 pb-2 outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 empty:before:not-italic empty:before:normal-case empty:before:tracking-normal"
                              data-placeholder="Stinger…"
                            />
                          ) : el.element_type === "dialogue" ? (
                            // Hanging indent + opening curly quote, set apart from prose.
                            <StableContentEditable
                              id={`el-${el.id}`}
                              value={el.content}
                              onValueChange={(next) => handleContentChange(el.id, next, false)}
                              onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
                              className="outline-none min-h-[1.75rem] pl-10 -indent-6 leading-relaxed before:content-['“'] before:mr-1 before:text-muted-foreground/60 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 empty:before:pl-0 empty:before:mr-0"
                              data-placeholder="Dialogue…"
                            />
                          ) : (
                            // paragraph — first-line indent except right after a break
                            <StableContentEditable
                              id={`el-${el.id}`}
                              value={el.content}
                              onValueChange={(next) => handleContentChange(el.id, next, false)}
                              onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
                              className={cn(
                                "outline-none min-h-[1.75rem]",
                                elIdx === 0 ||
                                  ["chapter_heading", "scene_heading_stinger", "dialogue", "scene_break"].includes(
                                    (scene.elements ?? [])[elIdx - 1]?.element_type ?? "",
                                  )
                                  ? ""
                                  : "pl-10",
                                "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 empty:before:pl-0",
                              )}
                              data-placeholder={elIdx === 0 ? "Start writing…" : ""}
                            />
                          )}
                        </ProseBlock>
                      ))
                    )}
                  </div>

                  {/* One quiet end-of-chapter affordance — replaces the old button
                      row. Teaches the slash shortcut; the per-block gutter "+"
                      handles inserting between existing blocks. */}
                  {(scene.elements ?? []).length > 0 && (
                    <button
                      type="button"
                      onClick={(e) =>
                        openInsertAfter(scene.id, (scene.elements ?? []).length - 1, e.currentTarget.getBoundingClientRect())
                      }
                      className="mt-6 flex w-full items-center gap-2 rounded px-1 py-1.5 text-xs text-muted-foreground/40 transition-colors hover:bg-muted/40 hover:text-muted-foreground"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0" />
                      <span>Insert a block — or press &ldquo;/&rdquo; on an empty line</span>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
        <AIChatPanel isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} category={projectData.category} projectId={projectData.id} />
        </div>
      </div>

      {insertMenu && (
        <InsertMenu
          items={PROSE_INSERT_ITEMS}
          position={insertMenu.position}
          onSelect={(type) => {
            if (insertMenu.mode === "insert") {
              void handleAddElement(insertMenu.sceneId, type as ProseElementType, insertMenu.afterIdx)
            } else {
              void handleTransformElement(insertMenu.sceneId, insertMenu.elementId, type as ProseElementType)
            }
            setInsertMenu(null)
          }}
          onDismiss={() => setInsertMenu(null)}
        />
      )}
    </div>
  )
}
