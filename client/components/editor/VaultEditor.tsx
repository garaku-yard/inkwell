"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Hash,
  Link2,
  Network,
  PanelRight,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react"
import { useDebouncedCallback } from "use-debounce"
import { isTauri } from "@tauri-apps/api/core"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  type VaultBacklink,
  type VaultGraph as VaultGraphData,
  type VaultNote,
  type VaultTag,
} from "@/lib/storage"
import { cn } from "@/lib/utils"
import type { FullProject } from "@/services/project"
import { MarkdownEditor } from "./markdown/MarkdownEditor"
import { VaultGraph } from "./VaultGraph"
import { useVaultNotes } from "./vault/useVaultNotes"

interface VaultEditorProps {
  projectData: FullProject
}

/**
 * Vault editor — Obsidian-style markdown notes backed by a folder the user
 * picked at project creation. Three-pane layout:
 *
 * - Left: sidebar with searchable note list.
 * - Centre: editor + preview, switchable between edit-only, split, and
 *   preview-only via the toolbar toggles.
 * - Top bar: folder path, mode switcher, save status, note actions.
 *
 * Autosaves every 600 ms while the user types; flushes synchronously on
 * note navigation so nothing is ever lost. No wikilinks, backlinks, graph
 * view, or filesystem watcher yet — those live in follow-up chunks.
 */
export function VaultEditor({ projectData }: VaultEditorProps) {
  const projectId = projectData.id
  const {
    storage,
    vaultPath,
    setVaultPath,
    notes,
    selected,
    setSelected,
    content,
    setContent,
    dirty,
    setDirty,
    selectedFilenameRef,
    isLoading,
    error,
    setError,
    refresh: refreshNotes,
    openNote,
  } = useVaultNotes(projectId)

  const [search, setSearch] = useState<string>("")
  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState("")
  const [createFolderForNote, setCreateFolderForNote] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [newFolderPath, setNewFolderPath] = useState("")
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set<string>(),
  )
  const [backlinks, setBacklinks] = useState<VaultBacklink[]>([])
  const [showBacklinks, setShowBacklinks] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // When non-null, the title bar shows an <input> instead of the static
  // title text — null means "not editing".
  const [renameDraft, setRenameDraft] = useState<string | null>(null)
  // Vault-wide "graph mode" swaps the main pane for the force-directed
  // visualisation. Sidebar stays mounted so the user can still navigate
  // notes the usual way.
  const [graphOpen, setGraphOpen] = useState(false)
  const [graphData, setGraphData] = useState<VaultGraphData | null>(null)
  // Tags sidebar panel — list of all tags in the vault + the filter
  // currently applied to the note list.
  const [tags, setTags] = useState<VaultTag[]>([])
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [tagFilterNotes, setTagFilterNotes] = useState<Set<string> | null>(null)
  const [tagsExpanded, setTagsExpanded] = useState(true)

  const wordCount = useMemo(() => {
    const trimmed = content.trim()
    if (!trimmed) return 0
    return trimmed.split(/\s+/).length
  }, [content])
  const charCount = content.length

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase()
    return notes.filter((n) => {
      // Tag filter narrows to notes returned by getNotesByTag. Null
      // tagFilter = no tag filter applied.
      if (tagFilterNotes && !tagFilterNotes.has(n.filename)) return false
      if (!q) return true
      // When filtering, match against the full relative path so users
      // can narrow by folder (`"archive/"`) as easily as by title.
      return (
        n.title.toLowerCase().includes(q) ||
        n.filename.toLowerCase().includes(q)
      )
    })
  }, [notes, search, tagFilterNotes])

  const tree = useMemo(() => buildTree(filteredNotes), [filteredNotes])

  // Auto-expand every ancestor of the selected note so it's visible in
  // the tree. Also expand everything when a search is active so matches
  // aren't hidden inside collapsed folders.
  useEffect(() => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      let changed = false
      if (search.trim()) {
        for (const note of filteredNotes) {
          if (!note.folder) continue
          const parts = note.folder.split("/")
          let acc = ""
          for (const p of parts) {
            acc = acc ? `${acc}/${p}` : p
            if (!next.has(acc)) {
              next.add(acc)
              changed = true
            }
          }
        }
      } else if (selected?.folder) {
        const parts = selected.folder.split("/")
        let acc = ""
        for (const p of parts) {
          acc = acc ? `${acc}/${p}` : p
          if (!next.has(acc)) {
            next.add(acc)
            changed = true
          }
        }
      }
      return changed ? next : prev
    })
  }, [filteredNotes, search, selected?.folder])

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  // Autosave — 600 ms after the last keystroke.
  const debouncedSave = useDebouncedCallback(
    async (filename: string, body: string) => {
      try {
        await storage.vault.writeNote(projectId, filename, body)
        setDirty(false)
      } catch (err) {
        console.error("Vault writeNote failed:", err)
        setError("Autosave failed. Check that the vault folder is writable.")
      }
    },
    600,
  )

  const flushPending = useCallback(async () => {
    if (!dirty || !selected) return
    debouncedSave.cancel()
    await storage.vault.writeNote(projectId, selected.filename, content)
    setDirty(false)
  }, [content, debouncedSave, dirty, projectId, selected, storage])

  const onContentChange = (next: string) => {
    setContent(next)
    setDirty(true)
    if (selectedFilenameRef.current) debouncedSave(selectedFilenameRef.current, next)
  }

  const onSelectNote = async (note: VaultNote) => {
    if (note.filename === selectedFilenameRef.current) return
    await flushPending()
    await openNote(note)
  }

  const openCreateDialog = (folder: string | null) => {
    setCreateFolderForNote(folder)
    setCreateTitle("")
    setCreateOpen(true)
  }

  const confirmCreateNote = async () => {
    const raw = createTitle.trim()
    if (!raw) return
    setActionBusy(true)
    await flushPending()
    try {
      // Allow the user to type `folder/title` even without picking a
      // folder from the sidebar — we split on the last slash and pass
      // both parts down. Explicit folder (from sidebar menu) wins if set.
      let folder = createFolderForNote ?? ""
      let title = raw
      const lastSlash = raw.lastIndexOf("/")
      if (lastSlash !== -1 && !folder) {
        folder = raw.slice(0, lastSlash)
        title = raw.slice(lastSlash + 1)
      }
      const created = await storage.vault.createNote(
        projectId,
        title,
        folder || undefined,
      )
      await refreshNotes()
      await openNote(created)
      // Make sure the containing folder unfolds so the new note is visible.
      if (created.folder) {
        setExpandedFolders((prev) => {
          const next = new Set(prev)
          const parts = created.folder.split("/")
          let acc = ""
          for (const p of parts) {
            acc = acc ? `${acc}/${p}` : p
            next.add(acc)
          }
          return next
        })
      }
      setCreateOpen(false)
      setCreateTitle("")
      setCreateFolderForNote(null)
    } catch (err) {
      console.error("Vault createNote failed:", err)
      setError("Could not create the note.")
    } finally {
      setActionBusy(false)
    }
  }

  const confirmCreateFolder = async () => {
    const raw = newFolderPath.trim()
    if (!raw) return
    const full = newFolderParent ? `${newFolderParent}/${raw}` : raw
    setActionBusy(true)
    try {
      await storage.vault.createFolder(projectId, full)
      await refreshNotes()
      setExpandedFolders((prev) => {
        const next = new Set(prev)
        const parts = full.split("/")
        let acc = ""
        for (const p of parts) {
          acc = acc ? `${acc}/${p}` : p
          next.add(acc)
        }
        return next
      })
      setFolderDialogOpen(false)
      setNewFolderPath("")
      setNewFolderParent(null)
    } catch (err) {
      console.error("Vault createFolder failed:", err)
      setError("Could not create the folder.")
    } finally {
      setActionBusy(false)
    }
  }

  const confirmDeleteNote = async () => {
    if (!selected) return
    setActionBusy(true)
    debouncedSave.cancel()
    try {
      await storage.vault.deleteNote(projectId, selected.filename)
      selectedFilenameRef.current = null
      setSelected(null)
      setContent("")
      setDirty(false)
      await refreshNotes()
      setDeleteOpen(false)
    } catch (err) {
      console.error("Vault deleteNote failed:", err)
      setError("Could not delete the note.")
    } finally {
      setActionBusy(false)
    }
  }

  // Tag panel loader — refetches whenever the note set changes. Cheap
  // — one indexed SQL group-by over `note_tags`.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await storage.vault.listTags(projectId)
        if (!cancelled) setTags(list)
      } catch (err) {
        console.error("Vault listTags failed:", err)
        if (!cancelled) setTags([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, storage, notes])

  // Tag filter resolver — fetches the filtered note list from the
  // backend and caches it as a Set for O(1) lookups during render.
  useEffect(() => {
    if (!tagFilter) {
      setTagFilterNotes(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const filenames = await storage.vault.getNotesByTag(projectId, tagFilter)
        if (!cancelled) setTagFilterNotes(new Set(filenames))
      } catch (err) {
        console.error("Vault getNotesByTag failed:", err)
        if (!cancelled) setTagFilterNotes(new Set())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, storage, tagFilter, notes])

  const onTagClick = (tag: string) => {
    setTagFilter((current) => (current?.toLowerCase() === tag.toLowerCase() ? null : tag))
  }

  // Graph data loader — refetches whenever graph mode opens or the note
  // set changes. Cheap enough to re-run on every refreshNotes tick
  // because it's a single SQL scan + one directory walk.
  useEffect(() => {
    if (!graphOpen) return
    let cancelled = false
    void (async () => {
      try {
        const g = await storage.vault.getGraph(projectId)
        if (!cancelled) setGraphData(g)
      } catch (err) {
        console.error("Vault getGraph failed:", err)
        if (!cancelled) setError("Could not build the graph.")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [graphOpen, projectId, storage, notes])

  const onGraphNodeSelect = async (filename: string) => {
    const note = notes.find((n) => n.filename === filename)
    if (!note) return
    await flushPending()
    setGraphOpen(false)
    await openNote(note)
  }

  const commitRename = async () => {
    const draft = renameDraft
    setRenameDraft(null)
    if (!draft || !selected) return
    const trimmed = draft.trim()
    if (!trimmed || trimmed === selected.title) return
    try {
      await flushPending()
      const updated = await storage.vault.renameNote(
        projectId,
        selected.filename,
        trimmed,
      )
      selectedFilenameRef.current = updated.filename
      setSelected(updated)
      await refreshNotes()
    } catch (err) {
      console.error("Vault renameNote failed:", err)
      setError(err instanceof Error ? err.message : "Could not rename the note.")
    }
  }

  // Stable refs for the watcher callback — the `useEffect` below runs once
  // per vault-path change, and we don't want to resubscribe just because
  // `selected` or `dirty` identity flipped on a keystroke.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const currentFilenameRef = selectedFilenameRef

  // Filesystem watcher: picks up external edits (vim, obsidian, git
  // checkout, etc.) and keeps the note list + open buffer in sync. Bails
  // out silently outside Tauri — nothing to watch in the web build.
  useEffect(() => {
    if (!vaultPath || !isTauri()) return
    let active = true
    let unwatch: (() => Promise<void> | void) | undefined

    void (async () => {
      try {
        // `watch` collects change events during `delayMs` and fires once —
        // cheaper than `watchImmediate` when a save touches several files
        // (e.g. our autosave + an editor tool running in parallel).
        const { watch } = await import("@tauri-apps/plugin-fs")
        const stop = await watch(
          vaultPath,
          (event) => {
            if (!active) return
            // Always refresh the sidebar; cheap SQL-free directory read.
            void refreshNotes()

            // Keep the backlinks index honest when external tools touch
            // `.md` files. Paths come in absolute; we convert them back
            // to vault-relative so nested notes reindex correctly.
            const paths: string[] = Array.isArray(event?.paths) ? event.paths : []
            const normalisedRoot = vaultPath.replace(/[\\/]+$/, "")
            const changedMd = new Set<string>()
            for (const p of paths) {
              if (!p.toLowerCase().endsWith(".md")) continue
              const normalised = p.replace(/\\/g, "/")
              const rootForwardSlash = normalisedRoot.replace(/\\/g, "/")
              if (normalised.startsWith(rootForwardSlash + "/")) {
                changedMd.add(normalised.slice(rootForwardSlash.length + 1))
              } else if (normalised.startsWith(rootForwardSlash)) {
                changedMd.add(normalised.slice(rootForwardSlash.length).replace(/^\/+/, ""))
              } else {
                // Fallback to basename if we can't re-root the path.
                const name = p.split(/[\\/]/).pop()
                if (name) changedMd.add(name)
              }
            }
            for (const filename of changedMd) {
              void storage.vault.reindexLinks(projectId, filename).catch(() => {})
            }
            // Kick the backlinks panel to refresh if the current note is
            // linked-from any of the changed files. Cheaper to just
            // re-run the query than to diff.
            if (currentFilenameRef.current) {
              void storage.vault
                .getBacklinks(
                  projectId,
                  currentFilenameRef.current.replace(/\.md$/i, ""),
                )
                .then((list) => {
                  if (active) setBacklinks(list)
                })
                .catch(() => {})
            }

            // Only reload the current buffer from disk if there are no
            // local unsaved edits, otherwise we'd clobber the user's work.
            const openFile = currentFilenameRef.current
            if (openFile && !dirtyRef.current) {
              storage.vault
                .readNote(projectId, openFile)
                .then((body) => {
                  if (!active) return
                  setContent((prev) => (prev === body ? prev : body))
                })
                .catch(() => {
                  /* file vanished — sidebar refresh will drop it */
                })
            }
          },
          // Recursive so edits anywhere under the vault — including
          // nested subfolders — trigger a refresh. `delayMs` coalesces
          // bursts (e.g. a save that touches several files at once).
          { recursive: true, delayMs: 300 },
        )
        if (!active) {
          void stop()
          return
        }
        unwatch = stop
      } catch (err) {
        console.warn("Vault watcher unavailable:", err)
      }
    })()

    return () => {
      active = false
      if (unwatch) void unwatch()
    }
  }, [vaultPath, projectId, refreshNotes, storage, currentFilenameRef])

  // Recompute backlinks whenever the selected note changes. We wait for
  // autosave to flush so fresh incoming links are picked up immediately
  // after renaming or creating a target.
  useEffect(() => {
    let cancelled = false
    if (!selected) {
      setBacklinks([])
      return
    }
    void (async () => {
      try {
        const list = await storage.vault.getBacklinks(projectId, selected.title)
        if (!cancelled) setBacklinks(list)
      } catch (err) {
        console.error("Vault getBacklinks failed:", err)
        if (!cancelled) setBacklinks([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, selected, storage])

  // Resolve a clicked [[Wikilink]] to a real note. If a note with that
  // title already exists in the vault we open it; otherwise we create a
  // fresh `.md` file and jump into it — matches Obsidian's behaviour.
  const onWikilinkClick = useCallback(
    async (title: string) => {
      const lowered = title.toLowerCase()
      const existing = notes.find((n) => n.title.toLowerCase() === lowered)
      await flushPending()
      try {
        if (existing) {
          await openNote(existing)
          return
        }
        const created = await storage.vault.createNote(projectId, title)
        await refreshNotes()
        await openNote(created)
      } catch (err) {
        console.error("Vault wikilink click failed:", err)
        setError(`Could not open "${title}".`)
      }
    },
    [flushPending, notes, openNote, projectId, refreshNotes, storage],
  )

  const onPickFolder = async () => {
    if (!isTauri()) {
      setError("Folder selection is only available in the desktop app.")
      return
    }
    const { open } = await import("@tauri-apps/plugin-dialog")
    const picked = await open({ directory: true, multiple: false })
    if (!picked || typeof picked !== "string") return
    await flushPending()
    await storage.vault.openVault(projectId, picked)
    setVaultPath(picked)
    const list = await refreshNotes()
    if (list.length > 0) void openNote(list[0])
    else {
      setSelected(null)
      setContent("")
    }
  }

  // Ctrl/Cmd+S forces an immediate save. Ctrl/Cmd+N creates a note.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        void flushPending()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [flushPending])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading vault…
      </div>
    )
  }

  if (!vaultPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <FolderOpen className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">No vault folder attached</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Pick a folder on your computer to use as this project&apos;s vault.
          Inkwell will read and write plain <code className="rounded bg-muted px-1 py-0.5 text-xs">.md</code> files there —
          nothing proprietary, nothing locked in.
        </p>
        <Button onClick={onPickFolder} size="lg">
          <FolderOpen className="mr-2 h-4 w-4" /> Choose vault folder
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Top bar — deliberately sparse. The folder path lives in the
          Settings dialog (gear icon on the right). */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
        <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Back to dashboard">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="h-5 w-px bg-border" />
        <div className="flex-1 truncate text-sm font-medium">
          {projectData.title}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            "h-8 w-8",
            graphOpen && "bg-muted text-foreground",
          )}
          onClick={() => setGraphOpen((v) => !v)}
          title="Toggle graph view"
        >
          <Network className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => setSettingsOpen(true)}
          title="Vault settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex w-64 shrink-0 flex-col border-r bg-muted/20">
          <div className="flex shrink-0 items-center gap-1 p-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter notes"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => {
                setNewFolderParent(null)
                setNewFolderPath("")
                setFolderDialogOpen(true)
              }}
              title="New folder"
            >
              <FolderPlus className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => openCreateDialog(null)}
              title="New note"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
            {tree.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                {notes.length === 0
                  ? "No notes yet."
                  : `No notes match "${search}".`}
              </div>
            ) : (
              <ul className="space-y-0.5 px-1.5">
                {tree.map((node, i) => (
                  <TreeNodeView
                    key={nodeKey(node, i)}
                    node={node}
                    depth={0}
                    selected={selected}
                    expanded={expandedFolders}
                    onToggle={toggleFolder}
                    onSelect={(note) => void onSelectNote(note)}
                    onNewNoteInFolder={(folderPath) => openCreateDialog(folderPath)}
                    onNewSubfolder={(parentPath) => {
                      setNewFolderParent(parentPath)
                      setNewFolderPath("")
                      setFolderDialogOpen(true)
                    }}
                  />
                ))}
              </ul>
            )}
          </div>

          {tags.length > 0 && (
            <div className="shrink-0 border-t">
              <button
                type="button"
                onClick={() => setTagsExpanded((v) => !v)}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                {tagsExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Tags
                <span className="ml-auto text-[10px] font-normal normal-case">
                  {tags.length}
                </span>
              </button>
              {tagsExpanded && (
                <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto px-2 pb-2">
                  {tags.map((t) => {
                    const active = tagFilter?.toLowerCase() === t.tag.toLowerCase()
                    return (
                      <button
                        key={t.tag}
                        type="button"
                        onClick={() => onTagClick(t.tag)}
                        className={cn(
                          "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                        title={`${t.count} ${t.count === 1 ? "note" : "notes"}`}
                      >
                        <Hash className="h-3 w-3" />
                        <span>{t.tag}</span>
                        <span className="text-[10px] opacity-70">{t.count}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
            <span>
              {filteredNotes.length}
              {filteredNotes.length !== notes.length && ` / ${notes.length}`}{" "}
              {notes.length === 1 ? "note" : "notes"}
            </span>
            {tagFilter && (
              <button
                type="button"
                onClick={() => setTagFilter(null)}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/15"
                title="Clear tag filter"
              >
                <Hash className="h-3 w-3" />
                {tagFilter}
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </aside>

        {/* Main */}
        <main className="flex min-w-0 flex-1 flex-col">
          {graphOpen ? (
            <VaultGraph
              graph={graphData ?? { nodes: [], edges: [] }}
              activeFilename={selected?.filename ?? null}
              onSelect={(f) => void onGraphNodeSelect(f)}
              className="flex-1"
            />
          ) : !selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <FileText className="h-8 w-8" />
              <div>Pick a note from the sidebar, or create a new one.</div>
              <Button size="sm" onClick={() => openCreateDialog(null)}>
                <Plus className="mr-2 h-4 w-4" /> New note
              </Button>
            </div>
          ) : (
            <>
              {/* Note toolbar */}
              <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
                {renameDraft === null ? (
                  <button
                    type="button"
                    onClick={() => setRenameDraft(selected.title)}
                    className="flex-1 truncate rounded px-1.5 py-1 text-left text-sm font-semibold hover:bg-accent/50"
                    title="Click to rename"
                  >
                    {selected.title}
                  </button>
                ) : (
                  <Input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => void commitRename()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        void commitRename()
                      } else if (e.key === "Escape") {
                        e.preventDefault()
                        setRenameDraft(null)
                      }
                    }}
                    className="h-8 flex-1 text-sm font-semibold"
                  />
                )}

                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-8 w-8",
                    showBacklinks && "bg-muted text-foreground",
                  )}
                  onClick={() => setShowBacklinks((v) => !v)}
                  title="Toggle backlinks panel"
                >
                  <PanelRight className="h-4 w-4" />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                  title="Delete note"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Editor + optional backlinks pane */}
              <div className="relative flex min-h-0 flex-1">
                <MarkdownEditor
                  value={content}
                  onChange={onContentChange}
                  onWikilinkClick={(target) => void onWikilinkClick(target)}
                  onTagClick={onTagClick}
                  vaultPath={vaultPath}
                  className="min-w-0 flex-1 overflow-hidden"
                />

                {showBacklinks && (
                  <aside className="flex w-64 shrink-0 flex-col border-l bg-muted/20">
                    <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Link2 className="h-3.5 w-3.5" />
                      Backlinks
                      <span className="ml-auto text-[10px] font-normal normal-case">
                        {backlinks.length}
                      </span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-2">
                      {backlinks.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-muted-foreground">
                          No other notes link to this one yet. Write{" "}
                          <code className="rounded bg-muted px-1 py-0.5">
                            [[{selected.title}]]
                          </code>{" "}
                          elsewhere to create one.
                        </div>
                      ) : (
                        <ul className="space-y-1">
                          {backlinks.map((bl) => (
                            <li key={bl.filename}>
                              <button
                                type="button"
                                onClick={() => {
                                  const match = notes.find(
                                    (n) => n.filename === bl.filename,
                                  )
                                  if (match) void onSelectNote(match)
                                }}
                                className="w-full rounded-md p-2 text-left text-xs transition-colors hover:bg-accent"
                              >
                                <div className="mb-0.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                                  <FileText className="h-3 w-3 text-muted-foreground" />
                                  {bl.title}
                                </div>
                                <div className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                                  {bl.snippet}
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </aside>
                )}

                {/* Floating status pill: stays out of the way but always
                    visible. Positioned over the editor (not the backlinks
                    pane) so it anchors to the writing surface. */}
                <div
                  className={cn(
                    "pointer-events-none absolute bottom-3 z-10 flex items-center gap-2 rounded-full border bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur tabular-nums",
                    showBacklinks ? "right-[17rem]" : "right-3",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setShowBacklinks((v) => !v)}
                    className={cn(
                      "pointer-events-auto flex items-center gap-1 rounded transition-colors hover:text-foreground",
                      showBacklinks && "text-foreground",
                    )}
                    title="Toggle backlinks panel"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    <span>
                      {backlinks.length} {backlinks.length === 1 ? "backlink" : "backlinks"}
                    </span>
                  </button>
                  <span className="h-3 w-px bg-border" aria-hidden />
                  <span>
                    {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
                  </span>
                  <span className="h-3 w-px bg-border" aria-hidden />
                  <span>
                    {charCount.toLocaleString()}{" "}
                    {charCount === 1 ? "character" : "characters"}
                  </span>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {error && (
        <div className="flex shrink-0 items-center justify-between border-t bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs underline underline-offset-2"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Create-note dialog — replaces the ugly native window.prompt. */}
      <Dialog open={createOpen} onOpenChange={(o) => !actionBusy && setCreateOpen(o)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>New note</DialogTitle>
            <DialogDescription>
              Give your note a title. Inkwell will create a{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">.md</code> file
              in the vault folder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="vault-note-title">Title</Label>
            <Input
              id="vault-note-title"
              value={createTitle}
              autoFocus
              onChange={(e) => setCreateTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && createTitle.trim()) {
                  e.preventDefault()
                  void confirmCreateNote()
                }
              }}
              placeholder="e.g. Reading list"
              disabled={actionBusy}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={actionBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void confirmCreateNote()}
              disabled={actionBusy || !createTitle.trim()}
            >
              {actionBusy ? "Creating…" : "Create note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New folder dialog. When `newFolderParent` is set the new folder
          is nested under that path; otherwise it lands at the vault root. */}
      <Dialog
        open={folderDialogOpen}
        onOpenChange={(o) => !actionBusy && setFolderDialogOpen(o)}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              {newFolderParent ? (
                <>
                  Create a subfolder inside{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    {newFolderParent}
                  </code>
                  . You can nest further with <code>a/b/c</code>.
                </>
              ) : (
                <>
                  Create a folder at the vault root. Nest deeper with{" "}
                  <code>a/b/c</code>.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="vault-folder-path">Folder name</Label>
            <Input
              id="vault-folder-path"
              value={newFolderPath}
              autoFocus
              onChange={(e) => setNewFolderPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolderPath.trim()) {
                  e.preventDefault()
                  void confirmCreateFolder()
                }
              }}
              placeholder="e.g. projects/alpha"
              disabled={actionBusy}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFolderDialogOpen(false)}
              disabled={actionBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void confirmCreateFolder()}
              disabled={actionBusy || !newFolderPath.trim()}
            >
              {actionBusy ? "Creating…" : "Create folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vault settings — change folder, see stats. Will grow as we add
          per-project toggles (template, excluded folders, etc.). */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Vault settings
            </DialogTitle>
            <DialogDescription>
              {projectData.title}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Vault folder
              </Label>
              <div
                className="mt-1 truncate rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs"
                title={vaultPath ?? undefined}
              >
                {vaultPath ?? "—"}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={async () => {
                  setSettingsOpen(false)
                  await onPickFolder()
                }}
              >
                <FolderOpen className="mr-2 h-4 w-4" /> Change folder…
              </Button>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Changes only affect where Inkwell reads and writes. Existing
                notes in the old folder are untouched.
              </p>
            </div>

            <div className="rounded-md border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Stats
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="text-right tabular-nums">{notes.length}</dd>
                <dt className="text-muted-foreground">Backlinks to current</dt>
                <dd className="text-right tabular-nums">
                  {selected ? backlinks.length : "—"}
                </dd>
              </dl>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setSettingsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete-note confirmation. */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !actionBusy && setDeleteOpen(o)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete note
            </DialogTitle>
            <DialogDescription>
              {selected ? (
                <>
                  Delete{" "}
                  <span className="font-semibold text-foreground">
                    &ldquo;{selected.title}&rdquo;
                  </span>
                  ? This removes the file from your vault folder and cannot be
                  undone.
                </>
              ) : (
                "Delete this note?"
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={actionBusy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDeleteNote()}
              disabled={actionBusy}
            >
              {actionBusy ? "Deleting…" : "Delete note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Tree rendering ──────────────────────────────────────────────────────

function nodeKey(node: TreeNode, index: number): string {
  return node.type === "folder"
    ? `folder:${node.path}`
    : `file:${node.note.filename}#${index}`
}

interface TreeNodeViewProps {
  node: TreeNode
  depth: number
  selected: VaultNote | null
  expanded: Set<string>
  onToggle: (path: string) => void
  onSelect: (note: VaultNote) => void
  onNewNoteInFolder: (folderPath: string) => void
  onNewSubfolder: (parentPath: string) => void
}

/** Recursive tree row. Folders get a chevron + folder icon and toggle on
 *  click; hovering reveals inline actions for creating a note or
 *  subfolder inside. Files get a file icon + title. */
function TreeNodeView({
  node,
  depth,
  selected,
  expanded,
  onToggle,
  onSelect,
  onNewNoteInFolder,
  onNewSubfolder,
}: TreeNodeViewProps) {
  if (node.type === "folder") {
    const open = expanded.has(node.path)
    return (
      <li>
        <div
          className="group flex items-center gap-1 rounded-md pr-1 hover:bg-accent/50"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <button
            type="button"
            onClick={() => onToggle(node.path)}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-sm text-foreground/80"
            title={node.path}
          >
            {open ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            {open ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          <button
            type="button"
            onClick={() => onNewSubfolder(node.path)}
            className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground group-hover:flex"
            title="New subfolder"
          >
            <FolderPlus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onNewNoteInFolder(node.path)}
            className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground group-hover:flex"
            title="New note in folder"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        {open && node.children.length > 0 && (
          <ul className="space-y-0.5">
            {node.children.map((child, i) => (
              <TreeNodeView
                key={nodeKey(child, i)}
                node={child}
                depth={depth + 1}
                selected={selected}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
                onNewNoteInFolder={onNewNoteInFolder}
                onNewSubfolder={onNewSubfolder}
              />
            ))}
          </ul>
        )}
      </li>
    )
  }

  const active = selected?.filename === node.note.filename
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node.note)}
        style={{ paddingLeft: `${depth * 12 + 22}px` }}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm transition-colors",
          active
            ? "bg-accent text-accent-foreground"
            : "text-foreground/80 hover:bg-accent/50",
        )}
        title={node.note.filename}
      >
        <FileText
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            active ? "text-accent-foreground" : "text-muted-foreground",
          )}
        />
        <span className="truncate">{node.note.title}</span>
      </button>
    </li>
  )
}

// ─── Tree helpers ────────────────────────────────────────────────────────

interface TreeFolderNode {
  type: "folder"
  name: string
  path: string
  children: TreeNode[]
}
interface TreeFileNode {
  type: "file"
  note: VaultNote
}
type TreeNode = TreeFolderNode | TreeFileNode

/** Derives a collapsible tree from the flat VaultNote list by splitting
 *  `filename` on `/`. Sorted so folders surface first at each level,
 *  then files, each group alphabetical. */
function buildTree(notes: VaultNote[]): TreeNode[] {
  const root: TreeFolderNode = { type: "folder", name: "", path: "", children: [] }
  for (const note of notes) {
    const parts = note.filename.split("/")
    const fileName = parts.pop()!
    let cursor = root
    let curPath = ""
    for (const seg of parts) {
      curPath = curPath ? `${curPath}/${seg}` : seg
      let child = cursor.children.find(
        (c) => c.type === "folder" && c.name === seg,
      ) as TreeFolderNode | undefined
      if (!child) {
        child = { type: "folder", name: seg, path: curPath, children: [] }
        cursor.children.push(child)
      }
      cursor = child
    }
    cursor.children.push({ type: "file", note })
    // Prevent the unused-var lint fire in branches that don't consume
    // `fileName` — it's the leaf we just attached.
    void fileName
  }
  sortTree(root)
  return root.children
}

function sortTree(folder: TreeFolderNode): void {
  folder.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1
    const aName = a.type === "folder" ? a.name : a.note.title
    const bName = b.type === "folder" ? b.name : b.note.title
    return aName.localeCompare(bName)
  })
  for (const child of folder.children) {
    if (child.type === "folder") sortTree(child)
  }
}

