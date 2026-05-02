"use client"

import { useState, useCallback, useMemo, useRef } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/AuthContext"
import { useToast } from "@/hooks/use-toast"
import { AIChatPanel } from "./AIChatPanel"
import { EditorHeader } from "./shared/EditorHeader"
import { EmptyEditorState } from "./shared/EmptyEditorState"
import { useElementAutosave } from "./shared/useElementAutosave"
import { dispatchKey } from "@/lib/editor/keymap"
import { createComicKeymap, type ComicElementType as KeymapComicElementType } from "./comic/keymap"
import { exportProjectToText } from "@/lib/export/text-export"
import { exportComicToCBZ } from "@/lib/export/comic-cbz"
import { useExportToast } from "@/lib/export/use-export-toast"
import { StableContentEditable } from "./shared/StableContentEditable"
import {
  createScene,
  createSceneElement,
  type ScriptElement,
  type FullProject,
} from "@/services/project"
import { deleteScriptElement } from "@/services/editor"

// Element types follow standard Marvel/DC comic script conventions:
// panel       — visual action description for a panel
// character   — character name line (e.g. BATMAN or JOKER (off-panel))
// balloon     — dialogue that follows a character line
// caption     — narration caption box
// sfx         — sound effect
// transition  — page/scene transition (e.g. CUT TO—)
type ComicElementType = KeymapComicElementType

interface ComicScriptEditorProps {
  projectData: FullProject
}

function panelCount(elements: ScriptElement[]): number {
  return elements.filter(el => el.element_type === "panel").length
}

export function ComicScriptEditor({ projectData }: ComicScriptEditorProps) {
  const { user } = useAuth()
  const [pages, setPages] = useState(() => projectData.scenes ?? [])
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const pageRefs = useRef<Map<string, HTMLElement | null>>(new Map())
  const { saveStatus, scheduleSave } = useElementAutosave({ userId: user?.id })
  const runExport = useExportToast()
  const { toast } = useToast()

  const totalPanels = pages.reduce((acc, p) => acc + panelCount(p.elements ?? []), 0)

  const handleContentChange = useCallback((id: string, content: string, isScene: boolean) => {
    if (isScene) {
      setPages(prev => prev.map(p => p.id === id ? { ...p, scene_heading: content } : p))
    } else {
      setPages(prev => prev.map(p => ({
        ...p,
        elements: (p.elements ?? []).map(el => el.id === id ? { ...el, content } : el),
      })))
    }
    scheduleSave(id, content, isScene)
  }, [scheduleSave])

  const handleAddPage = async () => {
    if (!user?.id) return
    const page = await createScene(projectData.id, user.id, {
      scene_heading: "",
      content: "",
      order_index: pages.length,
    })
    setPages(prev => [...prev, { ...page, elements: [] }])
    setTimeout(() => {
      pageRefs.current.get(page.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 100)
  }

  const insertElement = async (
    pageId: string,
    type: ComicElementType,
    content: string,
    afterIdx?: number,
  ) => {
    if (!user?.id) return null
    const page = pages.find(p => p.id === pageId)
    if (!page) return null
    const insertAt = afterIdx !== undefined ? afterIdx + 1 : (page.elements?.length ?? 0)
    const el = await createSceneElement(projectData.id, pageId, user.id, {
      element_type: type,
      content,
      order_index: insertAt,
    })
    setPages(prev => prev.map(p => {
      if (p.id !== pageId) return p
      const els = [...(p.elements ?? [])]
      els.splice(insertAt, 0, el)
      return { ...p, elements: els }
    }))
    return el
  }

  const handleAddElement = async (pageId: string, type: ComicElementType, afterIdx?: number) => {
    const el = await insertElement(pageId, type, "", afterIdx)
    if (el) setTimeout(() => document.getElementById(`el-${el.id}`)?.focus(), 50)
  }

  const handleAddPanel = async (pageId: string, afterIdx?: number) => {
    const el = await insertElement(pageId, "panel", "", afterIdx)
    if (el) setTimeout(() => document.getElementById(`el-${el.id}`)?.focus(), 50)
  }

  const handleDeleteElement = useCallback(
    async (pageId: string, elementId: string) => {
      const ids: string[] = []
      for (const p of pages) {
        for (const el of p.elements ?? []) {
          ids.push(el.id)
        }
      }
      const idx = ids.indexOf(elementId)
      const prevId = idx > 0 ? ids[idx - 1] : null

      setPages((prev) =>
        prev.map((p) =>
          p.id !== pageId
            ? p
            : { ...p, elements: (p.elements ?? []).filter((el) => el.id !== elementId) },
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
    [pages],
  )

  const keyMap = useMemo(
    () =>
      createComicKeymap({
        pages,
        insertElementAfter: (pageId, type, afterIdx) =>
          void handleAddElement(pageId, type, afterIdx),
        deleteEmptyElement: (pageId, elementId) => void handleDeleteElement(pageId, elementId),
      }),
    [pages, handleDeleteElement],
  )

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLDivElement>,
      pageId: string,
      el: ScriptElement,
      elIdx: number,
    ) => {
      dispatchKey(e, keyMap, {
        pageId,
        elementId: el.id,
        elementType: el.element_type as ComicElementType,
        elementIndex: elIdx,
      })
    },
    [keyMap],
  )

  return (
    <div className="flex h-screen bg-background">
      {/* Pages sidebar */}
      <aside className="w-52 border-r flex flex-col shrink-0 bg-sidebar">
        <div className="p-3 border-b">
          <span className="text-sm font-medium">Pages</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {pages.map((page, i) => {
            const pc = panelCount(page.elements ?? [])
            return (
              <button
                key={page.id}
                onClick={() => pageRefs.current.get(page.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent group"
              >
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-xs text-muted-foreground/50 shrink-0">p{i + 1}</span>
                  <span className="truncate text-muted-foreground group-hover:text-foreground transition-colors font-mono text-xs uppercase">
                    {page.scene_heading || `Page ${i + 1}`}
                  </span>
                </div>
                {pc > 0 && (
                  <p className="text-xs text-muted-foreground/40 pl-5 mt-0.5">{pc} panel{pc !== 1 ? "s" : ""}</p>
                )}
              </button>
            )
          })}
        </div>
        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full gap-2 justify-start text-xs" onClick={handleAddPage}>
            <Plus className="h-3.5 w-3.5" />
            Add page
          </Button>
        </div>
      </aside>

      {/* Main editor */}
      <div className="flex flex-col flex-1 min-w-0">
        <EditorHeader
          title={projectData.title}
          subtitle="Comic Script"
          statRight={`${pages.length} pages · ${totalPanels} panels`}
          saveStatus={saveStatus}
          onToggleAI={() => setIsAIChatOpen(o => !o)}
          isAIOpen={isAIChatOpen}
          exportItems={[
            {
              label: "Export as Plain Text (.txt)",
              onClick: () => void runExport({
                extension: "txt",
                projectTitle: projectData.title,
                run: () => exportProjectToText({ ...projectData, scenes: pages }),
              }),
            },
            {
              label: "Export as Comic Book Zip (.cbz)",
              onClick: () => void runExport({
                extension: "cbz",
                projectTitle: projectData.title,
                run: () => exportComicToCBZ({ ...projectData, scenes: pages }),
              }),
            },
          ]}
        />

        <div className="flex flex-1 overflow-hidden">
        {/* Script scroll area */}
        <div className="flex-1 overflow-y-auto bg-secondary dark:bg-background">
          <div className="inkwell-editor-content max-w-[680px] mx-auto px-10 py-12 font-mono">
            {pages.length === 0 ? (
              <EmptyEditorState
                message="No pages yet."
                actionLabel="Add first page"
                onAction={handleAddPage}
              />
            ) : (
              pages.map((page, pageIdx) => {
                const elements = page.elements ?? []
                const pc = panelCount(elements)
                let panelNum = 0

                return (
                  <div
                    key={page.id}
                    ref={(el) => { pageRefs.current.set(page.id, el) }}
                    className={cn("mb-16", pageIdx > 0 && "pt-12 border-t border-border/40")}
                  >
                    {/* PAGE HEADER: PAGE X (N PANELS) */}
                    <div className="mb-6">
                      <StableContentEditable
                        value={page.scene_heading ?? ""}
                        onValueChange={(next) => handleContentChange(page.id, next, true)}
                        className="text-sm font-bold uppercase tracking-widest outline-none inline empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50"
                        data-placeholder={`PAGE ${pageIdx + 1}`}
                      />
                      {pc > 0 && (
                        <span className="text-sm font-bold text-muted-foreground ml-2">
                          ({pc} {pc === 1 ? "PANEL" : "PANELS"})
                        </span>
                      )}
                    </div>

                    {/* Script elements */}
                    <div className="space-y-0">
                      {elements.length === 0 ? (
                        <div className="text-muted-foreground/40 text-sm italic font-sans">
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 font-sans -ml-2" onClick={() => handleAddPanel(page.id)}>
                            <Plus className="h-3 w-3" /> Add panel
                          </Button>
                        </div>
                      ) : (
                        elements.map((el, elIdx) => {
                          if (el.element_type === "panel") {
                            panelNum++
                            return (
                              <div key={el.id} className={cn("mt-6", elIdx === 0 && "mt-0")}>
                                {/* PANEL N label */}
                                <div className="text-xs font-bold uppercase tracking-widest text-primary mb-1 select-none">
                                  Panel {panelNum}
                                </div>
                                {/* Action/description line */}
                                <StableContentEditable
                                  id={`el-${el.id}`}
                                  value={el.content}
                                  onValueChange={(next) => handleContentChange(el.id, next, false)}
                                  onKeyDown={(e) => handleKeyDown(e, page.id, el, elIdx)}
                                  className="outline-none text-sm leading-relaxed min-h-[1.4rem] empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 empty:before:not-italic"
                                  data-placeholder="Panel description…"
                                />
                              </div>
                            )
                          }

                          if (el.element_type === "character") {
                            return (
                              <div key={el.id} className="mt-4">
                                <StableContentEditable
                                  id={`el-${el.id}`}
                                  value={el.content}
                                  onValueChange={(next) => handleContentChange(el.id, next, false)}
                                  onKeyDown={(e) => handleKeyDown(e, page.id, el, elIdx)}
                                  className="outline-none text-sm font-bold uppercase tracking-wide min-h-[1.2rem] empty:before:content-['CHARACTER'] empty:before:text-muted-foreground/50"
                                />
                              </div>
                            )
                          }

                          if (el.element_type === "balloon") {
                            return (
                              <div key={el.id} className="pl-4">
                                <StableContentEditable
                                  id={`el-${el.id}`}
                                  value={el.content}
                                  onValueChange={(next) => handleContentChange(el.id, next, false)}
                                  onKeyDown={(e) => handleKeyDown(e, page.id, el, elIdx)}
                                  className="outline-none text-sm leading-relaxed min-h-[1.4rem] empty:before:content-['Dialogue…'] empty:before:text-muted-foreground/50"
                                />
                              </div>
                            )
                          }

                          if (el.element_type === "caption") {
                            return (
                              <div key={el.id} className="mt-3 pl-0 border-l-2 border-muted pl-3">
                                <div className="text-xs uppercase tracking-widest text-muted-foreground/60 mb-0.5 select-none">Caption</div>
                                <StableContentEditable
                                  id={`el-${el.id}`}
                                  value={el.content}
                                  onValueChange={(next) => handleContentChange(el.id, next, false)}
                                  onKeyDown={(e) => handleKeyDown(e, page.id, el, elIdx)}
                                  className="outline-none text-sm italic leading-relaxed min-h-[1.4rem] empty:before:content-['Caption\00a0text…'] empty:before:text-muted-foreground/50"
                                />
                              </div>
                            )
                          }

                          if (el.element_type === "sfx") {
                            return (
                              <div key={el.id} className="mt-3">
                                <div className="text-xs uppercase tracking-widest text-muted-foreground/60 mb-0.5 select-none">SFX</div>
                                <StableContentEditable
                                  id={`el-${el.id}`}
                                  value={el.content}
                                  onValueChange={(next) => handleContentChange(el.id, next, false)}
                                  onKeyDown={(e) => handleKeyDown(e, page.id, el, elIdx)}
                                  className="outline-none text-base font-black uppercase tracking-wider min-h-[1.4rem] empty:before:content-['KRAKKK!!!'] empty:before:text-muted-foreground/50"
                                />
                              </div>
                            )
                          }

                          if (el.element_type === "transition") {
                            return (
                              <div key={el.id} className="mt-4 text-right">
                                <StableContentEditable
                                  id={`el-${el.id}`}
                                  value={el.content}
                                  onValueChange={(next) => handleContentChange(el.id, next, false)}
                                  onKeyDown={(e) => handleKeyDown(e, page.id, el, elIdx)}
                                  className="outline-none text-xs uppercase tracking-widest text-muted-foreground min-h-[1.2rem] empty:before:content-['CUT\00a0TO—'] empty:before:text-muted-foreground/50"
                                />
                              </div>
                            )
                          }

                          return null
                        })
                      )}
                    </div>

                    {/* Insert toolbar */}
                    <div className="flex items-center gap-1 mt-8 flex-wrap opacity-60 hover:opacity-100 transition-opacity font-sans">
                      <span className="text-xs text-muted-foreground/60 mr-1">Insert</span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddPanel(page.id)}>
                        Panel
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(page.id, "character")}>
                        Character
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(page.id, "balloon")}>
                        Dialogue
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(page.id, "caption")}>
                        Caption
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(page.id, "sfx")}>
                        SFX
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(page.id, "transition")}>
                        Transition
                      </Button>
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
