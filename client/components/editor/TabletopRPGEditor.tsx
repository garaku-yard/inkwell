"use client"

import { useState, useCallback, useMemo, useRef } from "react"
import { ChevronRight, ChevronDown, Table, Pencil, Dice6, Library, Type, Pilcrow, Heading2, Boxes, Shield, StickyNote, ScrollText } from "lucide-react"
import { StatBlockTemplatePicker } from "./ttrpg/StatBlockTemplatePicker"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/AuthContext"
import { useTheme } from "@/lib/ThemeContext"
import { useToast } from "@/hooks/use-toast"
import { AIChatPanel } from "./AIChatPanel"
import { EditorHeader } from "./shared/EditorHeader"
import { EmptyEditorState } from "./shared/EmptyEditorState"
import { useElementAutosave } from "./shared/useElementAutosave"
import { dispatchKey } from "@/lib/editor/keymap"
import { createRPGKeymap, type RPGElementType } from "./ttrpg/keymap"
import { SlashMenu } from "./ttrpg/SlashMenu"
import { deleteScriptElement } from "@/services/editor"
import { exportProjectToText, exportProjectToMarkdown } from "@/lib/export/text-export"
import { useExportToast } from "@/lib/export/use-export-toast"
import { parseMarkdownToTtrpg } from "@/lib/import/markdown-ttrpg"
import { importIntoProject } from "@/lib/import/import-into-project"
import { StableContentEditable } from "./shared/StableContentEditable"
import { useScrollSpy } from "./shared/useScrollSpy"
import {
  EditorSidebar,
  type EditorSidebarItem,
  type EditorSidebarCommentTarget,
} from "./shared/EditorSidebar"
import { useEditorComments } from "./shared/useEditorComments"
import { PagedSheets } from "./shared/PagedSheets"
import { type RailEntry } from "./shared/EditorToolRail"
import { paginate } from "@/lib/editor/paginate"
import {
  createScene,
  createSceneElement,
  type ProjectElement,
  type FullProject,
} from "@/services/project"


// dice_table: a random-result table with an implied die type based on row count
// Standard die sizes: d4 d6 d8 d10 d12 d20 d100
const DIE_FOR_ROWS: Record<number, string> = { 4: "d4", 6: "d6", 8: "d8", 10: "d10", 12: "d12", 20: "d20", 100: "d100" }

function wordCount(text: string | null | undefined) {
  if (!text) return 0
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

type RPGScene = NonNullable<FullProject["scenes"]>[number]

/** One renderable unit on a TTRPG sheet — a section header, the
 *  empty-section placeholder, or a single element (body / subheading /
 *  stat block / table / random table / callout / rule box). */
type RPGBlock =
  | { key: string; kind: "sectionHead"; section: RPGScene }
  | { key: string; kind: "emptySection"; section: RPGScene }
  | { key: string; kind: "element"; section: RPGScene; el: ProjectElement; elIdx: number }

/** TTRPG's element vocabulary for the right-edge tool rail. The five
 *  structured "block" types collapse behind one flyout so the rail
 *  stays short. */
const RPG_RAIL_ITEMS: RailEntry[] = [
  { type: "body", label: "Body", icon: Pilcrow },
  { type: "h2", label: "Subheading", icon: Heading2 },
  {
    label: "Block",
    icon: Boxes,
    items: [
      { type: "stat_block", label: "Stat block", icon: Shield },
      { type: "table", label: "Table", icon: Table },
      { type: "dice_table", label: "Random table", icon: Dice6 },
      { type: "callout", label: "Designer note", icon: StickyNote },
      { type: "rule_box", label: "Rule box", icon: ScrollText },
    ],
  },
]

export function TabletopRPGEditor({ projectData }: TabletopRPGEditorProps) {
  const { user } = useAuth()
  const [sections, setSections] = useState(() => projectData.scenes ?? [])
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [tableMode, setTableMode] = useState<Record<string, "edit" | "preview">>({})
  // Most recent in-memory roll per dice_table element. Not persisted —
  // the table itself is the source of truth, the result is just a UI
  // affordance that helps GMs sanity-check distributions during prep.
  const [diceRoll, setDiceRoll] = useState<Record<string, { roll: number; result: string }>>({})
  // Element id of the stat_block whose template loader is currently open,
  // or null when the dialog is closed. We thread this through state
  // (rather than letting the dialog own its own visibility) so the
  // editor knows which element to apply the picked template to.
  const [templatePickerFor, setTemplatePickerFor] = useState<string | null>(null)
  const sectionRefs = useRef<Map<string, HTMLElement | null>>(new Map())
  const { saveStatus, scheduleSave } = useElementAutosave({ userId: user?.id })
  const runExport = useExportToast()
  const { toast } = useToast()
  const { editorFontStack } = useTheme()
  const {
    comments: projectComments,
    onAddComment,
    onUpdateComment,
    onDeleteComment,
    onToggleCommentResolved,
  } = useEditorComments(projectData.id)
  // Last-focused element — what a new comment attaches to (set by a single
  // focus listener on the scroll container that reads the focused el-<id>).
  const [focusedElementId, setFocusedElementId] = useState<string | null>(null)
  const activeSectionId = useScrollSpy({ refs: sectionRefs, orderedIds: sections.map((s) => s.id) })

  const totalWords = sections.reduce((acc, s) =>
    acc + (s.elements ?? []).reduce((a, el) => a + wordCount(el.content), 0), 0)

  const activeCommentTarget = useMemo<EditorSidebarCommentTarget | null>(() => {
    if (focusedElementId) {
      for (const s of sections) {
        const el = (s.elements ?? []).find((e) => e.id === focusedElementId)
        if (el) return { item: el, isScene: false }
      }
    }
    // Fall back to the section in view so the Comments tab is never a dead end.
    const section = sections.find((s) => s.id === activeSectionId) ?? sections[0]
    return section ? { item: section, isScene: true } : null
  }, [focusedElementId, sections, activeSectionId])

  const sidebarItems = useMemo<EditorSidebarItem[]>(
    () =>
      sections.map((section, i) => ({
        id: section.id,
        title: section.scene_heading || "Untitled",
        index: i + 1,
        commentTargetIds: [section.id, ...(section.elements ?? []).map((e) => e.id)],
        subItems: (section.elements ?? [])
          .filter((el) => el.element_type === "h2")
          .map((h) => ({
            id: h.id,
            title: h.content || "Subsection",
            onSelect: () =>
              document.getElementById(`el-${h.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
          })),
      })),
    [sections],
  )

  const handleContentChange = useCallback((id: string, content: string, isScene: boolean) => {
    if (isScene) {
      setSections(prev => prev.map(s => s.id === id ? { ...s, scene_heading: content } : s))
    } else {
      setSections(prev => prev.map(s => ({
        ...s,
        elements: (s.elements ?? []).map(el => el.id === id ? { ...el, content } : el),
      })))
    }
    scheduleSave(id, content, isScene)
  }, [scheduleSave])

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

  // Import a Markdown / text file as new sections appended to this project.
  const handleImportMarkdown = async (text: string, fileName: string) => {
    if (!user?.id) return
    const title = fileName.replace(/\.[^/.]+$/, "")
    const parsed = parseMarkdownToTtrpg(text, title)
    try {
      const created = await importIntoProject(projectData.id, user.id, parsed, sections.length)
      setSections((prev) => [...prev, ...created])
      if (created[0]) {
        setTimeout(() => {
          sectionRefs.current.get(created[0].id)?.scrollIntoView({ behavior: "smooth", block: "start" })
        }, 100)
      }
      const word = created.length === 1 ? "section" : "sections"
      toast({ title: "Import complete", description: `Added ${created.length} ${word} from ${fileName}.` })
    } catch (err) {
      console.error("Failed to import:", err)
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : "Couldn't import that file.",
        variant: "destructive",
      })
    }
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

  const handleDeleteElement = useCallback(
    async (sectionId: string, elementId: string) => {
      const ids: string[] = []
      for (const s of sections) {
        for (const el of s.elements ?? []) {
          ids.push(el.id)
        }
      }
      const idx = ids.indexOf(elementId)
      const prevId = idx > 0 ? ids[idx - 1] : null

      setSections((prev) =>
        prev.map((s) =>
          s.id !== sectionId
            ? s
            : { ...s, elements: (s.elements ?? []).filter((el) => el.id !== elementId) },
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
    [sections, toast],
  )

  const keyMap = useMemo(
    () =>
      createRPGKeymap({
        sections,
        insertElementAfter: (sectionId, type, afterIdx) =>
          void handleAddElement(sectionId, type, afterIdx),
        deleteEmptyElement: (sectionId, elementId) =>
          void handleDeleteElement(sectionId, elementId),
      }),
    // handleAddElement intentionally omitted to avoid re-creating the keymap each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, handleDeleteElement],
  )

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLDivElement>,
      sectionId: string,
      el: ProjectElement,
      elIdx: number,
    ) => {
      dispatchKey(e, keyMap, {
        sectionId,
        elementId: el.id,
        elementType: el.element_type as RPGElementType,
        elementIndex: elIdx,
      })
    },
    [keyMap],
  )

  // Notion-style slash command menu — triggered when a body element's
  // text starts with "/". The user types to filter, Enter inserts the
  // chosen type as a new element after the current body and clears
  // the slash from the body.
  const [slashMenu, setSlashMenu] = useState<{
    sectionId: string
    elementId: string
    elementIndex: number
    query: string
    position: { top: number; left: number }
  } | null>(null)

  const handleBodyChange = useCallback(
    (
      text: string,
      sectionId: string,
      el: ProjectElement,
      elIdx: number,
    ) => {
      handleContentChange(el.id, text, false)
      // Trigger only when the entire element starts with "/" — limits
      // the slash menu to fresh / one-line bodies and keeps it from
      // interfering with rules text that mentions slashes.
      if (!text.startsWith("/") || text.includes("\n")) {
        setSlashMenu(null)
        return
      }
      const query = text.slice(1)
      // The body element renders with id="el-<elementId>" so we can
      // look it up here without threading the DOM ref through state.
      const node = document.getElementById(`el-${el.id}`)
      if (!node) return
      const rect = node.getBoundingClientRect()
      setSlashMenu({
        sectionId,
        elementId: el.id,
        elementIndex: elIdx,
        query,
        position: { top: rect.bottom + 4, left: rect.left },
      })
    },
    [handleContentChange],
  )

  const handleSlashSelect = useCallback(
    (type: RPGElementType) => {
      if (!slashMenu) return
      const { sectionId, elementId, elementIndex } = slashMenu
      // Clear the "/foo" text from the source body so it doesn't sit
      // there next to the freshly-inserted element. Mutate textContent
      // directly + dispatch input so React's state and the autosave
      // pipeline both pick it up.
      const sourceEl = document.getElementById(`el-${elementId}`)
      if (sourceEl) {
        sourceEl.textContent = ""
        sourceEl.dispatchEvent(new Event("input", { bubbles: true }))
      }
      void handleAddElement(sectionId, type, elementIndex)
      setSlashMenu(null)
    },
    // handleAddElement intentionally omitted; it's recreated each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slashMenu],
  )

  const toggleCollapse = (id: string) =>
    setCollapsed(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const toggleTableMode = (id: string) =>
    setTableMode(prev => ({ ...prev, [id]: prev[id] === "preview" ? "edit" : "preview" }))

  // Replace a stat_block's content with a template body. The
  // StableContentEditable primitive picks up the new value via its
  // props sync (the user is focused on the dialog button when this
  // fires, so the contentEditable isn't focused and accepts the
  // sync). No imperative DOM write needed — when the primitive added
  // its mount/sync effect this redundancy went away.
  const loadStatBlockTemplate = (elementId: string, body: string) => {
    handleContentChange(elementId, body, false)
  }

  const rollDiceTable = (id: string, rows: [string, string][]) => {
    if (rows.length === 0) return
    const idx = Math.floor(Math.random() * rows.length)
    const [roll, result] = rows[idx]
    setDiceRoll(prev => ({ ...prev, [id]: { roll: Number(roll) || idx + 1, result } }))
  }

  const renderElement = (el: ProjectElement, sectionId: string, elIdx: number) => {
    const isCollapsed = collapsed.has(el.id)

    if (el.element_type === "h2") {
      return (
        <StableContentEditable
          key={el.id}
          id={`el-${el.id}`}
          value={el.content}
          onValueChange={(next) => handleContentChange(el.id, next, false)}
          onKeyDown={(e) => handleKeyDown(e, sectionId, el, elIdx)}
          className="text-lg font-bold outline-none mt-7 mb-1.5 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50"
          data-placeholder="Subsection title"
        />
      )
    }

    if (el.element_type === "stat_block") {
      return (
        <div key={el.id} className="my-4 rounded-lg border-2 border-amber-700/40 dark:border-amber-500/30 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-amber-700/10 dark:bg-amber-500/10 select-none">
            <button
              className="flex items-center gap-1.5 cursor-pointer flex-1 text-left"
              onClick={() => toggleCollapse(el.id)}
            >
              <span className="text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-500">Stat Block</span>
              {isCollapsed
                ? <ChevronRight className="h-3.5 w-3.5 text-amber-700/60 dark:text-amber-500/60" />
                : <ChevronDown className="h-3.5 w-3.5 text-amber-700/60 dark:text-amber-500/60" />}
            </button>
            {!isCollapsed && (
              <button
                onClick={() => setTemplatePickerFor(el.id)}
                className="flex items-center gap-1 text-xs text-amber-700/80 dark:text-amber-500/80 hover:text-amber-700 dark:hover:text-amber-500 transition-colors px-2 py-0.5 rounded hover:bg-amber-700/10"
                title="Load template"
              >
                <Library className="h-3 w-3" /> Template
              </button>
            )}
          </div>
          {!isCollapsed && (
            <StableContentEditable
              id={`el-${el.id}`}
              value={el.content}
              onValueChange={(next) => handleContentChange(el.id, next, false)}
              className="font-mono text-sm outline-none px-3 py-3 whitespace-pre-wrap min-h-[5rem] leading-relaxed"
            />
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
              <div className="flex items-center gap-1">
                {mode === "preview" && parsed && parsed.rows.length > 0 && (
                  <button
                    onClick={() => rollDiceTable(el.id, parsed.rows)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded hover:bg-background/60"
                    title={`Roll ${parsed.die}`}
                  >
                    <Dice6 className="h-3 w-3" /> Roll
                  </button>
                )}
                <button onClick={() => toggleTableMode(el.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded hover:bg-background/60">
                  {mode === "edit" ? <><Table className="h-3 w-3" /> Preview</> : <><Pencil className="h-3 w-3" /> Edit</>}
                </button>
              </div>
            )}
          </div>
          {!isCollapsed && (
            mode === "preview" && parsed ? (
              <div className="overflow-x-auto">
                {diceRoll[el.id] && (
                  <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200/50 dark:border-amber-900/30 text-sm">
                    <span className="font-mono text-xs text-amber-700 dark:text-amber-400 mr-2">Rolled {diceRoll[el.id].roll}</span>
                    <span className="text-foreground">{diceRoll[el.id].result}</span>
                  </div>
                )}
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="px-3 py-2 text-left font-semibold border-b border-border text-xs uppercase tracking-wide w-16">{parsed.die}</th>
                      <th className="px-3 py-2 text-left font-semibold border-b border-border text-xs uppercase tracking-wide">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map(([roll, result], ri) => {
                      const isRolled = diceRoll[el.id]?.roll === Number(roll)
                      return (
                        <tr
                          key={ri}
                          className={cn(
                            "border-b border-border/50 last:border-0",
                            isRolled
                              ? "bg-amber-100/60 dark:bg-amber-900/30"
                              : ri % 2 === 0
                                ? "bg-background"
                                : "bg-muted/20",
                          )}
                        >
                          <td className="px-3 py-2 font-mono text-muted-foreground text-sm">{roll}</td>
                          <td className="px-3 py-2">{result}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <StableContentEditable
                id={`el-${el.id}`}
                value={el.content}
                onValueChange={(next) => handleContentChange(el.id, next, false)}
                className="font-mono text-sm outline-none px-3 py-2 whitespace-pre-wrap min-h-[5rem] text-xs"
              />
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
              <StableContentEditable
                id={`el-${el.id}`}
                value={el.content}
                onValueChange={(next) => handleContentChange(el.id, next, false)}
                className="font-mono text-sm outline-none px-3 py-2 whitespace-pre-wrap min-h-[3rem]"
              />
            )
          )}
        </div>
      )
    }

    if (el.element_type === "callout") {
      return (
        <div key={el.id} className="my-4 rounded-lg border-l-4 border-primary bg-primary/5 px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-widest text-primary mb-1.5">Designer Note</div>
          <StableContentEditable
            id={`el-${el.id}`}
            value={el.content}
            onValueChange={(next) => handleContentChange(el.id, next, false)}
            onKeyDown={(e) => handleKeyDown(e, sectionId, el, elIdx)}
            className="text-sm italic outline-none leading-relaxed min-h-[1.5rem] empty:before:content-['Note…'] empty:before:text-muted-foreground/50"
          />
        </div>
      )
    }

    if (el.element_type === "rule_box") {
      return (
        <div key={el.id} className="my-4 rounded-lg border-2 border-border bg-muted/40 px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Rule</div>
          <StableContentEditable
            id={`el-${el.id}`}
            value={el.content}
            onValueChange={(next) => handleContentChange(el.id, next, false)}
            onKeyDown={(e) => handleKeyDown(e, sectionId, el, elIdx)}
            className="text-sm font-medium outline-none leading-relaxed min-h-[1.5rem] empty:before:content-['Rule\00a0text…'] empty:before:text-muted-foreground/50"
          />
        </div>
      )
    }

    // body
    return (
      <StableContentEditable
        key={el.id}
        id={`el-${el.id}`}
        value={el.content}
        onValueChange={(next) => handleBodyChange(next, sectionId, el, elIdx)}
        onKeyDown={(e) => handleKeyDown(e, sectionId, el, elIdx)}
        className="text-base leading-relaxed outline-none min-h-[1.5rem] my-0.5 empty:before:content-['Write\00a0rules,\00a0lore,\00a0descriptions…'] empty:before:text-muted-foreground/50"
      />
    )
  }

  // Pack each section's title + elements onto A4 sheets; every section opens a
  // fresh sheet. The structured block estimates are deliberately generous —
  // the sheet min-height absorbs any slack so a card never clips.
  const sheets = useMemo<RPGBlock[][]>(() => {
    const blocks: RPGBlock[] = []
    sections.forEach((section) => {
      blocks.push({ key: `head-${section.id}`, kind: "sectionHead", section })
      const els = section.elements ?? []
      if (els.length === 0) {
        blocks.push({ key: `empty-${section.id}`, kind: "emptySection", section })
        return
      }
      els.forEach((el, elIdx) => {
        blocks.push({ key: el.id, kind: "element", section, el, elIdx })
      })
    })
    const estimate = (b: RPGBlock): number => {
      if (b.kind === "sectionHead") return 120
      if (b.kind === "emptySection") return 40
      switch (b.el.element_type) {
        case "h2":
          return 56
        case "stat_block":
          return 240
        case "dice_table":
          return 220
        case "table":
          return 160
        case "callout":
        case "rule_box":
          return 96
        default: {
          const len = (b.el.content ?? "").length
          return 16 + Math.max(1, Math.ceil(len / 80)) * 28
        }
      }
    }
    return paginate(blocks, estimate, { maxHeight: 940, startsNewSheetBefore: (b) => b.kind === "sectionHead" })
  }, [sections])

  // Rail click: insert after the focused element, else append to the section in view.
  const handleRailSelect = (type: string) => {
    let sectionId: string | undefined
    let afterIdx: number | undefined
    if (focusedElementId) {
      for (const s of sections) {
        const idx = (s.elements ?? []).findIndex((e) => e.id === focusedElementId)
        if (idx >= 0) {
          sectionId = s.id
          afterIdx = idx
          break
        }
      }
    }
    sectionId = sectionId ?? activeSectionId ?? sections[0]?.id
    if (!sectionId) return
    void handleAddElement(sectionId, type as RPGElementType, afterIdx)
  }

  /** Render any block — section header, empty-section placeholder, or element. */
  const renderBlock = (b: RPGBlock) => {
    if (b.kind === "sectionHead") {
      return (
        <div ref={(el) => { sectionRefs.current.set(b.section.id, el) }}>
          <StableContentEditable
            value={b.section.scene_heading ?? ""}
            onValueChange={(next) => handleContentChange(b.section.id, next, true)}
            className="text-3xl font-black uppercase tracking-wider outline-none mb-8 pb-3 border-b-2 border-foreground empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50"
            data-placeholder="CHAPTER TITLE"
          />
        </div>
      )
    }
    if (b.kind === "emptySection") {
      return (
        <StableContentEditable
          value=""
          onValueChange={() => { /* empty-state placeholder; first Enter creates a body element */ }}
          className="text-base outline-none leading-relaxed min-h-[1.5rem] empty:before:content-['Start\00a0writing…'] empty:before:text-muted-foreground/50"
          onKeyDown={async (e) => {
            if (e.key === "Enter") { e.preventDefault(); await handleAddElement(b.section.id, "body") }
          }}
        />
      )
    }
    return renderElement(b.el, b.section.id, b.elIdx)
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sections sidebar — shared rail (sections + h2 subheadings) + comments. */}
      <EditorSidebar
        headerIcon={Library}
        headerLabel="Contents"
        stats={[
          { icon: Library, label: `${sections.length} ${sections.length === 1 ? "section" : "sections"}` },
          { icon: Type, label: `${totalWords.toLocaleString()} words` },
        ]}
        items={sidebarItems}
        activeItemId={activeSectionId}
        onItemClick={(id) => sectionRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        addLabel="Add section"
        onAdd={handleAddSection}
        emptyLabel="No sections yet."
        comments={projectComments}
        activeCommentTarget={activeCommentTarget}
        onAddComment={onAddComment}
        onUpdateComment={onUpdateComment}
        onDeleteComment={onDeleteComment}
        onToggleCommentResolved={onToggleCommentResolved}
      />

      {/* Editor */}
      <div className="flex flex-col flex-1 min-w-0">
        <EditorHeader
          title={projectData.title}
          subtitle="Tabletop RPG"
          statRight={`${totalWords.toLocaleString()} words`}
          saveStatus={saveStatus}
          onToggleAI={() => setIsAIChatOpen(o => !o)}
          isAIOpen={isAIChatOpen}
          projectId={projectData.id}
          category={projectData.category}
          importItems={[
            {
              label: "Markdown / Text (.md, .txt)",
              accept: ".md,.markdown,.txt",
              onFile: (text, fileName) => void handleImportMarkdown(text, fileName),
            },
          ]}
          exportItems={[
            {
              label: "Export as Plain Text (.txt)",
              onClick: () => void runExport({
                extension: "txt",
                projectTitle: projectData.title,
                run: () => exportProjectToText({ ...projectData, scenes: sections }),
              }),
            },
            {
              label: "Export as Markdown (.md)",
              onClick: () => void runExport({
                extension: "md",
                projectTitle: projectData.title,
                run: () => exportProjectToMarkdown({ ...projectData, scenes: sections }),
              }),
            },
          ]}
        />

        <div
          className="flex flex-1 overflow-hidden"
          onFocus={(e) => {
            const id = (e.target as HTMLElement)?.id
            if (id?.startsWith("el-")) setFocusedElementId(id.slice(3))
          }}
        >
          <PagedSheets
            pages={sheets}
            renderBlock={renderBlock}
            fontFamily={editorFontStack("ttrpg")}
            railItems={RPG_RAIL_ITEMS}
            onRailSelect={handleRailSelect}
            railStorageKey="editor.rail.ttrpg"
            pageIdPrefix="ttrpg-page"
            isEmpty={sections.length === 0}
            emptyState={
              <EmptyEditorState
                message="No sections yet."
                actionLabel="Create first section"
                onAction={handleAddSection}
              />
            }
          />
          <AIChatPanel isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} category={projectData.category} projectId={projectData.id} />
        </div>
      </div>
      {slashMenu && (
        <SlashMenu
          query={slashMenu.query}
          position={slashMenu.position}
          onSelect={handleSlashSelect}
          onDismiss={() => setSlashMenu(null)}
        />
      )}
      <StatBlockTemplatePicker
        open={templatePickerFor !== null}
        onOpenChange={(next) => { if (!next) setTemplatePickerFor(null) }}
        onPick={(body) => {
          if (templatePickerFor) loadStatBlockTemplate(templatePickerFor, body)
        }}
      />
    </div>
  )
}
