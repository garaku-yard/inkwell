"use client"

import { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, ChevronRight, ChevronDown, Table, Pencil, Dice6, Bot, Download } from "lucide-react"
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

type RPGElementType = "h2" | "body" | "stat_block" | "table" | "dice_table" | "callout" | "rule_box"

// dice_table: a random-result table with an implied die type based on row count
// Standard die sizes: d4 d6 d8 d10 d12 d20 d100
const DIE_FOR_ROWS: Record<number, string> = { 4: "d4", 6: "d6", 8: "d8", 10: "d10", 12: "d12", 20: "d20", 100: "d100" }

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

interface ParsedTable {
  headers: string[]
  rows: string[][]
}

function parsePipeTable(content: string): ParsedTable | null {
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return null
  const splitRow = (line: string) => line.replace(/^\||\|$/g, "").split("|").map(c => c.trim())
  const headers = splitRow(lines[0])
  if (!headers.length) return null
  if (!/^[-|\s:]+$/.test(lines[1])) return null
  return { headers, rows: lines.slice(2).map(splitRow) }
}

function parseDiceTable(content: string): { die: string; rows: [string, string][] } | null {
  const lines = content.split("\n").map(l => l.trim()).filter(l => l && !/^[-|]+$/.test(l))
  if (lines.length < 2) return null
  const die = DIE_FOR_ROWS[lines.length - 1] // subtract header row
  const rows: [string, string][] = lines.slice(1).map((line, i) => {
    const parts = line.split("|").map(p => p.trim())
    return [String(i + 1), parts[parts.length - 1] ?? line]
  })
  return { die: die ?? `d${rows.length}`, rows }
}

interface TabletopRPGEditorProps {
  projectData: FullProject
}

export function TabletopRPGEditor({ projectData }: TabletopRPGEditorProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [sections, setSections] = useState(() => projectData.scenes ?? [])
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved")
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [tableMode, setTableMode] = useState<Record<string, "edit" | "preview">>({})
  const sectionRefs = useRef<Map<string, HTMLElement | null>>(new Map())

  const totalWords = sections.reduce((acc, s) =>
    acc + (s.elements ?? []).reduce((a, el) => a + wordCount(el.content), 0), 0)

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
      setSections(prev => prev.map(s => s.id === id ? { ...s, scene_heading: content } : s))
    } else {
      setSections(prev => prev.map(s => ({
        ...s,
        elements: (s.elements ?? []).map(el => el.id === id ? { ...el, content } : el),
      })))
    }
    debouncedSave(id, content, isScene)
  }, [debouncedSave])

  const handleAddSection = async () => {
    if (!user?.id) return
    const section = await createScene(projectData.id, user.id, {
      scene_heading: "",
      content: "",
      order_index: sections.length,
    })
    setSections(prev => [...prev, { ...section, elements: [] }])
    setTimeout(() => {
      sectionRefs.current.get(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 100)
  }

  const insertElement = async (sectionId: string, type: RPGElementType, content: string, afterIdx?: number) => {
    if (!user?.id) return null
    const section = sections.find(s => s.id === sectionId)
    if (!section) return null
    const insertAt = afterIdx !== undefined ? afterIdx + 1 : (section.elements?.length ?? 0)
    const el = await createSceneElement(projectData.id, sectionId, user.id, {
      element_type: type,
      content,
      order_index: insertAt,
    })
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      const els = [...(s.elements ?? [])]
      els.splice(insertAt, 0, el)
      return { ...s, elements: els }
    }))
    return el
  }

  const handleAddElement = async (sectionId: string, type: RPGElementType, afterIdx?: number) => {
    let defaultContent = ""
    if (type === "stat_block") {
      defaultContent = "Name\nAC — | HP — | Speed —ft\nSTR — | DEX — | CON — | INT — | WIS — | CHA —\n\nTraits\n—\n\nActions\n—"
    } else if (type === "dice_table") {
      defaultContent = "Result\n---\nFirst outcome\nSecond outcome\nThird outcome\nFourth outcome\nFifth outcome\nSixth outcome"
    } else if (type === "table") {
      defaultContent = "Column A | Column B | Column C\n--- | --- | ---\n | | "
    }
    const el = await insertElement(sectionId, type, defaultContent, afterIdx)
    if (el) setTimeout(() => document.getElementById(`el-${el.id}`)?.focus(), 50)
  }

  const handleKeyDown = async (
    e: React.KeyboardEvent<HTMLDivElement>,
    sectionId: string,
    el: ScriptElement,
    elIdx: number,
  ) => {
    if (e.key === "Enter" && !e.shiftKey && el.element_type !== "stat_block" && el.element_type !== "table" && el.element_type !== "dice_table") {
      e.preventDefault()
      const next: RPGElementType = el.element_type === "h2" ? "body" : "body"
      await handleAddElement(sectionId, next, elIdx)
    }
  }

  const toggleCollapse = (id: string) =>
    setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleTableMode = (id: string) =>
    setTableMode(prev => ({ ...prev, [id]: prev[id] === "preview" ? "edit" : "preview" }))

  const renderElement = (el: ScriptElement, sectionId: string, elIdx: number) => {
    const isCollapsed = collapsed.has(el.id)

    if (el.element_type === "h2") {
      return (
        <div
          key={el.id}
          id={`el-${el.id}`}
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
          onKeyDown={(e) => handleKeyDown(e, sectionId, el, elIdx)}
          className="text-lg font-bold outline-none mt-7 mb-1.5 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30"
          data-placeholder="Subsection title"
        >
          {el.content}
        </div>
      )
    }

    if (el.element_type === "stat_block") {
      return (
        <div key={el.id} className="my-4 rounded-lg border-2 border-amber-700/40 dark:border-amber-500/30 overflow-hidden">
          <div
            className="flex items-center justify-between px-3 py-1.5 bg-amber-700/10 dark:bg-amber-500/10 cursor-pointer select-none"
            onClick={() => toggleCollapse(el.id)}
          >
            <span className="text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-500">Stat Block</span>
            {isCollapsed
              ? <ChevronRight className="h-3.5 w-3.5 text-amber-700/60 dark:text-amber-500/60" />
              : <ChevronDown className="h-3.5 w-3.5 text-amber-700/60 dark:text-amber-500/60" />}
          </div>
          {!isCollapsed && (
            <div
              id={`el-${el.id}`}
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
              className="font-mono text-sm outline-none px-3 py-3 whitespace-pre-wrap min-h-[5rem] leading-relaxed"
            >
              {el.content}
            </div>
          )}
        </div>
      )
    }

    if (el.element_type === "dice_table") {
      const mode = tableMode[el.id] ?? "edit"
      const parsed = mode === "preview" ? parseDiceTable(el.content) : null
      return (
        <div key={el.id} className="my-4 rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted select-none">
            <div className="flex items-center gap-1.5 cursor-pointer flex-1" onClick={() => toggleCollapse(el.id)}>
              <Dice6 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Random Table{parsed ? ` (${parsed.die})` : ""}
              </span>
              {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />}
            </div>
            {!isCollapsed && (
              <button onClick={() => toggleTableMode(el.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded hover:bg-background/60">
                {mode === "edit" ? <><Table className="h-3 w-3" /> Preview</> : <><Pencil className="h-3 w-3" /> Edit</>}
              </button>
            )}
          </div>
          {!isCollapsed && (
            mode === "preview" && parsed ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="px-3 py-2 text-left font-semibold border-b border-border text-xs uppercase tracking-wide w-16">{parsed.die}</th>
                      <th className="px-3 py-2 text-left font-semibold border-b border-border text-xs uppercase tracking-wide">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map(([roll, result], ri) => (
                      <tr key={ri} className={cn("border-b border-border/50 last:border-0", ri % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                        <td className="px-3 py-2 font-mono text-muted-foreground text-sm">{roll}</td>
                        <td className="px-3 py-2">{result}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                id={`el-${el.id}`}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                className="font-mono text-sm outline-none px-3 py-2 whitespace-pre-wrap min-h-[5rem] text-xs"
              >
                {el.content}
              </div>
            )
          )}
        </div>
      )
    }

    if (el.element_type === "table") {
      const mode = tableMode[el.id] ?? "edit"
      const parsed = mode === "preview" ? parsePipeTable(el.content) : null
      return (
        <div key={el.id} className="my-4 rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted select-none">
            <div className="flex items-center gap-1.5 cursor-pointer flex-1" onClick={() => toggleCollapse(el.id)}>
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Table</span>
              {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />}
            </div>
            {!isCollapsed && (
              <button onClick={() => toggleTableMode(el.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded hover:bg-background/60">
                {mode === "edit" ? <><Table className="h-3 w-3" /> Preview</> : <><Pencil className="h-3 w-3" /> Edit</>}
              </button>
            )}
          </div>
          {!isCollapsed && (
            mode === "preview" && parsed ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-muted/60">
                      {parsed.headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-semibold border-b border-border text-xs uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((row, ri) => (
                      <tr key={ri} className={cn("border-b border-border/50 last:border-0", ri % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                        {row.map((cell, ci) => <td key={ci} className="px-3 py-2">{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : mode === "preview" && !parsed ? (
              <div className="px-3 py-4 text-center text-muted-foreground text-xs">
                Use pipe syntax: <code className="font-mono">Col A | Col B</code> then <code className="font-mono">--- | ---</code>
              </div>
            ) : (
              <div
                id={`el-${el.id}`}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                className="font-mono text-sm outline-none px-3 py-2 whitespace-pre-wrap min-h-[3rem]"
              >
                {el.content}
              </div>
            )
          )}
        </div>
      )
    }

    if (el.element_type === "callout") {
      return (
        <div key={el.id} className="my-4 rounded-lg border-l-4 border-primary bg-primary/5 px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-widest text-primary mb-1.5">Designer Note</div>
          <div
            id={`el-${el.id}`}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
            onKeyDown={(e) => handleKeyDown(e, sectionId, el, elIdx)}
            className="text-sm italic outline-none leading-relaxed min-h-[1.5rem] empty:before:content-['Note…'] empty:before:text-muted-foreground/30"
          >
            {el.content}
          </div>
        </div>
      )
    }

    if (el.element_type === "rule_box") {
      return (
        <div key={el.id} className="my-4 rounded-lg border-2 border-border bg-muted/40 px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Rule</div>
          <div
            id={`el-${el.id}`}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
            onKeyDown={(e) => handleKeyDown(e, sectionId, el, elIdx)}
            className="text-sm font-medium outline-none leading-relaxed min-h-[1.5rem] empty:before:content-['Rule\00a0text…'] empty:before:text-muted-foreground/30"
          >
            {el.content}
          </div>
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
        onKeyDown={(e) => handleKeyDown(e, sectionId, el, elIdx)}
        className="text-base leading-relaxed outline-none min-h-[1.5rem] my-0.5 empty:before:content-['Write\00a0rules,\00a0lore,\00a0descriptions…'] empty:before:text-muted-foreground/25"
      >
        {el.content}
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sections sidebar — shows section titles + h2 headings */}
      <aside className="w-56 border-r flex flex-col shrink-0 bg-sidebar overflow-hidden">
        <div className="p-3 border-b shrink-0">
          <span className="text-sm font-medium">Contents</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {sections.map((section, i) => {
            const subheadings = (section.elements ?? []).filter(el => el.element_type === "h2")
            return (
              <div key={section.id}>
                <button
                  onClick={() => sectionRefs.current.get(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent group"
                >
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-xs text-muted-foreground/50 shrink-0">{i + 1}</span>
                    <span className="truncate text-muted-foreground group-hover:text-foreground transition-colors font-medium">
                      {section.scene_heading || "Untitled"}
                    </span>
                  </div>
                </button>
                {subheadings.map(h => (
                  <button
                    key={h.id}
                    onClick={() => document.getElementById(`el-${h.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                    className="w-full text-left pl-7 pr-3 py-1 rounded-md text-xs transition-colors hover:bg-accent text-muted-foreground/70 hover:text-muted-foreground truncate"
                  >
                    {h.content || "Subsection"}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
        <div className="p-2 border-t shrink-0">
          <Button variant="ghost" size="sm" className="w-full gap-2 justify-start text-xs" onClick={handleAddSection}>
            <Plus className="h-3.5 w-3.5" /> Add section
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
              <h1 className="text-base font-semibold leading-tight">{projectData.title}</h1>
              <p className="text-xs text-muted-foreground">Tabletop RPG</p>
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
                <DropdownMenuItem onClick={() => exportProjectToText({ ...projectData, scenes: sections })}>
                  Export as Plain Text (.txt)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportProjectToMarkdown({ ...projectData, scenes: sections })}>
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
        <div className="flex-1 overflow-y-auto bg-secondary dark:bg-background">
          <div className="inkwell-editor-content max-w-[720px] mx-auto px-10 py-12">
            {sections.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-24 space-y-4">
                <p>No sections yet.</p>
                <Button variant="outline" size="sm" onClick={handleAddSection}>Create first section</Button>
              </div>
            ) : (
              sections.map((section, sectionIdx) => {
                const elements = section.elements ?? []
                return (
                  <div
                    key={section.id}
                    ref={(el) => { sectionRefs.current.set(section.id, el) }}
                    className={cn("mb-20", sectionIdx > 0 && "pt-14 border-t border-border/40")}
                  >
                    {/* Chapter/section title */}
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      onInput={(e) => handleContentChange(section.id, e.currentTarget.textContent ?? "", true)}
                      className="text-3xl font-black uppercase tracking-wider outline-none mb-8 pb-3 border-b-2 border-foreground empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30"
                      data-placeholder="CHAPTER TITLE"
                    >
                      {section.scene_heading || ""}
                    </div>

                    {/* Elements */}
                    {elements.length === 0 ? (
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        className="text-base outline-none leading-relaxed min-h-[1.5rem] empty:before:content-['Start\00a0writing…'] empty:before:text-muted-foreground/30"
                        onKeyDown={async (e) => {
                          if (e.key === "Enter") { e.preventDefault(); await handleAddElement(section.id, "body") }
                        }}
                      />
                    ) : (
                      elements.map((el, elIdx) => renderElement(el, section.id, elIdx))
                    )}

                    {/* Insert toolbar */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-10 pt-6 border-t border-border/40 opacity-0 hover:opacity-100 transition-opacity">
                      <span className="text-xs text-muted-foreground/60 mr-1 w-full mb-0.5">Insert</span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(section.id, "body")}>
                        Body
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(section.id, "h2")}>
                        Subheading
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2 border border-amber-700/30 text-amber-700 dark:text-amber-500 hover:bg-amber-700/10" onClick={() => handleAddElement(section.id, "stat_block")}>
                        Stat block
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(section.id, "table")}>
                        Table
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2 gap-1" onClick={() => handleAddElement(section.id, "dice_table")}>
                        <Dice6 className="h-3 w-3" /> Random table
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2 border border-primary/30 text-primary hover:bg-primary/10" onClick={() => handleAddElement(section.id, "callout")}>
                        Designer note
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleAddElement(section.id, "rule_box")}>
                        Rule box
                      </Button>
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
