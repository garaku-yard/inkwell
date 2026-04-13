"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus } from "lucide-react"
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

// In comic scripts: Scene = Page, Elements = Panels + dialogue within panels
type ComicElementType = "panel" | "caption" | "character" | "balloon" | "sfx" | "transition"

const ELEMENT_LABELS: Record<ComicElementType, string> = {
  panel: "Panel",
  caption: "Caption",
  character: "Character",
  balloon: "Dialogue",
  sfx: "SFX",
  transition: "Transition",
}

const ELEMENT_STYLES: Record<ComicElementType, string> = {
  panel: "font-bold text-sm uppercase tracking-wide text-primary border-l-2 border-primary pl-3 mt-4 mb-1",
  caption: "text-sm italic text-muted-foreground pl-4 border-l border-border ml-4",
  character: "font-bold text-xs uppercase tracking-widest text-center",
  balloon: "text-sm pl-12 pr-12 text-center",
  sfx: "font-black text-lg uppercase tracking-wider text-center text-orange-500",
  transition: "text-xs uppercase tracking-widest text-right text-muted-foreground",
}

interface ComicScriptEditorProps {
  projectData: FullProject
}

export function ComicScriptEditor({ projectData }: ComicScriptEditorProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [pages, setPages] = useState<Scene[]>([])
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [elements, setElements] = useState<ScriptElement[]>([])
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved")

  useEffect(() => {
    if (!user?.id) return
    getProjectScenes(projectData.id, user.id).then((data) => {
      setPages(data)
      if (data.length > 0) setActivePageId(data[0].id)
    }).catch(console.error)
  }, [projectData.id, user?.id])

  useEffect(() => {
    if (!activePageId) return
    const pageElements = (projectData.scenes ?? [])
      .find(s => s.id === activePageId)?.elements ?? []
    setElements(pageElements)
  }, [activePageId, projectData.scenes])

  const debouncedSave = useDebouncedCallback(async (id: string, content: string, isScene: boolean) => {
    if (!user?.id) return
    setSaveStatus("saving")
    try {
      if (isScene) await updateSceneHeading(id, user.id, content)
      else await updateElementContent(id, user.id, content)
      setSaveStatus("saved")
    } catch { setSaveStatus("unsaved") }
  }, 1500)

  const handleContentChange = useCallback((id: string, content: string, isScene: boolean) => {
    setSaveStatus("unsaved")
    debouncedSave(id, content, isScene)
  }, [debouncedSave])

  const handleAddPage = async () => {
    if (!user?.id) return
    const page = await createScene(projectData.id, user.id, {
      scene_heading: `Page ${pages.length + 1}`,
      content: "",
      order_index: pages.length,
    })
    setPages(prev => [...prev, page])
    setActivePageId(page.id)
  }

  const handleAddElement = async (type: ComicElementType) => {
    if (!activePageId || !user?.id) return
    const panelCount = elements.filter(e => e.element_type === "panel").length
    const defaultContent = type === "panel" ? `Panel ${panelCount + 1}: ` : ""
    const el = await createSceneElement(projectData.id, activePageId, user.id, {
      element_type: type,
      content: defaultContent,
      order_index: elements.length,
    })
    setElements(prev => [...prev, el])
    setTimeout(() => document.getElementById(`el-${el.id}`)?.focus(), 50)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, el: ScriptElement) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      // After a panel, default to caption; after character, add balloon
      const nextType: ComicElementType =
        el.element_type === "panel" ? "caption" :
        el.element_type === "character" ? "balloon" :
        el.element_type === "balloon" ? "character" : "caption"
      handleAddElement(nextType)
    }
  }

  const panelCount = elements.filter(e => e.element_type === "panel").length

  return (
    <div className="flex h-screen bg-background">
      {/* Page list */}
      <aside className="w-48 border-r flex flex-col shrink-0">
        <div className="p-3 border-b">
          <span className="text-sm font-medium">Pages</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {pages.map((page, i) => (
            <button
              key={page.id}
              onClick={() => setActivePageId(page.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                activePageId === page.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted text-muted-foreground"
              )}
            >
              {page.scene_heading || `Page ${i + 1}`}
            </button>
          ))}
        </div>
        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full gap-2 justify-start" onClick={handleAddPage}>
            <Plus className="h-3.5 w-3.5" /> Add page
          </Button>
        </div>
      </aside>

      {/* Editor */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center justify-between px-6 py-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-base font-semibold">{projectData.title}</h1>
              <p className="text-xs text-muted-foreground">Comic Script</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{panelCount} panels</span>
            <span className={cn(
              saveStatus === "saved" ? "text-green-600 dark:text-green-400" :
              saveStatus === "saving" ? "text-yellow-600" : "text-muted-foreground"
            )}>
              {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Unsaved"}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 py-8">
            {activePageId && (
              <>
                {/* Page heading */}
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => handleContentChange(activePageId, e.currentTarget.textContent ?? "", true)}
                  className="text-lg font-black uppercase tracking-wide outline-none mb-6 pb-3 border-b-2 border-foreground empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40"
                  data-placeholder="PAGE ONE"
                >
                  {pages.find(p => p.id === activePageId)?.scene_heading}
                </div>

                {/* Elements */}
                {elements.map((el) => (
                  <div
                    key={el.id}
                    id={`el-${el.id}`}
                    contentEditable={true}
                    suppressContentEditableWarning
                    onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                    onKeyDown={(e) => handleKeyDown(e, el)}
                    className={cn(
                      "outline-none min-h-[1.5rem] leading-relaxed py-0.5",
                      ELEMENT_STYLES[el.element_type as ComicElementType] ?? "text-sm"
                    )}
                    data-element-type={el.element_type}
                  >
                    {el.content}
                  </div>
                ))}

                {/* Element toolbar */}
                <div className="flex flex-wrap items-center gap-2 mt-8 pt-4 border-t">
                  {(Object.keys(ELEMENT_LABELS) as ComicElementType[]).map(type => (
                    <Button
                      key={type}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleAddElement(type)}
                    >
                      + {ELEMENT_LABELS[type]}
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
