"use client"

import { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, BookOpen, Bot, Download, ChevronDown } from "lucide-react"
import { useDebouncedCallback } from "use-debounce"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/AuthContext"
import { AIChatPanel } from "./AIChatPanel"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { exportProjectToText, exportProjectToMarkdown } from "@/lib/export/text-export"
import {
  createScene,
  updateSceneHeading,
  updateElementContent,
  createSceneElement,
  type ScriptElement,
  type FullProject,
} from "@/services/project"

type ProseElementType = "chapter_heading" | "paragraph" | "scene_break"

interface ProseEditorProps {
  projectData: FullProject
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function ProseEditor({ projectData }: ProseEditorProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [scenes, setScenes] = useState(() => projectData.scenes ?? [])
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved")
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const chapterRefs = useRef<Map<string, HTMLElement | null>>(new Map())

  const totalWords = scenes.reduce((acc, scene) => {
    return acc + (scene.elements ?? []).reduce((s, el) => s + wordCount(el.content), 0)
  }, 0)

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
  }, 1500)

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

  const handleElementKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    sceneId: string,
    el: ScriptElement,
    elIdx: number,
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleAddElement(sceneId, "paragraph", elIdx)
    }
  }

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
            return (
              <button
                key={scene.id}
                onClick={() => chapterRefs.current.get(scene.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent group"
              >
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-xs text-muted-foreground/50 shrink-0">{i + 1}</span>
                  <span className="truncate text-muted-foreground group-hover:text-foreground transition-colors">
                    {scene.scene_heading || "Untitled"}
                  </span>
                </div>
                {chWords > 0 && (
                  <p className="text-xs text-muted-foreground/40 pl-4 mt-0.5">{chWords.toLocaleString()}w</p>
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
        <header className="flex items-center justify-between px-6 py-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-base font-semibold leading-tight">{projectData.title}</h1>
              <p className="text-xs text-muted-foreground">
                {projectData.category === "memoir" ? "Memoir" : "Novel"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{totalWords.toLocaleString()} words</span>
            <span className={cn(
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
                <DropdownMenuItem onClick={() => exportProjectToMarkdown({ ...projectData, scenes })}>
                  Export as Markdown (.md)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsAIChatOpen(o => !o)} title="Writing Buddy">
              <Bot className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
        {/* Manuscript scroll area */}
        <div className="flex-1 overflow-y-auto bg-secondary dark:bg-background">
          <div className="inkwell-editor-content max-w-[680px] mx-auto px-10 py-16">
            {scenes.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-24 space-y-4">
                <p>No chapters yet.</p>
                <Button variant="outline" size="sm" onClick={handleAddChapter}>Add first chapter</Button>
              </div>
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
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => handleContentChange(scene.id, e.currentTarget.textContent ?? "", true)}
                    className="text-center text-2xl font-semibold outline-none mb-14 min-h-[2rem] empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30"
                    data-placeholder="Untitled"
                  >
                    {scene.scene_heading || ""}
                  </div>

                  {/* Body elements */}
                  <div className="text-base leading-loose">
                    {(scene.elements ?? []).length === 0 ? (
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        className="outline-none pl-10 min-h-[1.75rem] empty:before:content-['Start\00a0writing…'] empty:before:text-muted-foreground/30 empty:before:pl-0"
                        onKeyDown={async (e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault()
                            await handleAddElement(scene.id, "paragraph")
                          }
                        }}
                      />
                    ) : (
                      (scene.elements ?? []).map((el, elIdx) => {
                        if (el.element_type === "scene_break") {
                          return (
                            <div key={el.id} className="text-center text-muted-foreground my-8 tracking-widest select-none">
                              * * *
                            </div>
                          )
                        }

                        if (el.element_type === "chapter_heading") {
                          return (
                            <div
                              key={el.id}
                              id={`el-${el.id}`}
                              contentEditable
                              suppressContentEditableWarning
                              onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                              onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
                              className="text-xl font-semibold mt-10 mb-3 outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30"
                              data-placeholder="Section heading"
                            >
                              {el.content}
                            </div>
                          )
                        }

                        // paragraph — standard first-line indent, no gap between consecutive paragraphs
                        return (
                          <div
                            key={el.id}
                            id={`el-${el.id}`}
                            contentEditable
                            suppressContentEditableWarning
                            onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                            onKeyDown={(e) => handleElementKeyDown(e, scene.id, el, elIdx)}
                            className={cn(
                              "outline-none min-h-[1.75rem]",
                              // First paragraph after chapter title or a section heading has no indent
                              elIdx === 0 || (scene.elements ?? [])[elIdx - 1]?.element_type === "chapter_heading"
                                ? ""
                                : "pl-10",
                              "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30 empty:before:pl-0",
                            )}
                            data-placeholder={elIdx === 0 ? "Start writing…" : ""}
                          >
                            {el.content}
                          </div>
                        )
                      })
                    )}
                  </div>

                  {/* Insert toolbar — shown faintly below each chapter body */}
                  <div className="flex items-center gap-1 mt-8 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <span className="text-xs text-muted-foreground/60 mr-1">Insert</span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(scene.id, "paragraph")}>
                      Paragraph
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(scene.id, "chapter_heading")}>
                      Section
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(scene.id, "scene_break")}>
                      Scene break
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <AIChatPanel isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} category={projectData.category} projectId={projectData.id} />
        </div>
      </div>
    </div>
  )
}
