"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, ChevronRight, ChevronDown, Table, Pencil } from "lucide-react"
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

type RPGElementType = "h1" | "h2" | "body" | "stat_block" | "table" | "callout" | "rule_box"

const ELEMENT_LABELS: Record<RPGElementType, string> = {
  h1: "Heading 1",
  h2: "Heading 2",
  body: "Body text",
  stat_block: "Stat block",
  table: "Table",
  callout: "Callout",
  rule_box: "Rule box",
}

const ELEMENT_PLACEHOLDERS: Record<RPGElementType, string> = {
  h1: "Section title",
  h2: "Subsection title",
  body: "Write rules, lore, descriptions…",
  stat_block: "Name\nAC 15 | HP 45 | Speed 30ft\nSTR 16 (+3) | DEX 12 (+1) | CON 14 (+2)",
  table: "Header 1 | Header 2 | Header 3\n--- | --- | ---\nCell 1 | Cell 2 | Cell 3",
  callout: "Designer note or sidebar content…",
  rule_box: "Rule text in a highlighted box…",
}

interface ParsedTable {
  headers: string[]
  rows: string[][]
}

function parsePipeTable(content: string): ParsedTable | null {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return null

  const splitRow = (line: string): string[] => {
    // Strip leading/trailing pipes if present, then split
    const stripped = line.replace(/^\||\|$/g, "")
    return stripped.split("|").map((c) => c.trim())
  }

  const headers = splitRow(lines[0])
  if (headers.length === 0) return null

  // Second line must be a separator row (--- | --- | ---)
  const isSeparator = /^[-|\s:]+$/.test(lines[1])
  if (!isSeparator) return null

  const rows = lines.slice(2).map(splitRow)
  return { headers, rows }
}

interface TabletopRPGEditorProps {
  projectData: FullProject
}

export function TabletopRPGEditor({ projectData }: TabletopRPGEditorProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [sections, setSections] = useState<Scene[]>([])
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [elements, setElements] = useState<ScriptElement[]>([])
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [tableMode, setTableMode] = useState<Record<string, "edit" | "preview">>({})

  const toggleTableMode = useCallback((id: string) => {
    setTableMode((prev) => ({ ...prev, [id]: prev[id] === "preview" ? "edit" : "preview" }))
  }, [])

  useEffect(() => {
    if (!user?.id) return
    getProjectScenes(projectData.id, user.id).then((data) => {
      setSections(data)
      if (data.length > 0) setActiveSectionId(data[0].id)
    }).catch(console.error)
  }, [projectData.id, user?.id])

  useEffect(() => {
    if (!activeSectionId) return
    const sectionElements = (projectData.scenes ?? [])
      .find(s => s.id === activeSectionId)?.elements ?? []
    setElements(sectionElements)
  }, [activeSectionId, projectData.scenes])

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

  const handleAddSection = async () => {
    if (!user?.id) return
    const section = await createScene(projectData.id, user.id, {
      scene_heading: "New Section",
      content: "",
      order_index: sections.length,
    })
    setSections(prev => [...prev, section])
    setActiveSectionId(section.id)
  }

  const handleAddElement = async (type: RPGElementType) => {
    if (!activeSectionId || !user?.id) return
    const el = await createSceneElement(projectData.id, activeSectionId, user.id, {
      element_type: type,
      content: "",
      order_index: elements.length,
    })
    setElements(prev => [...prev, el])
    setTimeout(() => document.getElementById(`el-${el.id}`)?.focus(), 50)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, el: ScriptElement) => {
    if (e.key === "Enter" && !e.shiftKey && el.element_type !== "stat_block" && el.element_type !== "table") {
      e.preventDefault()
      const nextType: RPGElementType = el.element_type === "h1" ? "h2" : el.element_type === "h2" ? "body" : "body"
      handleAddElement(nextType)
    }
  }

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderElement = (el: ScriptElement) => {
    const isCollapsible = el.element_type === "stat_block" || el.element_type === "table" || el.element_type === "rule_box"
    const isCollapsed = collapsed.has(el.id)

    if (el.element_type === "h1") {
      return (
        <div
          key={el.id}
          id={`el-${el.id}`}
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
          onKeyDown={(e) => handleKeyDown(e, el)}
          className="text-2xl font-black uppercase tracking-wide outline-none mt-8 mb-2 pb-2 border-b-2 border-foreground empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40"
          data-placeholder="Section title"
        >
          {el.content}
        </div>
      )
    }

    if (el.element_type === "h2") {
      return (
        <div
          key={el.id}
          id={`el-${el.id}`}
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
          onKeyDown={(e) => handleKeyDown(e, el)}
          className="text-lg font-bold outline-none mt-5 mb-1 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40"
          data-placeholder="Subsection title"
        >
          {el.content}
        </div>
      )
    }

    if (el.element_type === "stat_block") {
      return (
        <div key={el.id} className="my-3 rounded-lg border-2 border-amber-700/40 dark:border-amber-600/40 overflow-hidden">
          <div
            className="flex items-center justify-between px-3 py-1.5 bg-amber-700/10 dark:bg-amber-600/10 cursor-pointer select-none"
            onClick={() => toggleCollapse(el.id)}
          >
            <span className="text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-500">Stat Block</span>
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-amber-700/60" /> : <ChevronDown className="h-3.5 w-3.5 text-amber-700/60" />}
          </div>
          {!isCollapsed && (
            <div
              id={`el-${el.id}`}
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
              className="font-mono text-sm outline-none px-3 py-2 whitespace-pre-wrap min-h-[4rem] empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40"
              data-placeholder={ELEMENT_PLACEHOLDERS.stat_block}
            >
              {el.content}
            </div>
          )}
        </div>
      )
    }

    if (el.element_type === "table") {
      const mode = tableMode[el.id] ?? "edit"
      const parsed = mode === "preview" ? parsePipeTable(el.content) : null

      return (
        <div key={el.id} className="my-3 rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted select-none">
            <div
              className="flex items-center gap-1.5 cursor-pointer flex-1"
              onClick={() => toggleCollapse(el.id)}
            >
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Table</span>
              {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />}
            </div>
            {!isCollapsed && (
              <button
                onClick={() => toggleTableMode(el.id)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded hover:bg-background/60"
              >
                {mode === "edit" ? (
                  <><Table className="h-3 w-3" /> Preview</>
                ) : (
                  <><Pencil className="h-3 w-3" /> Edit</>
                )}
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
                        <th
                          key={i}
                          className="px-3 py-2 text-left font-semibold border-b border-border text-foreground text-xs uppercase tracking-wide"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((row, ri) => (
                      <tr
                        key={ri}
                        className={cn(
                          "border-b border-border/50 last:border-0",
                          ri % 2 === 0 ? "bg-background" : "bg-muted/20"
                        )}
                      >
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2 text-foreground/90">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {parsed.rows.length === 0 && (
                      <tr>
                        <td
                          colSpan={parsed.headers.length}
                          className="px-3 py-4 text-center text-muted-foreground text-xs"
                        >
                          No rows yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : mode === "preview" && !parsed ? (
              <div className="px-3 py-4 text-center text-muted-foreground text-xs">
                No valid table syntax yet. Switch to Edit and use:<br />
                <code className="font-mono mt-1 block">Col A | Col B | Col C</code>
                <code className="font-mono">--- | --- | ---</code>
                <code className="font-mono">Val 1 | Val 2 | Val 3</code>
              </div>
            ) : (
              <div
                id={`el-${el.id}`}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
                className="font-mono text-sm outline-none px-3 py-2 whitespace-pre-wrap min-h-[3rem] empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40"
                data-placeholder={ELEMENT_PLACEHOLDERS.table}
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
        <div key={el.id} className="my-3 rounded-lg border-l-4 border-primary bg-primary/5 px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-widest text-primary mb-1.5">Designer Note</div>
          <div
            id={`el-${el.id}`}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
            onKeyDown={(e) => handleKeyDown(e, el)}
            className="text-sm italic outline-none leading-relaxed min-h-[1.5rem] empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40"
            data-placeholder={ELEMENT_PLACEHOLDERS.callout}
          >
            {el.content}
          </div>
        </div>
      )
    }

    if (el.element_type === "rule_box") {
      return (
        <div key={el.id} className="my-3 rounded-lg border-2 border-border bg-muted/40 px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Rule</div>
          <div
            id={`el-${el.id}`}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
            onKeyDown={(e) => handleKeyDown(e, el)}
            className="text-sm font-medium outline-none leading-relaxed min-h-[1.5rem] empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40"
            data-placeholder={ELEMENT_PLACEHOLDERS.rule_box}
          >
            {el.content}
          </div>
        </div>
      )
    }

    // body (default)
    return (
      <div
        key={el.id}
        id={`el-${el.id}`}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => handleContentChange(el.id, e.currentTarget.textContent ?? "", false)}
        onKeyDown={(e) => handleKeyDown(e, el)}
        className="text-base leading-relaxed outline-none min-h-[1.5rem] my-1 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30"
        data-placeholder="Write rules, lore, descriptions…"
      >
        {el.content}
      </div>
    )
  }

  const wordCount = elements.reduce((acc, el) => {
    return acc + el.content.trim().split(/\s+/).filter(Boolean).length
  }, 0)

  return (
    <div className="flex h-screen bg-background">
      {/* Section sidebar */}
      <aside className="w-52 border-r flex flex-col shrink-0">
        <div className="p-3 border-b">
          <span className="text-sm font-medium">Sections</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {sections.map((section, i) => (
            <button
              key={section.id}
              onClick={() => setActiveSectionId(section.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                activeSectionId === section.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted text-muted-foreground"
              )}
            >
              <span className="text-xs text-muted-foreground/50 mr-1">{i + 1}.</span>
              <span className="truncate">{section.scene_heading || "Untitled"}</span>
            </button>
          ))}
        </div>
        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full gap-2 justify-start" onClick={handleAddSection}>
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
              <h1 className="text-base font-semibold">{projectData.title}</h1>
              <p className="text-xs text-muted-foreground">Tabletop RPG</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{wordCount.toLocaleString()} words</span>
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
            {activeSectionId && (
              <>
                {/* Section heading */}
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => handleContentChange(activeSectionId, e.currentTarget.textContent ?? "", true)}
                  className="text-3xl font-black uppercase tracking-wider outline-none mb-8 pb-3 border-b-2 border-foreground empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40"
                  data-placeholder="CHAPTER TITLE"
                >
                  {sections.find(s => s.id === activeSectionId)?.scene_heading}
                </div>

                {/* Elements */}
                {elements.map(renderElement)}

                {elements.length === 0 && (
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    className="text-base outline-none leading-relaxed min-h-[1.5rem] empty:before:content-['Start\00a0writing…'] empty:before:text-muted-foreground/40"
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") { e.preventDefault(); await handleAddElement("body") }
                    }}
                  />
                )}

                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2 pt-8 mt-8 border-t">
                  <span className="text-xs text-muted-foreground w-full mb-1">Insert element:</span>
                  {(Object.keys(ELEMENT_LABELS) as RPGElementType[]).map(type => (
                    <Button
                      key={type}
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-7 text-xs",
                        type === "stat_block" && "border-amber-700/40 text-amber-700 dark:text-amber-500 hover:bg-amber-700/10",
                        type === "callout" && "border-primary/40 text-primary hover:bg-primary/10",
                        type === "rule_box" && "border-border text-muted-foreground",
                      )}
                      onClick={() => handleAddElement(type)}
                    >
                      + {ELEMENT_LABELS[type]}
                    </Button>
                  ))}
                </div>
              </>
            )}

            {!activeSectionId && (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <p className="text-muted-foreground text-sm">No sections yet</p>
                <Button onClick={handleAddSection} size="sm" className="gap-2">
                  <Plus className="h-3.5 w-3.5" /> Create first section
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
