"use client"

import { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, AlignCenter, AlignLeft, Music, Bot, Download, ChevronDown } from "lucide-react"
import { useDebouncedCallback } from "use-debounce"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/AuthContext"
import { AIChatPanel } from "./AIChatPanel"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { exportProjectToText } from "@/lib/export/text-export"
import {
  createScene,
  updateSceneHeading,
  updateElementContent,
  createSceneElement,
  type ScriptElement,
  type FullProject,
} from "@/services/project"

const POETRY_FORMS = ["Free Verse", "Sonnet", "Haiku", "Villanelle", "Ode", "Elegy", "Ballad", "Ghazal"]
const LYRICS_SECTION_TYPES = ["Verse", "Pre-Chorus", "Chorus", "Post-Chorus", "Bridge", "Hook", "Intro", "Outro", "Interlude"]

interface PoetryEditorProps {
  projectData: FullProject
}

function countLines(elements: ScriptElement[]): number {
  return elements.filter(el => el.element_type === "line").length
}

export function PoetryEditor({ projectData }: PoetryEditorProps) {
  const router = useRouter()
  const { user } = useAuth()
  const isLyrics = projectData.category === "lyrics"
  const [scenes, setScenes] = useState(() => projectData.scenes ?? [])
  const [centered, setCentered] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved")
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const poemRefs = useRef<Map<string, HTMLElement | null>>(new Map())

  const totalLines = scenes.reduce((acc, s) => acc + countLines(s.elements ?? []), 0)

  const debouncedSave = useDebouncedCallback(async (id: string, content: string, isScene: boolean) => {
    if (!user?.id) return
    setSaveStatus("saving")
    try {
      if (isScene) {
        await updateSceneHeading(id, user.id, content)
      } else {
        await updateElementContent(id, user.id, content)
      }
      setSaveStatus("saved")
    } catch {
      setSaveStatus("unsaved")
    }
  }, 1200)

  const handleContentChange = useCallback((id: string, content: string, isScene: boolean) => {
    setSaveStatus("unsaved")
    if (isScene) {
      setScenes(prev => prev.map(s => s.id === id ? { ...s, scene_heading: content } : s))
    } else {
      setScenes(prev => prev.map(s => ({
        ...s,
        elements: (s.elements ?? []).map(el => el.id === id ? { ...el, content } : el),
      })))
    }
    debouncedSave(id, content, isScene)
  }, [debouncedSave])

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

  const handleLineKeyDown = async (
    e: React.KeyboardEvent<HTMLDivElement>,
    sceneId: string,
    elIdx: number,
  ) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault()
      await handleAddStanzaBreak(sceneId, elIdx)
    } else if (e.key === "Enter") {
      e.preventDefault()
      await handleAddLine(sceneId, elIdx)
    }
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Poem/song sidebar */}
      <aside className="w-52 border-r flex flex-col shrink-0 bg-sidebar">
        <div className="p-3 border-b">
          <span className="text-sm font-medium">{isLyrics ? "Songs" : "Poems"}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {scenes.map((scene, i) => (
            <button
              key={scene.id}
              onClick={() => poemRefs.current.get(scene.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent group"
            >
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-xs text-muted-foreground/50 shrink-0">{i + 1}</span>
                <span className="truncate text-muted-foreground group-hover:text-foreground transition-colors">
                  {scene.scene_heading || "Untitled"}
                </span>
              </div>
              {countLines(scene.elements ?? []) > 0 && (
                <p className="text-xs text-muted-foreground/40 pl-4 mt-0.5">
                  {countLines(scene.elements ?? [])} lines
                </p>
              )}
            </button>
          ))}
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
        <header className="flex items-center justify-between px-6 py-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-base font-semibold leading-tight">{projectData.title}</h1>
              <p className="text-xs text-muted-foreground">{isLyrics ? "Lyrics" : "Poetry"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{totalLines} lines</span>
            {!isLyrics && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setCentered(c => !c)}
                title={centered ? "Left align" : "Center align"}
              >
                {centered ? <AlignLeft className="h-3.5 w-3.5" /> : <AlignCenter className="h-3.5 w-3.5" />}
              </Button>
            )}
            <span className={cn(
              "text-xs",
              saveStatus === "saved" && "text-green-600 dark:text-green-400",
              saveStatus === "saving" && "text-yellow-600 dark:text-yellow-400",
            )}>
              {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Unsaved"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                  <Download className="h-3.5 w-3.5" />
                  Export
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportProjectToText({ ...projectData, scenes })}>
                  Export as Plain Text (.txt)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsAIChatOpen(o => !o)} title="Writing Buddy">
              <Bot className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto bg-secondary dark:bg-background">
          <div className="inkwell-editor-content max-w-[600px] mx-auto px-8 py-16">
            {scenes.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-24 space-y-4">
                <p>No {isLyrics ? "songs" : "poems"} yet.</p>
                <Button variant="outline" size="sm" onClick={handleAddPoem}>
                  {isLyrics ? "Write first song" : "Write first poem"}
                </Button>
              </div>
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
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      onInput={(e) => handleContentChange(scene.id, e.currentTarget.textContent ?? "", true)}
                      className={cn(
                        "text-2xl font-semibold outline-none mb-1 min-h-[2rem]",
                        "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30",
                        isLyrics ? "" : "text-center",
                      )}
                      data-placeholder={isLyrics ? "Song title" : "Poem title"}
                    >
                      {scene.scene_heading || ""}
                    </div>

                    {/* Form label (poetry) or Key/Tempo (lyrics) */}
                    {isLyrics ? (
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        onInput={(e) => handleContentChange(scene.id + ":meta", e.currentTarget.textContent ?? "", false)}
                        className="text-xs text-muted-foreground/60 mb-10 outline-none empty:before:content-['Key\00a0•\00a0Tempo\00a0•\00a0Capo'] empty:before:text-muted-foreground/30"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground/50 text-center mb-10">
                        {/* form label slot — could be made editable later */}
                      </p>
                    )}

                    {/* Elements */}
                    <div className={cn("space-y-0", centered && !isLyrics && "text-center")}>
                      {elements.length === 0 ? (
                        <div
                          contentEditable
                          suppressContentEditableWarning
                          className="outline-none leading-loose min-h-[1.5rem] text-base empty:before:content-['First\00a0line…'] empty:before:text-muted-foreground/30"
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
                                <div
                                  id={`el-${el.id}`}
                                  contentEditable
                                  suppressContentEditableWarning
                                  onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                                  className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground outline-none"
                                >
                                  {el.content}
                                </div>
                              </div>
                            )
                          }

                          // chord_row — lyrics only, monospace, subdued
                          if (el.element_type === "chord_row") {
                            return (
                              <div
                                key={el.id}
                                id={`el-${el.id}`}
                                contentEditable
                                suppressContentEditableWarning
                                onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                                className="font-mono text-xs text-primary/70 outline-none leading-tight min-h-[1rem] mt-1 empty:before:content-['Chords…'] empty:before:text-muted-foreground/20"
                              >
                                {el.content}
                              </div>
                            )
                          }

                          // stanza_break — blank line between stanzas
                          if (el.element_type === "stanza_break") {
                            return <div key={el.id} className="h-5" />
                          }

                          // line — poetry/lyrics body line with optional line number
                          lineNumber++
                          const showLineNum = !isLyrics && !centered && lineNumber % 5 === 0

                          return (
                            <div key={el.id} className="relative group/line">
                              {showLineNum && (
                                <span className="absolute -right-8 top-0 text-xs text-muted-foreground/30 select-none leading-loose tabular-nums">
                                  {lineNumber}
                                </span>
                              )}
                              <div
                                id={`el-${el.id}`}
                                contentEditable
                                suppressContentEditableWarning
                                onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                                onKeyDown={(e) => handleLineKeyDown(e, scene.id, elIdx)}
                                className="outline-none leading-loose text-base min-h-[1.5rem] empty:before:content-['\200b']"
                              >
                                {el.content}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>

                    {/* Insert toolbar */}
                    <div className="flex items-center gap-1 mt-8 flex-wrap opacity-0 hover:opacity-100 transition-opacity">
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
        <AIChatPanel isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} category={projectData.category} />
        </div>
      </div>
    </div>
  )
}
