"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { ChevronRight, ChevronDown, Table, Pencil, Dice6, Library, Type, Pilcrow, Heading2, Shield, StickyNote, ScrollText, Clock3, MapPin, Link2, Quote } from "lucide-react"
import { StatBlockTemplatePicker } from "./ttrpg/StatBlockTemplatePicker"
import { StatSchemaManager } from "./ttrpg/StatSchemaManager"
import { TypedBlockEditor } from "./ttrpg/TypedBlockEditor"
import { defaultTtrpgBlock, parseTtrpgBlock, ttrpgBlockToText } from "@/lib/ttrpg/blocks"
import { parseRandomTable, rollRandomTable, type RandomTableRow } from "@/lib/ttrpg/random-table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useDataChanged } from "@/lib/live-refresh"
import { getFullProject, getProjectById, updateProject } from "@/services/project"
import { parseStatInstance, statInstanceToText, type StatInstance, type StatSchema } from "@/lib/ttrpg/stat-schemas"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/AuthContext"
import { useTheme } from "@/lib/ThemeContext"
import { useToast } from "@/hooks/use-toast"
import { ProjectShell } from "./shared/ProjectShell"
import { EditorToolbar } from "./shared/EditorToolbar"
import { EmptyEditorState } from "./shared/EmptyEditorState"
import { useElementAutosave } from "./shared/useElementAutosave"
import { dispatchKey } from "@/lib/editor/keymap"
import { createRPGKeymap, type RPGElementType } from "./ttrpg/keymap"
import { SlashMenu } from "./ttrpg/SlashMenu"
import { exportProjectToText, exportProjectToMarkdown } from "@/lib/export/text-export"
import { useExportToast } from "@/lib/export/use-export-toast"
import { parseMarkdownToTtrpg } from "@/lib/import/markdown-ttrpg"
import { importIntoProject } from "@/lib/import/import-into-project"
import { StableContentEditable } from "./shared/StableContentEditable"
import { EditorWorkspace } from "./shared/EditorWorkspace"
import { useEditorRealtime } from "./shared/useEditorRealtime"
import { PresencePips } from "./shared/PresencePips"
import { useScrollSpy } from "./shared/useScrollSpy"
import { useEditorDocument } from "./shared/useEditorDocument"
import { useEditorCommentTarget } from "./shared/useEditorCommentTarget"
import { useEditorMutations } from "./shared/useEditorMutations"
import {
  EditorSidebar,
  type EditorSidebarItem,
} from "./shared/EditorSidebar"
import { useEditorComments } from "./shared/useEditorComments"
import { PagedSheets } from "./shared/PagedSheets"
import { type RailEntry } from "./shared/EditorToolRail"
import { paginate } from "@/lib/editor/paginate"
import {
  type ProjectElement,
  type FullProject,
} from "@/services/project"


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

/** Each TTRPG block has its own insertion action. These are different authoring
 * tools, not variants of one block, so they stay visible in the rail. */
const RPG_RAIL_ITEMS: RailEntry[] = [
  { type: "body", label: "Body", icon: Pilcrow },
  { type: "h2", label: "Subheading", icon: Heading2 },
  { type: "ttrpg_stat", label: "Stat block", icon: Shield },
  { type: "table", label: "Table", icon: Table },
  { type: "dice_table", label: "Random table", icon: Dice6 },
  { type: "callout", label: "Designer note", icon: StickyNote },
  { type: "rule_box", label: "Rule box", icon: ScrollText },
  { type: "ttrpg_clock", label: "Progress clock", icon: Clock3 },
  { type: "ttrpg_read_aloud", label: "Read aloud", icon: Quote },
  { type: "ttrpg_keyed_location", label: "Keyed location", icon: MapPin },
  { type: "ttrpg_cross_reference", label: "Cross-reference", icon: Link2 },
]

export function TabletopRPGEditor({ projectData }: TabletopRPGEditorProps) {
  const { user } = useAuth()
  const [sections, setSections] = useState(() => projectData.scenes ?? [])
  const followedExternalTarget = useRef(false)
  useEffect(() => {
    if (followedExternalTarget.current) return
    const targetId = new URLSearchParams(window.location.search).get("target")
    if (!targetId) return
    followedExternalTarget.current = true
    window.setTimeout(() => document.getElementById(`${sections.some((section) => section.id === targetId) ? "head" : "el"}-${targetId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" }), 100)
  }, [sections])
  const [statSchemas, setStatSchemas] = useState<StatSchema[]>(() => projectData.ttrpg_stat_schemas ?? [])
  const [isSchemaManagerOpen, setIsSchemaManagerOpen] = useState(false)
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [tableMode, setTableMode] = useState<Record<string, "edit" | "preview">>({})
  // Most recent in-memory roll per dice_table element. Not persisted —
  // the table itself is the source of truth, the result is just a UI
  // affordance that helps GMs sanity-check distributions during prep.
  const [diceRoll, setDiceRoll] = useState<Record<string, { roll: number; result: string }>>({})
  const [remoteTargetLabels, setRemoteTargetLabels] = useState<Record<string, string>>({})
  const [remoteRevision, setRemoteRevision] = useState(0)
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

  const remoteReferenceKey = sections.flatMap((section) => (section.elements ?? []).flatMap((element) => {
    const block = parseTtrpgBlock(element.element_type, element.content)
    return block?.kind === "cross_reference" && block.targetProjectId && block.targetProjectId !== projectData.id && block.targetId
      ? [`${block.targetProjectId}:${block.targetId}`] : []
  })).sort().join("|")

  useEffect(() => {
    if (!remoteReferenceKey) return
    let cancelled = false
    const references = remoteReferenceKey.split("|").map((key) => {
      const separator = key.indexOf(":")
      return { projectId: key.slice(0, separator), targetId: key.slice(separator + 1), key }
    })
    void Promise.all([...new Set(references.map((item) => item.projectId))].map(async (projectId) => {
      try { return await getFullProject(projectId, user?.id ?? "") } catch { return null }
    })).then((remoteProjects) => {
      if (cancelled) return
      const labels: Record<string, string> = {}
      for (const reference of references) {
        const project = remoteProjects.find((item) => item?.id === reference.projectId)
        if (!project) continue
        for (const scene of project.scenes ?? []) {
          if (scene.id === reference.targetId) labels[reference.key] = `${project.title} / ${scene.scene_heading || "Untitled passage"}`
          const target = (scene.elements ?? []).find((item) => item.id === reference.targetId)
          if (target) labels[reference.key] = `${project.title} / ${scene.scene_heading || "Untitled"} / ${target.content.split("\n")[0].slice(0, 60)}`
        }
      }
      setRemoteTargetLabels(labels)
    })
    return () => { cancelled = true }
  }, [remoteReferenceKey, remoteRevision, user?.id])

  useDataChanged((change) => {
    if (change.projectId !== projectData.id) {
      if (remoteReferenceKey.split("|").some((key) => key.startsWith(`${change.projectId}:`))) setRemoteRevision((current) => current + 1)
      return
    }
    void getProjectById(projectData.id, user?.id ?? "").then((project) =>
      setStatSchemas(project.ttrpg_stat_schemas ?? []),
    ).catch(() => {})
  })
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

  // Live co-editing + remote carets (no-op on the desktop build).
  const writeSurfaceRef = useRef<HTMLDivElement | null>(null)
  const { broadcastEdit, subscribeCarets, peersByElement } = useEditorRealtime({
    projectId: projectData.id,
    userId: user?.id,
    scenes: sections,
    setScenes: setSections,
    surfaceRef: writeSurfaceRef,
    focusId: activeSectionId,
    focusLabel: sections.find((s) => s.id === activeSectionId)?.scene_heading || "Untitled",
  })
  const { handleContentChange, refreshDocument } = useEditorDocument({
    projectId: projectData.id,
    userId: user?.id,
    units: sections,
    setUnits: setSections,
    scheduleSave,
    broadcastEdit,
    emptyUnitElementType: "body",
  })
  const { createUnit, insertElement: insertDocumentElement, deleteElement } = useEditorMutations({
    projectId: projectData.id, userId: user?.id, units: sections, setUnits: setSections,
  })

  const totalWords = sections.reduce((acc, s) =>
    acc + (s.elements ?? []).reduce((a, el) => {
      const instance = el.element_type === "ttrpg_stat" ? parseStatInstance(el.content) : null
      const typed = parseTtrpgBlock(el.element_type, el.content)
      return a + wordCount(instance
        ? statInstanceToText(instance, statSchemas.find((schema) => schema.id === instance.schemaId))
        : typed ? ttrpgBlockToText(typed) : el.content)
    }, 0), 0)

  const activeCommentTarget = useEditorCommentTarget({ units: sections, focusedElementId, activeUnitId: activeSectionId })

  const sidebarItems = useMemo<EditorSidebarItem[]>(
    () =>
      sections.map((section, i) => {
        const here = peersByElement.get(section.id)
        return {
          id: section.id,
          title: section.scene_heading || "Untitled",
          index: i + 1,
          commentTargetIds: [section.id, ...(section.elements ?? []).map((e) => e.id)],
          adornment: here && here.length ? <PresencePips peers={here} /> : undefined,
          subItems: (section.elements ?? [])
            .filter((el) => el.element_type === "h2")
            .map((h) => ({
              id: h.id,
              title: h.content || "Subsection",
              onSelect: () =>
                document.getElementById(`el-${h.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
            })),
        }
      }),
    [sections, peersByElement],
  )

  const handleAddSection = async () => {
    const section = await createUnit()
    if (!section) return
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
    return insertDocumentElement(sectionId, {
      elementType: type,
      content,
      afterIndex: afterIdx,
    })
  }

  const handleAddElement = async (sectionId: string, type: RPGElementType, afterIdx?: number) => {
    let defaultContent = ""
    if (type === "stat_block") {
      defaultContent = "Name\nAC — | HP — | Speed —ft\nSTR — | DEX — | CON — | INT — | WIS — | CHA —\n\nTraits\n—\n\nActions\n—"
    } else if (type === "dice_table") {
      defaultContent = "Result\n---\nFirst outcome\nSecond outcome\nThird outcome\nFourth outcome\nFifth outcome\nSixth outcome"
    } else if (type === "table") {
      defaultContent = "Column A | Column B | Column C\n--- | --- | ---\n | | "
    } else if (type.startsWith("ttrpg_") && type !== "ttrpg_stat") {
      defaultContent = JSON.stringify(defaultTtrpgBlock(type.slice(6) as "clock" | "read_aloud" | "keyed_location" | "cross_reference"))
    }
    const el = await insertElement(sectionId, type, defaultContent, afterIdx)
    if (el) setTimeout(() => document.getElementById(`el-${el.id}`)?.focus(), 50)
  }

  const saveStatSchema = async (schema: StatSchema) => {
    if (!user?.id) throw new Error("Sign in to save a template.")
    const next = statSchemas.some((item) => item.id === schema.id)
      ? statSchemas.map((item) => item.id === schema.id ? schema : item)
      : [...statSchemas, schema]
    const saved = await updateProject(projectData.id, user.id, { ttrpg_stat_schemas: next })
    setStatSchemas(saved.ttrpg_stat_schemas ?? next)
  }

  const insertStatInstance = async (schema: StatSchema) => {
    const sectionId = activeSectionId ?? sections[0]?.id
    if (!sectionId) {
      toast({ title: "Create a section before adding a stat block.", variant: "destructive" })
      return
    }
    const instance: StatInstance = { schemaId: schema.id, name: "New " + schema.name, values: {} }
    await insertElement(sectionId, "ttrpg_stat", JSON.stringify(instance))
    setIsSchemaManagerOpen(false)
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

      try {
        await deleteElement(sectionId, elementId)
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
    [deleteElement, sections, toast],
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

  const rollDiceTable = (id: string, content: string) => {
    const table = parseRandomTable(content)
    if (!table) return
    const row = rollRandomTable(table)
    setDiceRoll(prev => ({ ...prev, [id]: { roll: table.rows.indexOf(row) + 1, result: row.result } }))
  }

  const renderElement = (el: ProjectElement, sectionId: string, elIdx: number) => {
    const isCollapsed = collapsed.has(el.id)

    if (el.element_type.startsWith("ttrpg_") && el.element_type !== "ttrpg_stat") {
      const block = parseTtrpgBlock(el.element_type, el.content)
      if (!block) return <div key={el.id} className="my-4 rounded-lg border p-3 text-destructive">Invalid typed block data. The saved data has been kept.</div>
      const targets = sections.flatMap((section) => [{ id: section.id, label: `${section.scene_heading || "Untitled"} (passage)` }, ...(section.elements ?? [])
        .filter((item) => item.id !== el.id && item.element_type !== "ttrpg_cross_reference")
        .map((item) => {
          const stat = item.element_type === "ttrpg_stat" ? parseStatInstance(item.content) : null
          const typed = parseTtrpgBlock(item.element_type, item.content)
          return { id: item.id, label: `${section.scene_heading || "Untitled"} / ${stat?.name || (typed && ttrpgBlockToText(typed).split("\n")[0]) || item.content.slice(0, 60) || item.element_type}` }
        })])
      const title = { clock: "Progress clock", read_aloud: "Read aloud", keyed_location: "Keyed location", cross_reference: "Cross-reference" }[block.kind]
      return <div key={el.id} id={`el-${el.id}`} className="my-4 rounded-lg border bg-muted/20 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</span>
          <Button size="sm" variant="ghost" onClick={() => void handleDeleteElement(sectionId, el.id)}>Delete block</Button>
        </div>
        <TypedBlockEditor block={block} targets={targets} currentProjectId={projectData.id}
          resolvedTargetLabel={block.kind === "cross_reference" ? remoteTargetLabels[`${block.targetProjectId}:${block.targetId}`] : undefined}
          onChange={(next) => handleContentChange(el.id, JSON.stringify(next), false)}
          onNavigate={(id) => document.getElementById(`el-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} />
      </div>
    }

    if (el.element_type === "ttrpg_stat") {
      const instance = parseStatInstance(el.content)
      const schema = statSchemas.find((item) => item.id === instance?.schemaId)
      if (!instance || !schema) return <div key={el.id} id={`el-${el.id}`} className="my-4 rounded-lg border p-3 text-sm text-destructive">
        This stat block&apos;s template is missing or its data is invalid. The saved data has been kept.
        <pre className="mt-2 whitespace-pre-wrap text-foreground">{instance ? statInstanceToText(instance) : el.content}</pre>
      </div>
      const write = (next: StatInstance) => handleContentChange(el.id, JSON.stringify(next), false)
      return <div key={el.id} id={`el-${el.id}`} className="my-4 rounded-lg border-2 border-amber-700/40 dark:border-amber-500/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-500">{schema.name} stat block</span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setIsSchemaManagerOpen(true)}>Edit template</Button>
            <Button size="sm" variant="ghost" onClick={() => void handleDeleteElement(sectionId, el.id)}>Delete block</Button>
          </div>
        </div>
        <label className="grid gap-1 text-sm font-medium">Name
          <Input value={instance.name} onChange={(event) => write({ ...instance, name: event.target.value })} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {schema.fields.map((field) => <label key={field.id} className="grid gap-1 text-sm">{field.label}
            {field.kind === "choice" ? <select className="h-9 rounded-md border bg-background px-2" value={instance.values[field.id] ?? ""}
              onChange={(event) => write({ ...instance, values: { ...instance.values, [field.id]: event.target.value } })}>
              <option value="">Choose…</option>
              {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
            </select> : field.kind === "number" ? <Input type="number" value={instance.values[field.id] ?? ""}
              onChange={(event) => write({ ...instance, values: { ...instance.values, [field.id]: event.target.value } })} />
              : <textarea className="min-h-16 rounded-md border bg-background px-3 py-2" value={instance.values[field.id] ?? ""}
                onChange={(event) => write({ ...instance, values: { ...instance.values, [field.id]: event.target.value } })} />}
          </label>)}
        </div>
      </div>
    }

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
            <div className="flex items-center gap-1">
              {!isCollapsed && (
                <button
                  onClick={() => setTemplatePickerFor(el.id)}
                  className="flex items-center gap-1 text-xs text-amber-700/80 dark:text-amber-500/80 hover:text-amber-700 dark:hover:text-amber-500 transition-colors px-2 py-0.5 rounded hover:bg-amber-700/10"
                  title="Load template"
                >
                  <Library className="h-3 w-3" /> Template
                </button>
              )}
              <Button size="sm" variant="ghost" onClick={() => void handleDeleteElement(sectionId, el.id)}>Delete block</Button>
            </div>
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
      const parsed = mode === "preview" ? parseRandomTable(el.content) : null
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
            <div className="flex items-center gap-1">
              {!isCollapsed && <>
                {mode === "preview" && parsed && parsed.rows.length > 0 && (
                  <button
                    onClick={() => rollDiceTable(el.id, el.content)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded hover:bg-background/60"
                    title={`Roll ${parsed.die}`}
                  >
                    <Dice6 className="h-3 w-3" /> Roll
                  </button>
                )}
                <button onClick={() => toggleTableMode(el.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded hover:bg-background/60">
                  {mode === "edit" ? <><Table className="h-3 w-3" /> Preview</> : <><Pencil className="h-3 w-3" /> Edit</>}
                </button>
              </>}
              <Button size="sm" variant="ghost" onClick={() => void handleDeleteElement(sectionId, el.id)}>Delete block</Button>
            </div>
          </div>
          {!isCollapsed && (
            mode === "preview" && parsed ? (
              <div className="overflow-x-auto">
                {diceRoll[el.id] && (
                  <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200/50 dark:border-amber-900/30 text-sm">
                    <span className="font-mono text-xs text-amber-700 dark:text-amber-400 mr-2">{parsed.die === "weighted" ? "Selected row" : "Rolled"} {diceRoll[el.id].roll}</span>
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
                    {parsed.rows.map(({ label, result, weight }: RandomTableRow, ri) => {
                      const isRolled = diceRoll[el.id]?.roll === ri + 1
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
                          <td className="px-3 py-2 font-mono text-muted-foreground text-sm">{parsed.die === "weighted" ? weight : label}</td>
                          <td className="px-3 py-2">{result}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div>
                <StableContentEditable
                  id={`el-${el.id}`}
                  value={el.content}
                  onValueChange={(next) => handleContentChange(el.id, next, false)}
                  className="font-mono text-sm outline-none px-3 py-2 whitespace-pre-wrap min-h-[5rem] text-xs"
                />
                <p className="px-3 pb-2 text-xs text-muted-foreground">For custom odds, use a <code>Weight | Result</code> header and one <code>number | outcome</code> per line.</p>
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
            <div className="flex items-center gap-1">
              {!isCollapsed && <button onClick={() => toggleTableMode(el.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded hover:bg-background/60">
                {mode === "edit" ? <><Table className="h-3 w-3" /> Preview</> : <><Pencil className="h-3 w-3" /> Edit</>}
              </button>}
              <Button size="sm" variant="ghost" onClick={() => void handleDeleteElement(sectionId, el.id)}>Delete block</Button>
            </div>
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
        case "ttrpg_stat":
        case "ttrpg_keyed_location":
          return 240
        case "ttrpg_clock":
        case "ttrpg_read_aloud":
          return 180
        case "ttrpg_cross_reference":
          return 100
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
    if (type === "ttrpg_stat") {
      setIsSchemaManagerOpen(true)
      return
    }
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
            id={`head-${b.section.id}`}
            value={b.section.scene_heading ?? ""}
            onValueChange={(next) => handleContentChange(b.section.id, next, true)}
            className="text-3xl font-black uppercase tracking-wider outline-none mb-8 pb-3 border-b-2 border-foreground empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50"
            data-placeholder="SECTION TITLE"
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
    <>
    <ProjectShell
      projectId={projectData.id}
      title={projectData.title}
      category={projectData.category}
      current="editor"
      sidebar={
      /* Sections sidebar — shared rail (sections + h2 subheadings) + comments. */
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
      }
      toolbar={
        <EditorToolbar
          title={projectData.title}
          projectId={projectData.id}
          category={projectData.category}
          saveStatus={saveStatus}
          leading={<Button size="sm" variant="outline" onClick={() => setIsSchemaManagerOpen(true)}>
            <Shield className="mr-1.5 h-3.5 w-3.5" />
            Stat templates{statSchemas.length ? ` (${statSchemas.length})` : ""}
          </Button>}
          onToggleAI={() => setIsAIChatOpen(o => !o)}
          isAIOpen={isAIChatOpen}
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
                run: () => exportProjectToText({ ...projectData, scenes: sections, ttrpg_stat_schemas: statSchemas }),
              }),
            },
            {
              label: "Export as Markdown (.md)",
              onClick: () => void runExport({
                extension: "md",
                projectTitle: projectData.title,
                run: () => exportProjectToMarkdown({ ...projectData, scenes: sections, ttrpg_stat_schemas: statSchemas }),
              }),
            },
          ]}
        />
      }
    >
        <EditorWorkspace
          surfaceRef={writeSurfaceRef}
          subscribeCarets={subscribeCarets}
          isAIChatOpen={isAIChatOpen}
          onCloseAIChat={() => setIsAIChatOpen(false)}
          category={projectData.category}
          projectId={projectData.id}
          currentUnitId={activeSectionId ?? sections[0]?.id}
          onToolComplete={() => void refreshDocument().catch(() => {})}
          onSurfaceFocus={(e) => {
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
        </EditorWorkspace>
    </ProjectShell>
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
      <StatSchemaManager
        open={isSchemaManagerOpen}
        onOpenChange={setIsSchemaManagerOpen}
        schemas={statSchemas}
        onSave={saveStatSchema}
        onInsert={insertStatInstance}
      />
    </>
  )
}
