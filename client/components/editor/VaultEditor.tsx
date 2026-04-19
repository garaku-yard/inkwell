"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  ArrowLeft,
  Eye,
  FileText,
  FolderOpen,
  Link2,
  PanelRight,
  Pencil,
  Plus,
  Save,
  Search,
  Settings,
  Trash2,
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
import { getStorage, type VaultBacklink, type VaultNote } from "@/lib/storage"
import { cn } from "@/lib/utils"
import type { FullProject } from "@/services/project"
import { MarkdownEditor } from "./markdown/MarkdownEditor"

type ViewMode = "live" | "preview"

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
  const storage = useMemo(() => getStorage(), [])

  const [vaultPath, setVaultPath] = useState<string | null>(null)
  const [notes, setNotes] = useState<VaultNote[]>([])
  const [selected, setSelected] = useState<VaultNote | null>(null)
  const [content, setContent] = useState<string>("")
  const [dirty, setDirty] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState<string>("")
  const [view, setView] = useState<ViewMode>("live")
  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [backlinks, setBacklinks] = useState<VaultBacklink[]>([])
  const [showBacklinks, setShowBacklinks] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Track the most recently-loaded filename so the debounced save can't
  // stomp on a file the user has already navigated away from.
  const selectedRef = useRef<string | null>(null)

  const filteredNotes = useMemo(() => {
    if (!search.trim()) return notes
    const q = search.trim().toLowerCase()
    return notes.filter((n) => n.title.toLowerCase().includes(q))
  }, [notes, search])

  const refreshNotes = useCallback(async () => {
    try {
      const list = await storage.vault.listNotes(projectId)
      setNotes(list)
      return list
    } catch (err) {
      console.error("Vault listNotes failed:", err)
      setError("Could not read the vault folder.")
      return []
    }
  }, [projectId, storage])

  const openNote = useCallback(
    async (note: VaultNote) => {
      try {
        const body = await storage.vault.readNote(projectId, note.filename)
        selectedRef.current = note.filename
        setSelected(note)
        setContent(body)
        setDirty(false)
      } catch (err) {
        console.error("Vault readNote failed:", err)
        setError(`Could not open "${note.title}".`)
      }
    },
    [projectId, storage],
  )

  // Initial load.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      setIsLoading(true)
      setError(null)
      const path = await storage.vault.getVaultPath(projectId)
      if (cancelled) return
      setVaultPath(path)
      if (!path) {
        setIsLoading(false)
        return
      }
      const list = await refreshNotes()
      if (cancelled) return
      if (list.length > 0) void openNote(list[0])
      setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, storage, refreshNotes, openNote])

  // Autosave — 600 ms after the last keystroke.
  const debouncedSave = useDebouncedCallback(
    async (filename: string, body: string) => {
      setIsSaving(true)
      try {
        await storage.vault.writeNote(projectId, filename, body)
        setDirty(false)
      } catch (err) {
        console.error("Vault writeNote failed:", err)
        setError("Autosave failed. Check that the vault folder is writable.")
      } finally {
        setIsSaving(false)
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
    if (selectedRef.current) debouncedSave(selectedRef.current, next)
  }

  const onSelectNote = async (note: VaultNote) => {
    if (note.filename === selectedRef.current) return
    await flushPending()
    await openNote(note)
  }

  const openCreateDialog = () => {
    setCreateTitle("")
    setCreateOpen(true)
  }

  const confirmCreateNote = async () => {
    const title = createTitle.trim()
    if (!title) return
    setActionBusy(true)
    await flushPending()
    try {
      const created = await storage.vault.createNote(projectId, title)
      await refreshNotes()
      await openNote(created)
      setCreateOpen(false)
      setCreateTitle("")
    } catch (err) {
      console.error("Vault createNote failed:", err)
      setError("Could not create the note.")
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
      selectedRef.current = null
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

  // Stable refs for the watcher callback — the `useEffect` below runs once
  // per vault-path change, and we don't want to resubscribe just because
  // `selected` or `dirty` identity flipped on a keystroke.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const currentFilenameRef = selectedRef

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
            // `.md` files. Paths come in absolute; basename is enough for
            // reindexLinks to locate the row set. Errors are swallowed
            // per-file so one broken write doesn't abort the batch.
            const paths: string[] = Array.isArray(event?.paths) ? event.paths : []
            const changedMd = new Set<string>()
            for (const p of paths) {
              if (!p.toLowerCase().endsWith(".md")) continue
              const name = p.split(/[\\/]/).pop()
              if (name) changedMd.add(name)
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
          // `recursive: false` matches the flat-vault assumption; bump
          // to true when we support subfolders. `delayMs` coalesces
          // bursts (e.g. a save that touches several files at once).
          { recursive: false, delayMs: 300 },
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
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading vault…
      </div>
    )
  }

  if (!vaultPath) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
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
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
        <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Back to dashboard">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="h-5 w-px bg-border" />
        <FolderOpen className="h-4 w-4 text-muted-foreground" />
        <div
          className="flex-1 truncate text-xs text-muted-foreground"
          title={vaultPath}
        >
          {vaultPath}
        </div>
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
          <div className="flex shrink-0 items-center gap-2 p-3">
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
              onClick={openCreateDialog}
              title="New note (Ctrl/Cmd+N)"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
            {filteredNotes.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                {notes.length === 0
                  ? "No notes yet."
                  : `No notes match "${search}".`}
              </div>
            ) : (
              <ul className="space-y-0.5 px-1.5">
                {filteredNotes.map((note) => {
                  const active = selected?.filename === note.filename
                  return (
                    <li key={note.filename}>
                      <button
                        type="button"
                        onClick={() => void onSelectNote(note)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                          active
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground/80 hover:bg-accent/50",
                        )}
                        title={note.filename}
                      >
                        <FileText
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            active ? "text-accent-foreground" : "text-muted-foreground",
                          )}
                        />
                        <span className="truncate">{note.title}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t px-3 py-2 text-xs text-muted-foreground">
            {notes.length} {notes.length === 1 ? "note" : "notes"}
          </div>
        </aside>

        {/* Main */}
        <main className="flex min-w-0 flex-1 flex-col">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <FileText className="h-8 w-8" />
              <div>Pick a note from the sidebar, or create a new one.</div>
              <Button size="sm" onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" /> New note
              </Button>
            </div>
          ) : (
            <>
              {/* Note toolbar */}
              <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
                <div className="flex-1 truncate text-sm font-semibold">
                  {selected.title}
                </div>

                <div className="flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
                  <ViewModeButton
                    active={view === "live"}
                    onClick={() => setView("live")}
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    label="Live"
                  />
                  <ViewModeButton
                    active={view === "preview"}
                    onClick={() => setView("preview")}
                    icon={<Eye className="h-3.5 w-3.5" />}
                    label="Preview"
                  />
                </div>

                <SaveStatus saving={isSaving} dirty={dirty} />
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
                  className="h-8 w-8"
                  onClick={() => void flushPending()}
                  title="Save now (Ctrl/Cmd+S)"
                >
                  <Save className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                  title="Delete note"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Editor / preview + optional backlinks pane */}
              <div className="flex min-h-0 flex-1">
                {view === "live" ? (
                  <MarkdownEditor
                    value={content}
                    onChange={onContentChange}
                    onWikilinkClick={(target) => void onWikilinkClick(target)}
                    vaultPath={vaultPath}
                    className="min-w-0 flex-1 overflow-hidden"
                  />
                ) : (
                  <div className="min-w-0 flex-1 overflow-y-auto bg-background">
                    <div className="mx-auto max-w-3xl px-12 py-10">
                      {content.trim() ? (
                        <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:tracking-tight prose-pre:bg-muted prose-pre:text-foreground">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {content}
                          </ReactMarkdown>
                        </article>
                      ) : (
                        <div className="text-sm text-muted-foreground/60">
                          Nothing to preview yet.
                        </div>
                      )}
                    </div>
                  </div>
                )}

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

function ViewModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded px-2 text-xs transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function SaveStatus({ saving, dirty }: { saving: boolean; dirty: boolean }) {
  const [label, tone] = saving
    ? ["Saving…", "text-muted-foreground"]
    : dirty
      ? ["Unsaved", "text-amber-600 dark:text-amber-400"]
      : ["Saved", "text-muted-foreground"]
  return <span className={cn("mr-1 text-xs", tone)}>{label}</span>
}
