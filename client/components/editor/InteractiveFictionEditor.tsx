"use client"

import { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Link2, GitBranch, PenLine, AlertCircle, CheckCircle2, Bot, Download, ChevronDown } from "lucide-react"
import { PassageGraph } from "./PassageGraph"
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

// Element types:
// body        — prose the player reads
// choice      — [[Choice text -> PassageName]] link(s)
// conditional — {if $flag: [[Yes -> A]] else: [[No -> B]]}
// set         — variable assignment: {set $gold to 10}
// note        — author note, never shown in-game
type IFElementType = "body" | "choice" | "conditional" | "set" | "note"

// Parse all [[text -> target]] or [[target]] links from a string
function parseLinks(text: string): string[] {
  const re = /\[\[(?:[^\]]*?->\s*)?([^\]|>]+?)(?:\s*\|[^\]]*)?\]\]/g
  const targets: string[] = []
  let m
  while ((m = re.exec(text)) !== null) {
    targets.push(m[1].trim())
  }
  return targets
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

interface InteractiveFictionEditorProps {
  projectData: FullProject
}

export function InteractiveFictionEditor({ projectData }: InteractiveFictionEditorProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [passages, setPassages] = useState(() => projectData.scenes ?? [])
  const [activePassageId, setActivePassageId] = useState<string | null>(
    () => (projectData.scenes ?? [])[0]?.id ?? null
  )
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved")
  const [search, setSearch] = useState("")
  const [view, setView] = useState<"write" | "graph">("write")
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const activePassage = passages.find(p => p.id === activePassageId) ?? null
  const activeElements = activePassage?.elements ?? []

  // Build a set of all passage names for link validation
  const passageNames = new Set(passages.map(p => p.scene_heading.toLowerCase().trim()))

  const totalLinks = passages.reduce((acc, p) =>
    acc + (p.elements ?? []).reduce((a, el) => a + parseLinks(el.content).length, 0), 0)

  const debouncedSave = useDebouncedCallback(async (id: string, content: string, isScene: boolean) => {
    if (!user?.id) return
    setSaveStatus("saving")
    try {
      if (isScene) await updateSceneHeading(id, user.id, content)
      else await updateElementContent(id, user.id, content)
      setSaveStatus("saved")
    } catch {
      setSaveStatus("unsaved")
    }
  }, 1500)

  const handleContentChange = useCallback((id: string, content: string, isScene: boolean) => {
    setSaveStatus("unsaved")
    if (isScene) {
      setPassages(prev => prev.map(p => p.id === id ? { ...p, scene_heading: content } : p))
    } else {
      setPassages(prev => prev.map(p => ({
        ...p,
        elements: (p.elements ?? []).map(el => el.id === id ? { ...el, content } : el),
      })))
    }
    debouncedSave(id, content, isScene)
  }, [debouncedSave])

  const handleAddPassage = async (name = "") => {
    if (!user?.id) return
    const passage = await createScene(projectData.id, user.id, {
      scene_heading: name,
      content: "",
      order_index: passages.length,
    })
    setPassages(prev => [...prev, { ...passage, elements: [] }])
    setActivePassageId(passage.id)
    setView("write")
  }

  const handleAddElement = async (type: IFElementType) => {
    if (!activePassageId || !user?.id) return
    const defaults: Record<IFElementType, string> = {
      body: "",
      choice: "[[Option text -> Passage Name]]",
      conditional: "{if $flag: [[Yes -> Passage A]] else: [[No -> Passage B]]}",
      set: "{set $variable to value}",
      note: "",
    }
    const el = await createSceneElement(projectData.id, activePassageId, user.id, {
      element_type: type,
      content: defaults[type],
      order_index: activeElements.length,
    })
    setPassages(prev => prev.map(p => {
      if (p.id !== activePassageId) return p
      return { ...p, elements: [...(p.elements ?? []), el] }
    }))
    setTimeout(() => {
      const div = document.getElementById(`el-${el.id}`)
      div?.focus()
      if (type !== "body" && type !== "note") {
        const range = document.createRange()
        range.selectNodeContents(div!)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
      }
    }, 50)
  }

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLDivElement>, el: ScriptElement) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      await handleAddElement(el.element_type === "body" ? "body" : "choice")
    }
  }

  const navigateToPassage = (name: string) => {
    const target = passages.find(p => p.scene_heading.toLowerCase().trim() === name.toLowerCase().trim())
    if (target) setActivePassageId(target.id)
  }

  const filteredPassages = passages.filter(p =>
    !search || p.scene_heading.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-screen bg-background">
      {/* Passage list sidebar */}
      <aside className="w-56 border-r flex flex-col shrink-0 bg-sidebar">
        <div className="p-3 border-b shrink-0">
          <span className="text-sm font-medium">Passages</span>
        </div>
        <div className="px-2 pt-2 shrink-0">
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full text-xs rounded-md border border-border bg-muted/40 px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5 mt-1">
          {filteredPassages.map((passage, i) => {
            const isStart = i === 0 && !search
            const wc = (passage.elements ?? []).reduce((a, el) => a + wordCount(el.content), 0)
            const outLinks = (passage.elements ?? []).reduce((a, el) => a + parseLinks(el.content).length, 0)
            const isActive = passage.id === activePassageId
            return (
              <button
                key={passage.id}
                onClick={() => { setActivePassageId(passage.id); setView("write") }}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors group",
                  isActive ? "bg-primary/10" : "hover:bg-accent"
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {isStart && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1 rounded">
                      Start
                    </span>
                  )}
                  <span className={cn(
                    "truncate",
                    isActive ? "text-primary font-medium" : "text-muted-foreground group-hover:text-foreground transition-colors"
                  )}>
                    {passage.scene_heading || "Untitled"}
                  </span>
                </div>
                {(wc > 0 || outLinks > 0) && (
                  <p className="text-xs text-muted-foreground/40 mt-0.5 pl-0">
                    {wc > 0 && `${wc}w`}{wc > 0 && outLinks > 0 && " · "}{outLinks > 0 && `${outLinks} link${outLinks !== 1 ? "s" : ""}`}
                  </p>
                )}
              </button>
            )
          })}
          {filteredPassages.length === 0 && search && (
            <p className="text-xs text-muted-foreground/50 px-3 py-2">No passages match.</p>
          )}
        </div>
        <div className="p-2 border-t shrink-0">
          <Button variant="ghost" size="sm" className="w-full gap-2 justify-start text-xs" onClick={() => handleAddPassage()}>
            <Plus className="h-3.5 w-3.5" /> Add passage
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
              <p className="text-xs text-muted-foreground">Interactive Fiction</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{passages.length} passages</span>
              <span className="flex items-center gap-1">
                <Link2 className="h-3 w-3" />{totalLinks}
              </span>
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
                  <DropdownMenuItem onClick={() => exportProjectToText({ ...projectData, scenes: passages })}>
                    Export as Plain Text (.txt)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsAIChatOpen(o => !o)} title="Writing Buddy">
                <Bot className="h-4 w-4" />
              </Button>
            </div>
            {/* View toggle */}
            <div className="flex items-center rounded-md border overflow-hidden text-xs">
              <button
                onClick={() => setView("write")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 transition-colors",
                  view === "write" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                )}
              >
                <PenLine className="h-3 w-3" /> Write
              </button>
              <button
                onClick={() => setView("graph")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 transition-colors",
                  view === "graph" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                )}
              >
                <GitBranch className="h-3 w-3" /> Graph
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
        {/* Graph view */}
        {view === "graph" && (
          <div className="flex-1 overflow-hidden">
            <PassageGraph
              passages={passages}
              activePassageId={activePassageId}
              onSelectPassage={(id) => { setActivePassageId(id); setView("write") }}
            />
          </div>
        )}

        {/* Write view */}
        {view === "write" && (
          <div className="flex-1 overflow-y-auto bg-secondary dark:bg-background">
            {!activePassageId ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <p className="text-muted-foreground text-sm">No passages yet.</p>
                <Button size="sm" onClick={() => handleAddPassage("Start")}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Create Start passage
                </Button>
              </div>
            ) : (
              <div className="inkwell-editor-content max-w-[660px] mx-auto px-8 py-10">
                {/* Passage title */}
                <div className="mb-1">
                  {passages.findIndex(p => p.id === activePassageId) === 0 && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary mb-2 block">
                      Start passage
                    </span>
                  )}
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onInput={(e) => handleContentChange(activePassageId, e.currentTarget.textContent ?? "", true)}
                    className="text-xl font-bold outline-none pb-2 border-b empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30"
                    data-placeholder="Passage name"
                  >
                    {activePassage?.scene_heading || ""}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground/50 mb-8 mt-1.5">
                  Link with{" "}
                  <code className="font-mono bg-muted px-1 rounded text-[11px]">[[Choice text → PassageName]]</code>
                  {" "}or{" "}
                  <code className="font-mono bg-muted px-1 rounded text-[11px]">[[PassageName]]</code>
                </p>

                {/* Elements */}
                <div className="space-y-2">
                  {activeElements.length === 0 ? (
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      className="outline-none text-base leading-relaxed min-h-[1.5rem] empty:before:content-['Write\00a0passage\00a0text…'] empty:before:text-muted-foreground/30"
                      onKeyDown={async (e) => {
                        if (e.key === "Enter") { e.preventDefault(); await handleAddElement("body") }
                      }}
                    />
                  ) : (
                    activeElements.map((el) => {
                      if (el.element_type === "body") {
                        return (
                          <div
                            key={el.id}
                            id={`el-${el.id}`}
                            contentEditable
                            suppressContentEditableWarning
                            onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                            onKeyDown={(e) => handleKeyDown(e, el)}
                            className="outline-none text-base leading-relaxed min-h-[1.5rem] empty:before:content-['Passage\00a0text…'] empty:before:text-muted-foreground/25"
                          >
                            {el.content}
                          </div>
                        )
                      }

                      if (el.element_type === "choice") {
                        const targets = parseLinks(el.content)
                        return (
                          <div key={el.id} className="mt-1">
                            <div
                              id={`el-${el.id}`}
                              contentEditable
                              suppressContentEditableWarning
                              onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                              onKeyDown={(e) => handleKeyDown(e, el)}
                              className="outline-none font-mono text-sm text-primary bg-primary/5 border border-primary/20 rounded-md px-3 py-1.5 min-h-[2rem] leading-relaxed"
                            >
                              {el.content}
                            </div>
                            {/* Link resolution badges */}
                            {targets.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-1.5 pl-1">
                                {targets.map((target, i) => {
                                  const exists = passageNames.has(target.toLowerCase().trim())
                                  return (
                                    <button
                                      key={i}
                                      onClick={() => exists && navigateToPassage(target)}
                                      className={cn(
                                        "flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                                        exists
                                          ? "border-green-500/30 text-green-700 dark:text-green-400 bg-green-500/5 hover:bg-green-500/10 cursor-pointer"
                                          : "border-destructive/30 text-destructive bg-destructive/5 cursor-default"
                                      )}
                                      title={exists ? `Go to "${target}"` : `Passage "${target}" not found`}
                                    >
                                      {exists
                                        ? <CheckCircle2 className="h-2.5 w-2.5" />
                                        : <AlertCircle className="h-2.5 w-2.5" />}
                                      {target}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      }

                      if (el.element_type === "conditional") {
                        const targets = parseLinks(el.content)
                        return (
                          <div key={el.id} className="mt-1">
                            <div
                              id={`el-${el.id}`}
                              contentEditable
                              suppressContentEditableWarning
                              onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                              onKeyDown={(e) => handleKeyDown(e, el)}
                              className="outline-none font-mono text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-md px-3 py-2 min-h-[2rem] leading-relaxed"
                            >
                              {el.content}
                            </div>
                            {targets.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-1.5 pl-1">
                                {targets.map((target, i) => {
                                  const exists = passageNames.has(target.toLowerCase().trim())
                                  return (
                                    <button
                                      key={i}
                                      onClick={() => exists && navigateToPassage(target)}
                                      className={cn(
                                        "flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                                        exists
                                          ? "border-green-500/30 text-green-700 dark:text-green-400 bg-green-500/5 hover:bg-green-500/10 cursor-pointer"
                                          : "border-destructive/30 text-destructive bg-destructive/5 cursor-default"
                                      )}
                                    >
                                      {exists ? <CheckCircle2 className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}
                                      {target}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      }

                      if (el.element_type === "set") {
                        return (
                          <div key={el.id} className="mt-1">
                            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-0.5 pl-1 select-none">Variable</div>
                            <div
                              id={`el-${el.id}`}
                              contentEditable
                              suppressContentEditableWarning
                              onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                              onKeyDown={(e) => handleKeyDown(e, el)}
                              className="outline-none font-mono text-xs text-violet-700 dark:text-violet-400 bg-violet-500/5 border border-violet-500/20 rounded-md px-3 py-1.5 min-h-[1.5rem] leading-relaxed"
                            >
                              {el.content}
                            </div>
                          </div>
                        )
                      }

                      if (el.element_type === "note") {
                        return (
                          <div key={el.id} className="mt-1 opacity-60 hover:opacity-100 transition-opacity">
                            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-0.5 pl-1 select-none">Author note</div>
                            <div
                              id={`el-${el.id}`}
                              contentEditable
                              suppressContentEditableWarning
                              onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                              className="outline-none text-sm italic text-muted-foreground bg-muted/40 border border-border/50 rounded-md px-3 py-1.5 min-h-[1.5rem] leading-relaxed empty:before:content-['Note\00a0(not\00a0shown\00a0in\00a0game)…'] empty:before:text-muted-foreground/30"
                            >
                              {el.content}
                            </div>
                          </div>
                        )
                      }

                      return null
                    })
                  )}
                </div>

                {/* Insert toolbar */}
                <div className="flex items-center gap-1.5 pt-8 mt-6 border-t border-border/40 flex-wrap opacity-0 hover:opacity-100 transition-opacity">
                  <span className="text-xs text-muted-foreground/60 mr-1">Insert</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement("body")}>
                    Body
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-primary hover:text-primary border border-primary/20" onClick={() => handleAddElement("choice")}>
                    Choice link
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-amber-600 dark:text-amber-400 border border-amber-500/20" onClick={() => handleAddElement("conditional")}>
                    Conditional
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-violet-600 dark:text-violet-400 border border-violet-500/20" onClick={() => handleAddElement("set")}>
                    Set variable
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement("note")}>
                    Author note
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        <AIChatPanel isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} category={projectData.category} />
        </div>
      </div>
    </div>
  )
}
