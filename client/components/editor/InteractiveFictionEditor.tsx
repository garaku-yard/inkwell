"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { Plus, Link2, GitBranch, PenLine, AlertCircle, CheckCircle2, Play, RotateCcw, ChevronLeft, AlignLeft, Split, Braces, StickyNote } from "lucide-react"
import { PassageGraph } from "./PassageGraph"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/AuthContext"
import { useTheme } from "@/lib/ThemeContext"
import { useToast } from "@/hooks/use-toast"
import { AIChatPanel } from "./AIChatPanel"
import { ProjectShell } from "./shared/ProjectShell"
import { PresencePips } from "./shared/PresencePips"
import { EditorToolbar } from "./shared/EditorToolbar"
import { useElementAutosave } from "./shared/useElementAutosave"
import { dispatchKey } from "@/lib/editor/keymap"
import { createIFKeymap } from "./if/keymap"
import { PassageAutocomplete } from "./if/PassageAutocomplete"
import { deleteScriptElement } from "@/services/editor"
import { exportProjectToText } from "@/lib/export/text-export"
import { exportProjectToTwee } from "@/lib/export/if-twee"
import { useExportToast } from "@/lib/export/use-export-toast"
import { parseTweeToIF } from "@/lib/import/twee"
import { importIntoProject } from "@/lib/import/import-into-project"
import { StableContentEditable } from "./shared/StableContentEditable"
import {
  EditorSidebar,
  type EditorSidebarItem,
  type EditorSidebarCommentTarget,
} from "./shared/EditorSidebar"
import { useEditorComments } from "./shared/useEditorComments"
import { PagedSheets } from "./shared/PagedSheets"
import { RemoteCarets } from "./shared/RemoteCarets"
import { useEditorRealtime } from "./shared/useEditorRealtime"
import { type RailEntry } from "./shared/EditorToolRail"
import { paginate } from "@/lib/editor/paginate"
import {
  createScene,
  createSceneElement,
  type ProjectElement,
  type FullProject,
} from "@/services/project"

// Element types:
// body        — prose the player reads
// choice      — [[Choice text -> PassageName]] link(s)
// conditional — {if $flag: [[Yes -> A]] else: [[No -> B]]}
// set         — variable assignment: {set $gold to 10}
// note        — author note, never shown in-game
type IFElementType = "body" | "choice" | "conditional" | "set" | "note"

type IFScene = NonNullable<FullProject["scenes"]>[number]

/** One renderable unit on the active passage's A4 sheet — its header
 *  (title + link hint), the empty-passage placeholder, or a single
 *  element. IF paginates within the active passage only; passages never
 *  share a sheet (one passage is edited at a time). */
type IFBlock =
  | { key: string; kind: "passageHead"; passage: IFScene }
  | { key: string; kind: "emptyPassage"; passage: IFScene }
  | { key: string; kind: "element"; passage: IFScene; el: ProjectElement }

/** IF's element vocabulary for the right-edge tool rail. The rail
 *  appends to the active passage (IF edits one passage at a time). */
const IF_RAIL_ITEMS: RailEntry[] = [
  { type: "body", label: "Body", icon: AlignLeft },
  { type: "choice", label: "Choice link", icon: Link2 },
  { type: "conditional", label: "Conditional", icon: Split },
  { type: "set", label: "Set variable", icon: Braces },
  { type: "note", label: "Author note", icon: StickyNote },
]

// Parse all [[text -> target]] or [[target]] links from a string.
// Tolerant of null/undefined content because elements loaded from the
// database (or freshly created via handleAddElement) can have an
// empty content field that arrives as undefined through the storage
// abstraction in some code paths.
function parseLinks(text: string | null | undefined): string[] {
  if (!text) return []
  const re = /\[\[(?:[^\]]*?->\s*)?([^\]|>]+?)(?:\s*\|[^\]]*)?\]\]/g
  const targets: string[] = []
  let m
  while ((m = re.exec(text)) !== null) {
    targets.push(m[1].trim())
  }
  return targets
}

// Tokenize a body string into alternating plain-text + link segments
// for the play-mode renderer. Mirrors parseLinks but keeps the
// surrounding text and the visible label so the player can render
// inline clickable spans rather than just listing targets.
type BodySegment =
  | { kind: "text"; value: string }
  | { kind: "link"; label: string; target: string }
function tokenizeBody(text: string): BodySegment[] {
  const re = /\[\[(?:([^\]]*?)\s*->\s*)?([^\]|>]+?)(?:\s*\|[^\]]*)?\]\]/g
  const out: BodySegment[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: "text", value: text.slice(last, m.index) })
    const target = m[2].trim()
    const label = (m[1]?.trim() || target)
    out.push({ kind: "link", label, target })
    last = re.lastIndex
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) })
  return out
}

function wordCount(text: string | null | undefined) {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

interface InteractiveFictionEditorProps {
  projectData: FullProject
}

export function InteractiveFictionEditor({ projectData }: InteractiveFictionEditorProps) {
  const { user } = useAuth()
  const [passages, setPassages] = useState(() => projectData.scenes ?? [])
  const [activePassageId, setActivePassageId] = useState<string | null>(
    () => (projectData.scenes ?? [])[0]?.id ?? null
  )
  const [view, setView] = useState<"write" | "graph" | "play">("write")
  // Play-mode state: cursor passage + back-stack of previously visited
  // passage ids. Resets when the user re-enters play mode from the
  // toolbar so each playthrough starts from the start passage.
  const [playCursor, setPlayCursor] = useState<string | null>(null)
  const [playHistory, setPlayHistory] = useState<string[]>([])
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
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
  // Last-focused element in the active passage — what a new comment attaches to.
  const [focusedElementId, setFocusedElementId] = useState<string | null>(null)

  const activePassage = passages.find(p => p.id === activePassageId) ?? null

  // Opening a project with no passages leaves nothing selected. If passages
  // then appear — imported, or written by an agent through the MCP bridge —
  // land on the first one instead of leaving the writer on an empty pane with
  // a full sidebar.
  useEffect(() => {
    if (!activePassageId && passages.length > 0) setActivePassageId(passages[0].id)
  }, [activePassageId, passages])
  const activeElements = activePassage?.elements ?? []

  // Live collaboration via the shared hook (no-op on the desktop build): live
  // edit sync, remote carets, focus reporting, and soft-lock markers. Passing
  // focusId makes the hook report the active passage and key peersByElement (live
  // + durable advisory locks) by passage — the pips in the rail and the banner.
  const writeSurfaceRef = useRef<HTMLDivElement | null>(null)
  const { broadcastEdit, subscribeCarets, peersByElement: peersByPassage } = useEditorRealtime({
    projectId: projectData.id,
    userId: user?.id,
    scenes: passages,
    setScenes: setPassages,
    surfaceRef: writeSurfaceRef,
    focusId: activePassageId,
    focusLabel: activePassage?.scene_heading || "Untitled",
  })

  const activeCommentTarget = useMemo<EditorSidebarCommentTarget | null>(() => {
    if (focusedElementId) {
      for (const p of passages) {
        const el = (p.elements ?? []).find((e) => e.id === focusedElementId)
        if (el) return { item: el, isScene: false }
      }
    }
    // Fall back to the active passage so the Comments tab is never a dead end.
    const passage = passages.find((p) => p.id === activePassageId) ?? passages[0]
    return passage ? { item: passage, isScene: true } : null
  }, [focusedElementId, passages, activePassageId])

  const sidebarItems = useMemo<EditorSidebarItem[]>(
    () =>
      passages.map((passage, i) => {
        const wc = (passage.elements ?? []).reduce((a, el) => a + wordCount(el.content), 0)
        const outLinks = (passage.elements ?? []).reduce((a, el) => a + parseLinks(el.content).length, 0)
        const bits: string[] = []
        if (i === 0) bits.push("Start")
        if (wc > 0) bits.push(`${wc}w`)
        if (outLinks > 0) bits.push(`${outLinks} link${outLinks !== 1 ? "s" : ""}`)
        const here = peersByPassage.get(passage.id)
        return {
          id: passage.id,
          title: passage.scene_heading || "Untitled",
          index: i + 1,
          meta: bits.length ? bits.join(" · ") : undefined,
          searchText: `${passage.scene_heading} ${(passage.elements ?? []).map((e) => e.content).join(" ")}`,
          commentTargetIds: [passage.id, ...(passage.elements ?? []).map((e) => e.id)],
          adornment: here && here.length ? <PresencePips peers={here} /> : undefined,
        }
      }),
    [passages, peersByPassage],
  )

  // Build a set of all passage names for link validation
  const passageNames = new Set(passages.map(p => p.scene_heading.toLowerCase().trim()))

  const totalLinks = passages.reduce((acc, p) =>
    acc + (p.elements ?? []).reduce((a, el) => a + parseLinks(el.content).length, 0), 0)

  const handleContentChange = useCallback((id: string, content: string, isScene: boolean) => {
    if (isScene) {
      setPassages(prev => prev.map(p => p.id === id ? { ...p, scene_heading: content } : p))
    } else {
      setPassages(prev => prev.map(p => ({
        ...p,
        elements: (p.elements ?? []).map(el => el.id === id ? { ...el, content } : el),
      })))
    }
    scheduleSave(id, content, isScene)
    broadcastEdit(id, content, isScene)
  }, [scheduleSave, broadcastEdit])

  // A passage created with no elements would render an empty-state placeholder
  // whose keystrokes were never persisted (a real body element was only created
  // on Enter) — typed text looked "Saved" but vanished on reload. seedBody
  // creates a real, saveable body element so the body always routes through the
  // normal save path. Guarded per-passage so rapid input / the effect below
  // can't create duplicates.
  const seedingRef = useRef<string | null>(null)
  const seedBody = useCallback(async (passageId: string, content: string) => {
    if (!user?.id || seedingRef.current === passageId) return
    seedingRef.current = passageId
    try {
      const el = await createSceneElement(projectData.id, passageId, user.id, {
        element_type: "body",
        content,
        order_index: 0,
      })
      setPassages(prev => prev.map(p =>
        p.id === passageId && (p.elements ?? []).length === 0
          ? { ...p, elements: [el] }
          : p,
      ))
      // When seeded from a keystroke, move focus into the real element so the
      // writer keeps typing without interruption.
      if (content) {
        setTimeout(() => {
          const div = document.getElementById(`el-${el.id}`)
          if (!div) return
          div.focus()
          const range = document.createRange()
          range.selectNodeContents(div)
          range.collapse(false)
          const sel = window.getSelection()
          sel?.removeAllRanges()
          sel?.addRange(range)
        }, 30)
      }
    } catch {
      /* leave the placeholder in place; the next keystroke retries */
    } finally {
      if (seedingRef.current === passageId) seedingRef.current = null
    }
  }, [user?.id, projectData.id])

  // Ensure the active passage has a body element to type into, created up front
  // so there's no unsaved-keystroke window when the writer starts.
  useEffect(() => {
    if (!activePassageId) return
    const passage = passages.find(p => p.id === activePassageId)
    if (passage && (passage.elements ?? []).length === 0) void seedBody(activePassageId, "")
  }, [activePassageId, passages, seedBody])

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

  // Import a Twee 3 file as new passages appended to this project.
  const handleImportTwee = async (text: string, fileName: string) => {
    if (!user?.id) return
    const title = fileName.replace(/\.[^/.]+$/, "")
    const parsed = parseTweeToIF(text, title)
    try {
      const created = await importIntoProject(projectData.id, user.id, parsed, passages.length)
      setPassages((prev) => [...prev, ...created])
      if (created[0]) {
        setActivePassageId(created[0].id)
        setView("write")
      }
      const word = created.length === 1 ? "passage" : "passages"
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
      if (!div) return
      div.focus()
      if (type !== "body" && type !== "note") {
        const range = document.createRange()
        range.selectNodeContents(div)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
      }
    }, 50)
  }

  const handleDeleteElement = useCallback(
    async (passageId: string, elementId: string) => {
      const passage = passages.find((p) => p.id === passageId)
      if (!passage) return
      const ids = (passage.elements ?? []).map((el) => el.id)
      const idx = ids.indexOf(elementId)
      const prevId = idx > 0 ? ids[idx - 1] : null

      setPassages((prev) =>
        prev.map((p) =>
          p.id !== passageId
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
    [passages, toast],
  )

  const keyMap = useMemo(
    () =>
      createIFKeymap({
        activePassage,
        insertElementAtEnd: (type) => void handleAddElement(type),
        deleteEmptyElement: (passageId, elementId) =>
          void handleDeleteElement(passageId, elementId),
      }),
    // handleAddElement intentionally omitted to avoid re-creating the keymap each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePassage, handleDeleteElement],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, el: ProjectElement) => {
      if (!activePassageId) return
      dispatchKey(e, keyMap, {
        passageId: activePassageId,
        elementId: el.id,
        elementType: el.element_type as IFElementType,
      })
    },
    [keyMap, activePassageId],
  )

  // Autocomplete state — non-null while the caret sits inside an
  // unclosed [[…]] token. Tracks which element triggered the popup
  // and the query text typed since the [[.
  const [autocomplete, setAutocomplete] = useState<{
    elementId: string
    query: string
    bracketStart: number
    position: { top: number; left: number }
  } | null>(null)

  // Computes the autocomplete context for the current caret. Returns
  // null when the caret isn't inside an open `[[` token (no
  // dropdown). The check walks the element's plain text up to the
  // caret offset, finds the last `[[`, and refuses to trigger if a
  // `]]` already closed it.
  const computeAutocompleteContext = useCallback(
    (elementId: string): typeof autocomplete => {
      if (typeof window === "undefined") return null
      const el = document.getElementById(`el-${elementId}`)
      if (!el) return null
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null
      const range = sel.getRangeAt(0)
      // Plain-text contentEditable: the caret offset against the
      // element's textContent is the offset within the single text
      // node. Bail out gracefully if the structure ever grows nested.
      if (range.startContainer !== el && range.startContainer.parentElement !== el) {
        return null
      }
      const text = el.textContent ?? ""
      // Walk a Range from the element start to the caret to get the
      // plain-text offset, regardless of which child node the caret
      // sits in.
      const probe = document.createRange()
      probe.setStart(el, 0)
      probe.setEnd(range.startContainer, range.startOffset)
      const beforeCaret = probe.toString()
      const lastOpen = beforeCaret.lastIndexOf("[[")
      if (lastOpen === -1) return null
      // Refuse if a `]]` already closes the token between [[ and the
      // caret — user has finished a link.
      if (beforeCaret.slice(lastOpen).includes("]]")) return null
      // Refuse if the user typed a newline inside the token; links
      // don't span lines.
      const query = beforeCaret.slice(lastOpen + 2)
      if (query.includes("\n")) return null
      // Position below the caret using the range's bounding client
      // rect. A zero-width range still has a valid rect on most
      // browsers; if it doesn't (rare), fall back to the element's
      // top-left.
      const rangeRect = range.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const top =
        (rangeRect.bottom > 0 ? rangeRect.bottom : elRect.bottom) + 4
      const left = rangeRect.left > 0 ? rangeRect.left : elRect.left
      void text
      return {
        elementId,
        query,
        bracketStart: lastOpen,
        position: { top, left },
      }
    },
    [],
  )

  const insertLinkAt = useCallback((elementId: string, name: string) => {
    const el = document.getElementById(`el-${elementId}`)
    if (!el) return
    const text = el.textContent ?? ""
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const probe = document.createRange()
    probe.setStart(el, 0)
    probe.setEnd(range.startContainer, range.startOffset)
    const caretOffset = probe.toString().length
    const lastOpen = text.lastIndexOf("[[", caretOffset)
    if (lastOpen === -1) return

    const before = text.slice(0, lastOpen)
    const after = text.slice(caretOffset)
    const next = `${before}[[${name}]]${after}`
    el.textContent = next

    // Place the caret right after the inserted ]] so the user can
    // keep typing.
    const newOffset = lastOpen + 2 + name.length + 2
    const textNode = el.firstChild
    if (textNode) {
      const newRange = document.createRange()
      newRange.setStart(textNode, Math.min(newOffset, textNode.textContent?.length ?? 0))
      newRange.collapse(true)
      sel.removeAllRanges()
      sel.addRange(newRange)
    }

    // Trigger React's onInput by firing an input event so the
    // controlled handleContentChange picks up the new content for
    // autosave + state.
    el.dispatchEvent(new Event("input", { bubbles: true }))
    setAutocomplete(null)
  }, [])

  const handleAutocompleteSelect = useCallback(
    (name: string) => {
      if (!autocomplete) return
      insertLinkAt(autocomplete.elementId, name)
    },
    [autocomplete, insertLinkAt],
  )

  const handleAutocompleteCreate = useCallback(
    async (name: string) => {
      if (!autocomplete) return
      const targetElementId = autocomplete.elementId
      // Insert the link immediately (writes against the current
      // caret); creating the passage happens as a background side
      // effect so the user isn't waiting on the network round-trip.
      insertLinkAt(targetElementId, name)
      try {
        // Don't switch focus to the new passage — the user is mid-link
        // in the current one. handleAddPassage normally activates the
        // new passage; reuse the underlying createScene call directly.
        if (user?.id) {
          await createScene(projectData.id, user.id, {
            scene_heading: name,
            content: "",
            order_index: passages.length,
          }).then((p) => {
            setPassages((prev) => [...prev, { ...p, elements: [] }])
          })
        }
      } catch (err) {
        console.error("Failed to create passage:", err)
      }
    },
    [autocomplete, insertLinkAt, projectData.id, passages.length, user?.id],
  )

  const navigateToPassage = (name: string) => {
    const target = passages.find(p => p.scene_heading.toLowerCase().trim() === name.toLowerCase().trim())
    if (target) setActivePassageId(target.id)
  }

  // Pack the *active passage* onto A4 sheets — no cross-passage pagination,
  // since IF edits one passage at a time. A long passage still flows onto
  // additional sheets within itself.
  const writeSheets = useMemo<IFBlock[][]>(() => {
    if (!activePassage) return []
    const blocks: IFBlock[] = [
      { key: `head-${activePassage.id}`, kind: "passageHead", passage: activePassage },
    ]
    const els = activePassage.elements ?? []
    if (els.length === 0) {
      blocks.push({ key: `empty-${activePassage.id}`, kind: "emptyPassage", passage: activePassage })
    } else {
      els.forEach((el) => blocks.push({ key: el.id, kind: "element", passage: activePassage, el }))
    }
    const estimate = (b: IFBlock): number => {
      if (b.kind === "passageHead") return 150
      if (b.kind === "emptyPassage") return 40
      switch (b.el.element_type) {
        case "choice":
          return 80
        case "conditional":
          return 88
        case "set":
          return 64
        case "note":
          return 64
        default: {
          const len = (b.el.content ?? "").length
          return 16 + Math.max(1, Math.ceil(len / 80)) * 28
        }
      }
    }
    return paginate(blocks, estimate, { maxHeight: 940 })
  }, [activePassage])

  // Rail click: append the chosen element type to the active passage.
  const handleRailSelect = (type: string) => {
    void handleAddElement(type as IFElementType)
  }

  /** Render one passage element with its per-type IF styling + link badges. */
  const renderIFElement = (el: ProjectElement) => {
    if (el.element_type === "body") {
      return (
        <StableContentEditable
          id={`el-${el.id}`}
          value={el.content}
          onValueChange={(next) => {
            handleContentChange(el.id, next, false)
            setAutocomplete(computeAutocompleteContext(el.id))
          }}
          onKeyDown={(e) => handleKeyDown(e, el)}
          className="outline-none text-base leading-relaxed min-h-[1.5rem] empty:before:content-['Passage\00a0text…'] empty:before:text-muted-foreground/50"
        />
      )
    }

    if (el.element_type === "choice") {
      const targets = parseLinks(el.content)
      return (
        <div>
          <StableContentEditable
            id={`el-${el.id}`}
            value={el.content}
            onValueChange={(next) => {
              handleContentChange(el.id, next, false)
              setAutocomplete(computeAutocompleteContext(el.id))
            }}
            onKeyDown={(e) => handleKeyDown(e, el)}
            className="outline-none font-mono text-sm text-primary bg-primary/5 border border-primary/20 rounded-md px-3 py-1.5 min-h-[2rem] leading-relaxed"
          />
          {targets.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5 pl-1">
              {targets.map((target, i) => {
                const exists = passageNames.has(target.toLowerCase().trim())
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (exists) navigateToPassage(target)
                      else void handleAddPassage(target)
                    }}
                    className={cn(
                      "flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer",
                      exists
                        ? "border-green-500/30 text-green-700 dark:text-green-400 bg-green-500/5 hover:bg-green-500/10"
                        : "border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/10 font-semibold underline underline-offset-2"
                    )}
                    aria-label={exists ? `Go to "${target}"` : `Missing passage "${target}" — click to create`}
                    title={
                      exists
                        ? `Go to "${target}"`
                        : `Click to create passage "${target}"`
                    }
                  >
                    {exists
                      ? <CheckCircle2 className="h-2.5 w-2.5" />
                      : <AlertCircle className="h-2.5 w-2.5" />}
                    {!exists && <span className="sr-only">Missing: </span>}
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
        <div>
          <StableContentEditable
            id={`el-${el.id}`}
            value={el.content}
            onValueChange={(next) => handleContentChange(el.id, next, false)}
            onKeyDown={(e) => handleKeyDown(e, el)}
            className="outline-none font-mono text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-md px-3 py-2 min-h-[2rem] leading-relaxed"
          />
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
                        : "border-destructive/40 text-destructive bg-destructive/5 cursor-default font-semibold underline underline-offset-2"
                    )}
                    aria-label={exists ? `Go to "${target}"` : `Missing passage "${target}"`}
                  >
                    {exists ? <CheckCircle2 className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}
                    {!exists && <span className="sr-only">Missing: </span>}
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
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-0.5 pl-1 select-none">Variable</div>
          <StableContentEditable
            id={`el-${el.id}`}
            value={el.content}
            onValueChange={(next) => handleContentChange(el.id, next, false)}
            onKeyDown={(e) => handleKeyDown(e, el)}
            className="outline-none font-mono text-xs text-violet-700 dark:text-violet-400 bg-violet-500/5 border border-violet-500/20 rounded-md px-3 py-1.5 min-h-[1.5rem] leading-relaxed"
          />
        </div>
      )
    }

    if (el.element_type === "note") {
      return (
        <div className="opacity-60 hover:opacity-100 transition-opacity">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-0.5 pl-1 select-none">Author note</div>
          <StableContentEditable
            id={`el-${el.id}`}
            value={el.content}
            onValueChange={(next) => handleContentChange(el.id, next, false)}
            className="outline-none text-sm italic text-muted-foreground bg-muted/40 border border-border/50 rounded-md px-3 py-1.5 min-h-[1.5rem] leading-relaxed empty:before:content-['Note\00a0(not\00a0shown\00a0in\00a0game)…'] empty:before:text-muted-foreground/50"
          />
        </div>
      )
    }

    return null
  }

  /** Render any write-view block — passage header, empty placeholder, or element. */
  const renderBlock = (b: IFBlock) => {
    if (b.kind === "passageHead") {
      const isStart = passages.findIndex((p) => p.id === b.passage.id) === 0
      const here = peersByPassage.get(b.passage.id)
      return (
        <div>
          {here && here.length > 0 && (
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground">
              <PresencePips peers={here} />
              <span>
                {here.map((p) => p.name).join(", ")} {here.length === 1 ? "is" : "are"} also editing
              </span>
            </div>
          )}
          <div className="mb-1">
            {isStart && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary mb-2 block">
                Start passage
              </span>
            )}
            <StableContentEditable
              id={`head-${b.passage.id}`}
              value={b.passage.scene_heading ?? ""}
              onValueChange={(next) => handleContentChange(b.passage.id, next, true)}
              className="text-xl font-bold outline-none pb-2 border-b empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50"
              data-placeholder="Passage name"
            />
          </div>
          <p className="text-xs text-muted-foreground/50 mb-8 mt-1.5">
            Link with{" "}
            <code className="font-mono bg-muted px-1 rounded text-[11px]">[[Choice text → PassageName]]</code>
            {" "}or{" "}
            <code className="font-mono bg-muted px-1 rounded text-[11px]">[[PassageName]]</code>
          </p>
        </div>
      )
    }
    if (b.kind === "emptyPassage") {
      return (
        <StableContentEditable
          value=""
          // First keystroke before the auto-seed effect lands creates the body
          // element with the typed text, so nothing is ever dropped.
          onValueChange={(next) => { if (next) void seedBody(b.passage.id, next) }}
          className="outline-none text-base leading-relaxed min-h-[1.5rem] empty:before:content-['Write\00a0passage\00a0text…'] empty:before:text-muted-foreground/50"
          onKeyDown={async (e) => {
            if (e.key === "Enter") { e.preventDefault(); await handleAddElement("body") }
          }}
        />
      )
    }
    return <div className="mb-2">{renderIFElement(b.el)}</div>
  }

  return (
    <>
    <ProjectShell
      projectId={projectData.id}
      title={projectData.title}
      category={projectData.category}
      current="editor"
      sidebar={
      /* Passage list sidebar — shared rail (searchable) + comments. */
      <EditorSidebar
        headerIcon={GitBranch}
        headerLabel="Passages"
        stats={[
          { icon: GitBranch, label: `${passages.length} ${passages.length === 1 ? "passage" : "passages"}` },
          { icon: Link2, label: `${totalLinks} ${totalLinks === 1 ? "link" : "links"}` },
        ]}
        items={sidebarItems}
        activeItemId={activePassageId}
        onItemClick={(id) => {
          setActivePassageId(id)
          setView("write")
        }}
        addLabel="Add passage"
        onAdd={() => handleAddPassage()}
        emptyLabel="No passages yet."
        searchable
        searchPlaceholder="Search names + body…"
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
          onToggleAI={() => setIsAIChatOpen(o => !o)}
          isAIOpen={isAIChatOpen}
          importItems={[
            {
              label: "Twee 3 (.twee)",
              accept: ".twee,.tw,.txt",
              onFile: (text, fileName) => void handleImportTwee(text, fileName),
            },
          ]}
          exportItems={[
            {
              label: "Export as Plain Text (.txt)",
              onClick: () => void runExport({
                extension: "txt",
                projectTitle: projectData.title,
                run: () => exportProjectToText({ ...projectData, scenes: passages }),
              }),
            },
            {
              label: "Export as Twee 3 (.twee)",
              onClick: () => void runExport({
                extension: "twee",
                projectTitle: projectData.title,
                run: () => exportProjectToTwee({ ...projectData, scenes: passages }),
              }),
            },
          ]}
          leading={
            <div role="group" aria-label="View mode" className="flex items-center rounded-md border overflow-hidden text-xs">
              <button
                onClick={() => setView("write")}
                aria-pressed={view === "write"}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 transition-colors",
                  view === "write" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                )}
              >
                <PenLine className="h-3 w-3" /> Write
              </button>
              <button
                onClick={() => setView("graph")}
                aria-pressed={view === "graph"}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 transition-colors",
                  view === "graph" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                )}
              >
                <GitBranch className="h-3 w-3" /> Graph
              </button>
              <button
                onClick={() => {
                  // Reset to the first passage so each playthrough starts
                  // from the canonical entry point regardless of which
                  // passage was being edited.
                  setPlayCursor(passages[0]?.id ?? null)
                  setPlayHistory([])
                  setView("play")
                }}
                aria-pressed={view === "play"}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 transition-colors",
                  view === "play" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                )}
              >
                <Play className="h-3 w-3" /> Play
              </button>
            </div>
          }
        />
      }
    >
        <div className="flex h-full overflow-hidden">
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

        {/* Play view — runtime preview. Renders the cursor passage
            with [[links]] turned into clickable choices and a
            back-stack for stepping out of dead ends. */}
        {view === "play" && (() => {
          const cursor = passages.find(p => p.id === playCursor) ?? null
          const navigateTo = (target: string) => {
            const next = passages.find(
              p => p.scene_heading.toLowerCase().trim() === target.toLowerCase().trim(),
            )
            if (!next || !playCursor) return
            setPlayHistory(prev => [...prev, playCursor])
            setPlayCursor(next.id)
          }
          const goBack = () => {
            setPlayHistory(prev => {
              if (prev.length === 0) return prev
              const previous = prev[prev.length - 1]
              setPlayCursor(previous)
              return prev.slice(0, -1)
            })
          }
          const restart = () => {
            setPlayCursor(passages[0]?.id ?? null)
            setPlayHistory([])
          }
          return (
            <div className="flex-1 overflow-y-auto inkwell-quiet-scroll bg-secondary dark:bg-background">
              <div className="max-w-[660px] mx-auto px-8 py-10">
                {/* Player toolbar */}
                <div className="flex items-center justify-between mb-6 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={goBack}
                      disabled={playHistory.length === 0}
                    >
                      <ChevronLeft className="h-3 w-3" /> Back
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={restart}>
                      <RotateCcw className="h-3 w-3" /> Restart
                    </Button>
                  </div>
                  <span>
                    {playHistory.length === 0 ? "Start" : `Step ${playHistory.length + 1}`}
                  </span>
                </div>

                {!cursor ? (
                  <div className="text-center py-16">
                    <p className="text-muted-foreground text-sm mb-4">
                      No passages to play yet.
                    </p>
                    <Button size="sm" onClick={() => { setView("write"); handleAddPassage("Start") }}>
                      Create the first passage
                    </Button>
                  </div>
                ) : (
                  <article className="prose prose-sm dark:prose-invert max-w-none">
                    <h2 className="text-xl font-semibold mb-6">
                      {cursor.scene_heading || "Untitled"}
                    </h2>
                    {(cursor.elements ?? []).map((el) => {
                      // Skip author-only elements at runtime.
                      if (el.element_type === "note" || el.element_type === "set") return null
                      // `conditional` elements aren't fully evaluated yet —
                      // we render them inert in muted styling so authors
                      // still see them flagged in the preview.
                      if (el.element_type === "conditional") {
                        return (
                          <div key={el.id} className="my-3 px-3 py-2 rounded border border-dashed text-xs text-muted-foreground">
                            <span className="font-mono">{el.content}</span>
                            <p className="mt-1 not-italic">Conditionals aren&apos;t evaluated in preview yet — both branches are reachable from the writer&apos;s view.</p>
                          </div>
                        )
                      }
                      // body and choice both tokenize identically; the
                      // difference is presentation. Choice elements
                      // bunch into a button stack at the end of the
                      // passage; body elements get inline links.
                      const segments = tokenizeBody(el.content)
                      if (el.element_type === "choice") {
                        return (
                          <div key={el.id} className="my-2">
                            {segments.map((seg, i) =>
                              seg.kind === "link" ? (
                                <Button
                                  key={i}
                                  variant="outline"
                                  className="block w-full justify-start text-left mb-2 h-auto whitespace-normal py-2"
                                  disabled={!passages.find(p => p.scene_heading.toLowerCase().trim() === seg.target.toLowerCase().trim())}
                                  onClick={() => navigateTo(seg.target)}
                                >
                                  → {seg.label}
                                </Button>
                              ) : (
                                seg.value.trim() && (
                                  <span key={i} className="text-sm text-muted-foreground block mb-2">
                                    {seg.value}
                                  </span>
                                )
                              ),
                            )}
                          </div>
                        )
                      }
                      // body — inline rendering with clickable links.
                      return (
                        <p key={el.id} className="my-3 leading-relaxed">
                          {segments.map((seg, i) =>
                            seg.kind === "link" ? (
                              <button
                                key={i}
                                className="underline text-primary hover:text-primary/80 disabled:text-muted-foreground/50 disabled:no-underline"
                                disabled={!passages.find(p => p.scene_heading.toLowerCase().trim() === seg.target.toLowerCase().trim())}
                                onClick={() => navigateTo(seg.target)}
                              >
                                {seg.label}
                              </button>
                            ) : (
                              <span key={i}>{seg.value}</span>
                            ),
                          )}
                        </p>
                      )
                    })}
                  </article>
                )}
              </div>
            </div>
          )
        })()}

        {/* Write view — the active passage on an A4 sheet, element tool
            rail riding the margin. */}
        {view === "write" && (
          <div
            ref={writeSurfaceRef}
            className="relative flex flex-1 overflow-hidden"
            onFocus={(e) => {
              const id = (e.target as HTMLElement)?.id
              if (id?.startsWith("el-")) setFocusedElementId(id.slice(3))
            }}
          >
            <PagedSheets
              pages={writeSheets}
              renderBlock={renderBlock}
              fontFamily={editorFontStack("if")}
              railItems={IF_RAIL_ITEMS}
              onRailSelect={handleRailSelect}
              railStorageKey="editor.rail.if"
              pageIdPrefix="if-page"
              isEmpty={!activePassage}
              emptyState={
                <div className="flex flex-col items-center justify-center gap-4 py-32 text-center">
                  <p className="text-muted-foreground text-sm">No passages yet.</p>
                  <Button size="sm" onClick={() => handleAddPassage("Start")}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Create Start passage
                  </Button>
                </div>
              }
            />
            <RemoteCarets containerRef={writeSurfaceRef} subscribeCarets={subscribeCarets} />
          </div>
        )}
        <AIChatPanel isOpen={isAIChatOpen} onClose={() => setIsAIChatOpen(false)} category={projectData.category} projectId={projectData.id} />
        </div>
    </ProjectShell>
      {autocomplete && (
        <PassageAutocomplete
          passages={passages.map((p) => p.scene_heading).filter(Boolean)}
          query={autocomplete.query}
          position={autocomplete.position}
          onSelect={handleAutocompleteSelect}
          onCreate={handleAutocompleteCreate}
          onDismiss={() => setAutocomplete(null)}
        />
      )}
    </>
  )
}
