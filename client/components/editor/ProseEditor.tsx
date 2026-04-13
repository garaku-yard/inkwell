"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, BookOpen, AlignLeft } from "lucide-react"
import { useDebouncedCallback } from "use-debounce"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/AuthContext"
import {
  getProjectScenes,
  createScene,
  updateSceneHeading,
  updateElementContent,
  createSceneElement,
  type Scene,
  type ScriptElement,
  type FullProject,
} from "@/services/project"

// Element types for prose: chapter_heading | paragraph | scene_break
type ProseElementType = "chapter_heading" | "paragraph" | "scene_break"

const PLACEHOLDER: Record<ProseElementType, string> = {
  chapter_heading: "Chapter Title",
  paragraph: "Start writing…",
  scene_break: "* * *",
}

interface ProseEditorProps {
  projectData: FullProject
}

export function ProseEditor({ projectData }: ProseEditorProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [scenes, setScenes] = useState<Scene[]>([])
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const [elements, setElements] = useState<ScriptElement[]>([])
  const [wordCount, setWordCount] = useState(0)
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved")
  const containerRef = useRef<HTMLDivElement>(null)

  const categoryLabel = projectData.category === "memoir" ? "Memoir" : "Novel"

  // Load chapters (scenes)
  useEffect(() => {
    if (!user?.id) return
    getProjectScenes(projectData.id, user.id).then((data) => {
      setScenes(data)
      if (data.length > 0) setActiveSceneId(data[0].id)
    }).catch(console.error)
  }, [projectData.id, user?.id])

  // Load elements for active chapter
  useEffect(() => {
    if (!activeSceneId || !user?.id) return
    const scene = scenes.find(s => s.id === activeSceneId)
    if (scene) {
      // Elements come from FullProject or fetch separately
      const sceneElements = (projectData.scenes ?? [])
        .find(s => s.id === activeSceneId)?.elements ?? []
      setElements(sceneElements)
      countWords(sceneElements)
    }
  }, [activeSceneId, scenes, projectData.scenes, user?.id])

  const countWords = (els: ScriptElement[]) => {
    const total = els.reduce((acc, el) => {
      return acc + el.content.trim().split(/\s+/).filter(Boolean).length
    }, 0)
    setWordCount(total)
  }

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
    debouncedSave(id, content, isScene)
  }, [debouncedSave])

  const handleAddChapter = async () => {
    if (!user?.id) return
    const newScene = await createScene(projectData.id, user.id, {
      scene_heading: "New Chapter",
      content: "",
      order_index: scenes.length,
    })
    setScenes(prev => [...prev, newScene])
    setActiveSceneId(newScene.id)
  }

  const handleAddElement = async (type: ProseElementType) => {
    if (!activeSceneId || !user?.id) return
    const el = await createSceneElement(projectData.id, activeSceneId, user.id, {
      element_type: type,
      content: type === "scene_break" ? "* * *" : "",
      order_index: elements.length,
    })
    setElements(prev => [...prev, el])
    setTimeout(() => {
      const div = document.getElementById(`el-${el.id}`)
      div?.focus()
    }, 50)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, el: ScriptElement, idx: number) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleAddElement("paragraph")
    }
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Chapter sidebar */}
      <aside className="w-56 border-r flex flex-col shrink-0">
        <div className="flex items-center gap-2 p-3 border-b">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Chapters</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {scenes.map((scene, i) => (
            <button
              key={scene.id}
              onClick={() => setActiveSceneId(scene.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                activeSceneId === scene.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted text-muted-foreground"
              )}
            >
              <span className="text-xs text-muted-foreground/60 mr-1">{i + 1}.</span>
              {scene.scene_heading || "Untitled"}
            </button>
          ))}
        </div>
        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full gap-2 justify-start" onClick={handleAddChapter}>
            <Plus className="h-3.5 w-3.5" />
            Add chapter
          </Button>
        </div>
      </aside>

      {/* Main editor */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-base font-semibold leading-tight">{projectData.title}</h1>
              <p className="text-xs text-muted-foreground">{categoryLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{wordCount.toLocaleString()} words</span>
            <span className={cn(
              saveStatus === "saved" ? "text-green-600 dark:text-green-400" :
              saveStatus === "saving" ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"
            )}>
              {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Unsaved"}
            </span>
          </div>
        </header>

        {/* Editing area */}
        <div ref={containerRef} className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 py-12 space-y-1">
            {activeSceneId && (
              <>
                {/* Chapter heading = scene_heading */}
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => handleContentChange(
                    activeSceneId,
                    e.currentTarget.textContent ?? "",
                    true
                  )}
                  className="text-2xl font-bold outline-none mb-6 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40"
                  data-placeholder="Chapter Title"
                >
                  {scenes.find(s => s.id === activeSceneId)?.scene_heading}
                </div>

                {/* Elements */}
                {elements.map((el, idx) => (
                  <div
                    key={el.id}
                    id={`el-${el.id}`}
                    contentEditable={el.element_type !== "scene_break"}
                    suppressContentEditableWarning
                    onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                    onKeyDown={(e) => handleKeyDown(e, el, idx)}
                    className={cn(
                      "outline-none min-h-[1.5rem] leading-relaxed",
                      el.element_type === "chapter_heading" && "text-xl font-bold mt-6",
                      el.element_type === "paragraph" && "text-base empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40",
                      el.element_type === "scene_break" && "text-center text-muted-foreground my-6 cursor-default select-none"
                    )}
                    data-placeholder={PLACEHOLDER[el.element_type as ProseElementType] ?? ""}
                  >
                    {el.content}
                  </div>
                ))}

                {elements.length === 0 && (
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    className="text-base outline-none min-h-[1.5rem] leading-relaxed empty:before:content-['Start\00a0writing…'] empty:before:text-muted-foreground/40"
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        await handleAddElement("paragraph")
                      }
                    }}
                  />
                )}

                {/* Inline toolbar */}
                <div className="flex items-center gap-2 pt-8">
                  <span className="text-xs text-muted-foreground mr-1">Insert:</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleAddElement("paragraph")}>
                    <AlignLeft className="h-3 w-3" /> Paragraph
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleAddElement("chapter_heading")}>
                    <BookOpen className="h-3 w-3" /> Section heading
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleAddElement("scene_break")}>
                    Scene break
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
