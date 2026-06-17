"use client"

import { useState, useCallback, useMemo, useRef } from "react"
import { Plus, AlignCenter, AlignLeft, Music, Hash } from "lucide-react"
import { syllable } from "syllable"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/AuthContext"
import { useTheme } from "@/lib/ThemeContext"
import { useToast } from "@/hooks/use-toast"
import { AIChatPanel } from "./AIChatPanel"
import { EditorHeader } from "./shared/EditorHeader"
import { EmptyEditorState } from "./shared/EmptyEditorState"
import { useElementAutosave } from "./shared/useElementAutosave"
import { dispatchKey } from "@/lib/editor/keymap"
import { createPoetryKeymap } from "./poetry/keymap"
import { exportProjectToText } from "@/lib/export/text-export"
import { exportProjectToChordPro } from "@/lib/export/chordpro"
import { useExportToast } from "@/lib/export/use-export-toast"
import { StableContentEditable } from "./shared/StableContentEditable"
import { useScrollSpy } from "./shared/useScrollSpy"
import {
  createScene,
  createSceneElement,
  type ProjectElement,
  type FullProject,
} from "@/services/project"
import { deleteScriptElement } from "@/services/editor"

const POETRY_FORMS = ["Free Verse", "Sonnet", "Haiku", "Villanelle", "Ode", "Elegy", "Ballad", "Ghazal"]
const LYRICS_SECTION_TYPES = ["Verse", "Pre-Chorus", "Chorus", "Post-Chorus", "Bridge", "Hook", "Intro", "Outro", "Interlude"]

interface PoetryEditorProps {
  projectData: FullProject
}

function countLines(elements: ProjectElement[]): number {
  return elements.filter(el => el.element_type === "line").length
}

export function PoetryEditor({ projectData }: PoetryEditorProps) {
  const { user } = useAuth()
  const isLyrics = projectData.category === "lyrics"
  const [scenes, setScenes] = useState(() => projectData.scenes ?? [])
  const [centered, setCentered] = useState(false)
  const [showSyllables, setShowSyllables] = useState(false)
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const poemRefs = useRef<Map<string, HTMLElement | null>>(new Map())
  // Poetry uses a snappier debounce than the prose-shaped editors —
  // lyrics/poem lines are short and the longer delay felt sluggish.
  const { saveStatus, scheduleSave } = useElementAutosave({ userId: user?.id, debounceMs: 1200 })
  const runExport = useExportToast()
  const { toast } = useToast()
  const { editorFontStack } = useTheme()
  const activePoemId = useScrollSpy({
    refs: poemRefs,
    orderedIds: scenes.map((s) => s.id),
  })

  const totalLines = scenes.reduce((acc, s) => acc + countLines(s.elements ?? []), 0)

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

  const handleAddPoem = async () => {
    if (!user?.id) return
    const s = await createScene(projectData.id, user.id, {
      scene_heading: "",
      content: "",
      order_index: scenes.length,
    })
    const newScene = { ...s, elements: [] }
    setScenes(prev => [...prev, newScene])
    setTimeout(() => {
      poemRefs.current.get(s.id)?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 100)
  }

  const insertElement = async (
    sceneId: string,
    type: string,
    content: string,
    afterIdx?: number,
  ) => {
    if (!user?.id) return null
    const scene = scenes.find(s => s.id === sceneId)
    if (!scene) return null
    const insertAt = afterIdx !== undefined ? afterIdx + 1 : (scene.elements?.length ?? 0)
    const el = await createSceneElement(projectData.id, sceneId, user.id, {
      element_type: type,
      content,
      order_index: insertAt,
    })
    setScenes(prev => prev.map(s => {
      if (s.id !== sceneId) return s
      const els = [...(s.elements ?? [])]
      els.splice(insertAt, 0, el)
      return { ...s, elements: els }
    }))
    return el
  }

  const handleAddLine = async (sceneId: string, afterIdx?: number) => {
    const el = await insertElement(sceneId, "line", "", afterIdx)
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
    [scenes],
  )

  const keyMap = useMemo(
    () =>
      createPoetryKeymap({
        scenes,
        isLyrics,
        insertLineAfter: (sceneId, afterIdx) => void handleAddLine(sceneId, afterIdx),
        insertStanzaBreakAfter: (sceneId, afterIdx) =>
          void handleAddStanzaBreak(sceneId, afterIdx),
        insertSectionLabelAfter: (sceneId, afterIdx) =>
          void handleAddSectionLabel(sceneId, "Verse", afterIdx),
        insertChordRowAfter: (sceneId, afterIdx) => void handleAddChordRow(sceneId, afterIdx),
        deleteEmptyElement: (sceneId, elementId) => void handleDeleteElement(sceneId, elementId),
      }),
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

  return (
    <div className="flex h-screen bg-background">
      {/* Poem/song sidebar */}
      <aside className="w-52 border-r flex flex-col shrink-0 bg-sidebar">
        <div className="p-3 border-b">
          <span className="text-sm font-medium">{isLyrics ? "Songs" : "Poems"}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {scenes.map((scene, i) => {
            const isActive = scene.id === activePoemId
            return (
            <button
              key={scene.id}
              onClick={() => poemRefs.current.get(scene.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
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
              {countLines(scene.elements ?? []) > 0 && (
                <p className="text-xs text-muted-foreground/60 pl-4 mt-0.5">
                  {countLines(scene.elements ?? [])} lines
                </p>
              )}
            </button>
            )
          })}
        </div>
        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full gap-2 justify-start text-xs" onClick={handleAddPoem}>
            <Plus className="h-3.5 w-3.5" />
            {isLyrics ? "New song" : "New poem"}
          </Button>
        </div>
      </aside>

      {/* Main editor */}
      <div className="flex flex-col flex-1 min-w-0">
        <EditorHeader
          title={projectData.title}
          subtitle={isLyrics ? "Lyrics" : "Poetry"}
          statRight={`${totalLines} lines`}
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
              label: "Export as ChordPro (.cho)",
              onClick: () => void runExport({
                extension: "cho",
                projectTitle: projectData.title,
                run: () => exportProjectToChordPro({ ...projectData, scenes }),
              }),
            },
          ]}
          extras={
            <>
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
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-7 w-7", centered && "bg-muted text-foreground")}
                  onClick={() => setCentered(c => !c)}
                  aria-label="Toggle centered poem alignment"
                  aria-pressed={centered}
                  title={centered ? "Left align" : "Center align"}
                >
                  {centered ? <AlignLeft className="h-3.5 w-3.5" /> : <AlignCenter className="h-3.5 w-3.5" />}
                </Button>
              )}
            </>
          }
        />

        <div className="flex flex-1 overflow-hidden">
        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto bg-secondary dark:bg-background">
          <div
            className="inkwell-editor-content max-w-[600px] mx-auto px-8 py-16"
            style={{ fontFamily: editorFontStack("poetry") }}
          >
            {scenes.length === 0 ? (
              <EmptyEditorState
                message={`No ${isLyrics ? "songs" : "poems"} yet.`}
                actionLabel={isLyrics ? "Write first song" : "Write first poem"}
                onAction={handleAddPoem}
              />
            ) : (
              scenes.map((scene, poemIdx) => {
                const elements = scene.elements ?? []
                let lineNumber = 0

                return (
                  <div
                    key={scene.id}
                    ref={(el) => { poemRefs.current.set(scene.id, el) }}
                    className={cn("mb-20", poemIdx > 0 && "pt-16 border-t border-border/40")}
                  >
                    {/* Title */}
                    <StableContentEditable
                      value={scene.scene_heading ?? ""}
                      onValueChange={(next) => handleContentChange(scene.id, next, true)}
                      className={cn(
                        "text-2xl font-semibold outline-none mb-1 min-h-[2rem]",
                        "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50",
                        isLyrics ? "" : "text-center",
                      )}
                      data-placeholder={isLyrics ? "Song title" : "Poem title"}
                    />

                    {/* Form label (poetry) or Key/Tempo (lyrics) */}
                    {isLyrics ? (
                      <StableContentEditable
                        value=""
                        onValueChange={(next) => handleContentChange(scene.id + ":meta", next, false)}
                        className="text-xs text-muted-foreground/60 mb-10 outline-none empty:before:content-['Key\00a0•\00a0Tempo\00a0•\00a0Capo'] empty:before:text-muted-foreground/50"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground/50 text-center mb-10">
                        {/* form label slot — could be made editable later */}
                      </p>
                    )}

                    {/* Elements */}
                    <div className={cn("space-y-0", centered && !isLyrics && "text-center")}>
                      {elements.length === 0 ? (
                        <StableContentEditable
                          value=""
                          onValueChange={() => { /* empty-state placeholder; first Enter creates a real line */ }}
                          className="outline-none leading-loose min-h-[1.5rem] text-base empty:before:content-['First\00a0line…'] empty:before:text-muted-foreground/50"
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") { e.preventDefault(); await handleAddLine(scene.id) }
                          }}
                        />
                      ) : (
                        elements.map((el, elIdx) => {
                          // section_label — lyrics only
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

                          // chord_row — lyrics only, monospace, subdued
                          if (el.element_type === "chord_row") {
                            return (
                              <StableContentEditable
                                key={el.id}
                                id={`el-${el.id}`}
                                value={el.content}
                                onValueChange={(next) => handleContentChange(el.id, next, false)}
                                onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
                                className="font-mono text-xs text-primary/70 outline-none leading-tight min-h-[1rem] mt-1 empty:before:content-['Chords…'] empty:before:text-muted-foreground/50"
                              />
                            )
                          }

                          // stanza_break — blank line between stanzas
                          if (el.element_type === "stanza_break") {
                            return <div key={el.id} className="h-5" />
                          }

                          // line — poetry/lyrics body line with optional line number
                          lineNumber++
                          const showLineNum = !isLyrics && !centered && lineNumber % 5 === 0
                          const sylCount = showSyllables && el.content.trim()
                            ? syllable(el.content)
                            : null

                          return (
                            <div key={el.id} className="relative group/line">
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
                              <StableContentEditable
                                id={`el-${el.id}`}
                                value={el.content}
                                onValueChange={(next) => handleContentChange(el.id, next, false)}
                                onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
                                className="outline-none leading-loose text-base min-h-[1.5rem] empty:before:content-['\200b']"
                              />
                            </div>
                          )
                        })
                      )}
                    </div>

                    {/* Insert toolbar */}
                    <div className="flex items-center gap-1 mt-8 flex-wrap opacity-60 hover:opacity-100 transition-opacity">
                      <span className="text-xs text-muted-foreground/60 mr-1">Insert</span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddLine(scene.id)}>
                        Line
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddStanzaBreak(scene.id)}>
                        Stanza break
                      </Button>
                      {isLyrics ? (
                        <>
                          {LYRICS_SECTION_TYPES.map(s => (
                            <Button key={s} variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddSectionLabel(scene.id, s)}>
                              {s}
                            </Button>
                          ))}
                          <Button variant="ghost" size="sm" className="h-6 text-xs px-2 gap-1" onClick={() => handleAddChordRow(scene.id)}>
                            <Music className="h-3 w-3" />
                            Chords
                          </Button>
                        </>
                      ) : (
                        POETRY_FORMS.slice(0, 4).map(f => (
                          <Button key={f} variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => {}}>
                            {f}
                          </Button>
                        ))
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
        <AIChatPanel isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} category={projectData.category} projectId={projectData.id} />
        </div>
      </div>
    </div>
  )
}
