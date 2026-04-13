"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Link2 } from "lucide-react"
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

// Each scene = a passage/node in the interactive fiction graph
// Elements: body text + choices
// Choice syntax: [[Choice text -> passage-name]]

interface InteractiveFictionEditorProps {
  projectData: FullProject
}

export function InteractiveFictionEditor({ projectData }: InteractiveFictionEditorProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [passages, setPassages] = useState<Scene[]>([])
  const [activePassageId, setActivePassageId] = useState<string | null>(null)
  const [elements, setElements] = useState<ScriptElement[]>([])
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved")
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!user?.id) return
    getProjectScenes(projectData.id, user.id).then((data) => {
      setPassages(data)
      if (data.length > 0) setActivePassageId(data[0].id)
    }).catch(console.error)
  }, [projectData.id, user?.id])

  useEffect(() => {
    if (!activePassageId) return
    const passageElements = (projectData.scenes ?? [])
      .find(s => s.id === activePassageId)?.elements ?? []
    setElements(passageElements)
  }, [activePassageId, projectData.scenes])

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

  const handleAddPassage = async () => {
    if (!user?.id) return
    const passage = await createScene(projectData.id, user.id, {
      scene_heading: `Passage ${passages.length + 1}`,
      content: "",
      order_index: passages.length,
    })
    setPassages(prev => [...prev, passage])
    setActivePassageId(passage.id)
  }

  const handleAddElement = async (type: "body" | "choice" | "conditional") => {
    if (!activePassageId || !user?.id) return
    const defaultContent =
      type === "choice" ? "[[Option text -> passage-name]]" :
      type === "conditional" ? "{if flag: [[Yes -> passage-a]] else: [[No -> passage-b]]}" :
      ""
    const el = await createSceneElement(projectData.id, activePassageId, user.id, {
      element_type: type,
      content: defaultContent,
      order_index: elements.length,
    })
    setElements(prev => [...prev, el])
    setTimeout(() => {
      const div = document.getElementById(`el-${el.id}`)
      div?.focus()
      // Select all so user can immediately type
      if (type !== "body") {
        const range = document.createRange()
        range.selectNodeContents(div!)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    }, 50)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, el: ScriptElement) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      const nextType = el.element_type === "body" ? "body" : "choice"
      handleAddElement(nextType as "body" | "choice")
    }
  }

  // Count links [[...]] in all elements
  const linkCount = elements.reduce((acc, el) => {
    const matches = el.content.match(/\[\[.*?\]\]/g)
    return acc + (matches?.length ?? 0)
  }, 0)

  const filteredPassages = passages.filter(p =>
    p.scene_heading.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-screen bg-background">
      {/* Passage list */}
      <aside className="w-52 border-r flex flex-col shrink-0">
        <div className="p-3 border-b">
          <span className="text-sm font-medium">Passages</span>
        </div>
        <div className="px-2 pt-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search passages…"
            className="w-full text-xs rounded-md border border-border bg-muted/40 px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5 mt-1">
          {filteredPassages.map((passage) => (
            <button
              key={passage.id}
              onClick={() => setActivePassageId(passage.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                activePassageId === passage.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted text-muted-foreground"
              )}
            >
              <div className="truncate">{passage.scene_heading || "Untitled"}</div>
            </button>
          ))}
        </div>
        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full gap-2 justify-start" onClick={handleAddPassage}>
            <Plus className="h-3.5 w-3.5" /> Add passage
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
              <p className="text-xs text-muted-foreground">Interactive Fiction</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Link2 className="h-3 w-3" />{linkCount} links
            </span>
            <span>{passages.length} passages</span>
            <span className={cn(
              saveStatus === "saved" ? "text-green-600 dark:text-green-400" :
              saveStatus === "saving" ? "text-yellow-600" : "text-muted-foreground"
            )}>
              {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Unsaved"}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 py-10">
            {activePassageId && (
              <>
                {/* Passage name */}
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => handleContentChange(activePassageId, e.currentTarget.textContent ?? "", true)}
                  className="text-xl font-bold outline-none mb-1 pb-2 border-b empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40"
                  data-placeholder="Passage name"
                >
                  {passages.find(p => p.id === activePassageId)?.scene_heading}
                </div>
                <p className="text-xs text-muted-foreground/60 mb-6">
                  Use <code className="font-mono bg-muted px-1 rounded">[[Choice text -&gt; passage-name]]</code> to link passages
                </p>

                {/* Elements */}
                {elements.map((el) => {
                  if (el.element_type === "choice") {
                    return (
                      <div
                        key={el.id}
                        id={`el-${el.id}`}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                        onKeyDown={(e) => handleKeyDown(e, el)}
                        className="outline-none font-mono text-sm text-primary bg-primary/5 border border-primary/20 rounded px-3 py-1.5 mb-1.5 min-h-[2rem] leading-relaxed"
                      >
                        {el.content}
                      </div>
                    )
                  }
                  if (el.element_type === "conditional") {
                    return (
                      <div
                        key={el.id}
                        id={`el-${el.id}`}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                        onKeyDown={(e) => handleKeyDown(e, el)}
                        className="outline-none font-mono text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-3 py-1.5 mb-1.5 min-h-[2rem] leading-relaxed"
                      >
                        {el.content}
                      </div>
                    )
                  }
                  // body
                  return (
                    <div
                      key={el.id}
                      id={`el-${el.id}`}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                      onKeyDown={(e) => handleKeyDown(e, el)}
                      className="outline-none text-base leading-relaxed min-h-[1.5rem] mb-1 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30"
                      data-placeholder="Passage text…"
                    >
                      {el.content}
                    </div>
                  )
                })}

                {elements.length === 0 && (
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    className="outline-none text-base leading-relaxed min-h-[1.5rem] empty:before:content-['Write\00a0passage\00a0text…'] empty:before:text-muted-foreground/40"
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") { e.preventDefault(); await handleAddElement("body") }
                    }}
                  />
                )}

                {/* Toolbar */}
                <div className="flex items-center gap-2 pt-8 border-t mt-8 flex-wrap">
                  <span className="text-xs text-muted-foreground">Insert:</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleAddElement("body")}>
                    Body text
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => handleAddElement("choice")}>
                    Choice link
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600 dark:text-amber-400" onClick={() => handleAddElement("conditional")}>
                    Conditional
                  </Button>
                </div>
              </>
            )}

            {!activePassageId && (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <p className="text-muted-foreground text-sm">No passages yet</p>
                <Button onClick={handleAddPassage} size="sm" className="gap-2">
                  <Plus className="h-3.5 w-3.5" /> Create first passage
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
