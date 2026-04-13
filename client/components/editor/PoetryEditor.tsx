"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, AlignCenter, AlignLeft } from "lucide-react"
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

// Section labels for lyrics
const LYRICS_SECTIONS = ["Verse", "Chorus", "Bridge", "Pre-Chorus", "Outro", "Hook", "Intro"]

interface PoetryEditorProps {
  projectData: FullProject
}

export function PoetryEditor({ projectData }: PoetryEditorProps) {
  const router = useRouter()
  const { user } = useAuth()
  const isLyrics = projectData.category === "lyrics"
  const [scenes, setScenes] = useState<Scene[]>([])
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const [elements, setElements] = useState<ScriptElement[]>([])
  const [centered, setCentered] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved")

  const categoryLabel = isLyrics ? "Lyrics" : "Poetry"

  useEffect(() => {
    if (!user?.id) return
    getProjectScenes(projectData.id, user.id).then((data) => {
      setScenes(data)
      if (data.length > 0) setActiveSceneId(data[0].id)
    }).catch(console.error)
  }, [projectData.id, user?.id])

  useEffect(() => {
    if (!activeSceneId) return
    const sceneElements = (projectData.scenes ?? [])
      .find(s => s.id === activeSceneId)?.elements ?? []
    setElements(sceneElements)
  }, [activeSceneId, projectData.scenes])

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

  const handleAddPoem = async () => {
    if (!user?.id) return
    const s = await createScene(projectData.id, user.id, {
      scene_heading: isLyrics ? "New Song" : "New Poem",
      content: "",
      order_index: scenes.length,
    })
    setScenes(prev => [...prev, s])
    setActiveSceneId(s.id)
  }

  const handleAddSection = async (label?: string) => {
    if (!activeSceneId || !user?.id) return
    if (label) {
      const labelEl = await createSceneElement(projectData.id, activeSceneId, user.id, {
        element_type: "section_label",
        content: label,
        order_index: elements.length,
      })
      const lineEl = await createSceneElement(projectData.id, activeSceneId, user.id, {
        element_type: "line",
        content: "",
        order_index: elements.length + 1,
      })
      setElements(prev => [...prev, labelEl, lineEl])
      setTimeout(() => document.getElementById(`el-${lineEl.id}`)?.focus(), 50)
    } else {
      const el = await createSceneElement(projectData.id, activeSceneId, user.id, {
        element_type: "line",
        content: "",
        order_index: elements.length,
      })
      setElements(prev => [...prev, el])
      setTimeout(() => document.getElementById(`el-${el.id}`)?.focus(), 50)
    }
  }

  const handleAddStanzaBreak = async () => {
    if (!activeSceneId || !user?.id) return
    const sep = await createSceneElement(projectData.id, activeSceneId, user.id, {
      element_type: "stanza_break",
      content: "",
      order_index: elements.length,
    })
    setElements(prev => [...prev, sep])
  }

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLDivElement>, el: ScriptElement) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      await handleAddSection()
    }
    // Shift+Enter = stanza break
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault()
      await handleAddStanzaBreak()
    }
  }

  const lineCount = elements.filter(e => e.element_type === "line").length

  return (
    <div className="flex h-screen bg-background">
      {/* Poem/Song list sidebar */}
      <aside className="w-48 border-r flex flex-col shrink-0">
        <div className="p-3 border-b">
          <span className="text-sm font-medium">{isLyrics ? "Songs" : "Poems"}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {scenes.map((scene) => (
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
              {scene.scene_heading || "Untitled"}
            </button>
          ))}
        </div>
        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full gap-2 justify-start" onClick={handleAddPoem}>
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
              <h1 className="text-base font-semibold">{projectData.title}</h1>
              <p className="text-xs text-muted-foreground">{categoryLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{lineCount} lines</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCentered(!centered)}
              title={centered ? "Left align" : "Center align"}
            >
              {centered ? <AlignLeft className="h-3.5 w-3.5" /> : <AlignCenter className="h-3.5 w-3.5" />}
            </Button>
            <span className={cn(
              "text-xs",
              saveStatus === "saved" ? "text-green-600 dark:text-green-400" :
              saveStatus === "saving" ? "text-yellow-600" : "text-muted-foreground"
            )}>
              {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Unsaved"}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className={cn("max-w-xl mx-auto px-8 py-12 space-y-0", centered && "text-center")}>
            {activeSceneId && (
              <>
                {/* Title */}
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => handleContentChange(activeSceneId, e.currentTarget.textContent ?? "", true)}
                  className="text-xl font-semibold outline-none mb-8 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40"
                  data-placeholder={isLyrics ? "Song title" : "Poem title"}
                >
                  {scenes.find(s => s.id === activeSceneId)?.scene_heading}
                </div>

                {/* Elements */}
                {elements.map((el) => {
                  if (el.element_type === "section_label") {
                    return (
                      <div key={el.id} className="text-xs font-bold uppercase tracking-widest text-muted-foreground mt-6 mb-2">
                        {el.content}
                      </div>
                    )
                  }
                  if (el.element_type === "stanza_break") {
                    return <div key={el.id} className="h-5" />
                  }
                  return (
                    <div
                      key={el.id}
                      id={`el-${el.id}`}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                      onKeyDown={(e) => handleKeyDown(e, el)}
                      className="outline-none leading-relaxed text-base min-h-[1.5rem] empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30"
                      data-placeholder="…"
                    >
                      {el.content}
                    </div>
                  )
                })}

                {elements.length === 0 && (
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    className="outline-none leading-relaxed text-base min-h-[1.5rem] empty:before:content-['First\00a0line…'] empty:before:text-muted-foreground/40"
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") { e.preventDefault(); await handleAddSection() }
                    }}
                  />
                )}

                {/* Toolbar */}
                <div className="flex items-center gap-2 pt-10 flex-wrap">
                  <span className="text-xs text-muted-foreground">Insert:</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleAddSection()}>
                    Line
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleAddStanzaBreak()}>
                    Stanza break
                  </Button>
                  {isLyrics && LYRICS_SECTIONS.map(s => (
                    <Button key={s} variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleAddSection(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
