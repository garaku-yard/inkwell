"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  FileText,
  Folder,
  FolderOpen,
  Link2,
  Network,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react"
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
import { type VaultNote } from "@/lib/storage"
import { cn } from "@/lib/utils"
import type { FullProject } from "@/services/project"
import { MarkdownEditor } from "./markdown/MarkdownEditor"
import { VaultGraph } from "./VaultGraph"
import { useVaultAutosave } from "./vault/useVaultAutosave"
import { useVaultBacklinks } from "./vault/useVaultBacklinks"
import { useVaultGraph } from "./vault/useVaultGraph"
import { useVaultNotes } from "./vault/useVaultNotes"
import { useVaultTags } from "./vault/useVaultTags"
import { useVaultWatcher } from "./vault/useVaultWatcher"
import { VaultBacklinksPane } from "./vault/VaultBacklinksPane"
import { VaultNoteToolbar } from "./vault/VaultNoteToolbar"
import { VaultSidebar } from "./vault/VaultSidebar"
import { buildVaultTree } from "./vault/VaultTreeNode"

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
  const [showBacklinks, setShowBacklinks] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // When non-null, the title bar shows an <input> instead of the static
  // title text — null means "not editing".
  const [renameDraft, setRenameDraft] = useState<string | null>(null)

  const { backlinks, setBacklinks } = useVaultBacklinks(projectId, storage, selected)
  const {
    tags,
    tagFilter,
    tagFilterNotes,
    tagsExpanded,
    setTagsExpanded,
    setTagFilter,
    onTagClick,
  } = useVaultTags(projectId, storage, notes)
  const { graphOpen, setGraphOpen, graphData } = useVaultGraph({
    projectId,
    storage,
    notes,
    setError,
  })

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

  const tree = useMemo(() => buildVaultTree(filteredNotes), [filteredNotes])

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

  const { scheduleSave, flushPending, cancelPending } = useVaultAutosave({
    projectId,
    storage,
    selected,
    content,
    dirty,
    setDirty,
    setError,
    selectedFilenameRef,
  })

  const onContentChange = (next: string) => {
    setContent(next)
    setDirty(true)
    if (selectedFilenameRef.current) scheduleSave(selectedFilenameRef.current, next)
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
    cancelPending()
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

  useVaultWatcher({
    vaultPath,
    projectId,
    storage,
    selectedFilenameRef,
    dirty,
    onSidebarRefresh: refreshNotes,
    onBacklinksReload: setBacklinks,
    onContentReload: (_filename, body) => setContent((prev) => (prev === body ? prev : body)),
  })

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

  // Resolve a vault-relative path against the active vault root.
  // Mirrors live-preview.ts's joinVaultPath but kept inline because
  // this hook only needs a tiny portion of that logic.
  const resolveVaultRelative = useCallback(
    (rel: string): string | null => {
      if (!vaultPath) return null
      const sep = /\\/.test(vaultPath) && !/\//.test(vaultPath) ? "\\" : "/"
      return `${vaultPath.replace(/[\\/]+$/, "")}${sep}${rel}`
    },
    [vaultPath],
  )

  // Open a plain markdown link from a vault note. Three flavours:
  //   - http/https/mailto → OS browser (Tauri opener plugin or
  //     window.open on the web)
  //   - non-image vault-relative path → OS default app via the opener
  //     plugin's openPath (PDFs, audio, docs — the "attachments
  //     beyond images" scenario)
  //   - anything with a `javascript:` / `file:` / similar scheme is
  //     dropped silently to keep user content from smuggling in
  //     active content
  const onLinkClick = useCallback(
    (rawUrl: string) => {
      const trimmed = rawUrl.trim()
      if (!trimmed) return

      if (/^(https?:|mailto:)/i.test(trimmed)) {
        if (isTauri()) {
          void import("@tauri-apps/plugin-opener")
            .then(({ openUrl }) => openUrl(trimmed))
            .catch((err) => console.error("Failed to open URL:", err))
        } else {
          window.open(trimmed, "_blank", "noopener,noreferrer")
        }
        return
      }

      // Reject any other URL scheme (`javascript:`, `file:`, custom
      // protocols) — only relative paths get the attachment treatment.
      if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return

      if (!isTauri()) return
      const absolute = resolveVaultRelative(trimmed)
      if (!absolute) return
      void import("@tauri-apps/plugin-opener")
        .then(({ openPath }) => openPath(absolute))
        .catch((err) => console.error("Failed to open attachment:", err))
    },
    [resolveVaultRelative],
  )

  // Pick a file from disk, copy it into the vault's `attachments/`
  // folder, and append a markdown link to the current note. Images
  // get the `![alt](path)` shape so live-preview renders them inline;
  // everything else lands as a plain `[file](path)` link that the
  // attachment click handler above opens via the OS default app.
  const handleAttach = useCallback(async () => {
    if (!isTauri() || !vaultPath || !selected) {
      setError("Attachments need an open desktop vault.")
      return
    }
    try {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const { copyFile, exists, mkdir } = await import("@tauri-apps/plugin-fs")
      const picked = await open({ multiple: false })
      if (!picked || typeof picked !== "string") return

      const sep = /\\/.test(vaultPath) && !/\//.test(vaultPath) ? "\\" : "/"
      const root = vaultPath.replace(/[\\/]+$/, "")
      const attachmentsDir = `${root}${sep}attachments`
      if (!(await exists(attachmentsDir))) {
        await mkdir(attachmentsDir, { recursive: true })
      }

      const sourceBasename = picked.split(/[\\/]/).pop() ?? "attachment"
      const safeBasename = sourceBasename.replace(/[^a-zA-Z0-9._-]/g, "_")
      let destBasename = safeBasename
      let dest = `${attachmentsDir}${sep}${destBasename}`
      // Resolve filename collisions by appending `-1`, `-2`, … before
      // the extension. Don't overwrite an existing attachment.
      let n = 1
      while (await exists(dest)) {
        const dot = safeBasename.lastIndexOf(".")
        const stem = dot === -1 ? safeBasename : safeBasename.slice(0, dot)
        const ext = dot === -1 ? "" : safeBasename.slice(dot)
        destBasename = `${stem}-${n}${ext}`
        dest = `${attachmentsDir}${sep}${destBasename}`
        n += 1
      }
      await copyFile(picked, dest)

      const isImage = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(destBasename)
      const linkPath = `attachments/${destBasename}`
      const label = destBasename.replace(/\.[^.]+$/, "")
      const snippet = isImage
        ? `\n\n![${label}](${linkPath})\n`
        : `\n\n[${label}](${linkPath})\n`

      await flushPending()
      onContentChange((content ?? "") + snippet)
    } catch (err) {
      console.error("Attach failed:", err)
      setError(err instanceof Error ? err.message : "Could not attach file.")
    }
  }, [content, flushPending, onContentChange, selected, vaultPath])

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
          aria-label="Toggle graph view"
          aria-pressed={graphOpen}
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
        <VaultSidebar
          notes={notes}
          tree={tree}
          search={search}
          onSearch={setSearch}
          filteredCount={filteredNotes.length}
          selected={selected}
          expandedFolders={expandedFolders}
          onToggleFolder={toggleFolder}
          onSelectNote={(note) => void onSelectNote(note)}
          onCreateNoteIn={openCreateDialog}
          onCreateSubfolder={(parentPath) => {
            setNewFolderParent(parentPath)
            setNewFolderPath("")
            setFolderDialogOpen(true)
          }}
          tags={tags}
          tagFilter={tagFilter}
          tagsExpanded={tagsExpanded}
          setTagsExpanded={setTagsExpanded}
          setTagFilter={setTagFilter}
          onTagClick={onTagClick}
        />

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
              <VaultNoteToolbar
                title={selected.title}
                renameDraft={renameDraft}
                setRenameDraft={setRenameDraft}
                onCommitRename={commitRename}
                showBacklinks={showBacklinks}
                onToggleBacklinks={() => setShowBacklinks((v) => !v)}
                onDelete={() => setDeleteOpen(true)}
                onAttach={isTauri() ? handleAttach : undefined}
              />

              {/* Editor + optional backlinks pane */}
              <div className="relative flex min-h-0 flex-1">
                <MarkdownEditor
                  value={content}
                  onChange={onContentChange}
                  onWikilinkClick={(target) => void onWikilinkClick(target)}
                  onTagClick={onTagClick}
                  onLinkClick={onLinkClick}
                  vaultPath={vaultPath}
                  className="min-w-0 flex-1 overflow-hidden"
                />

                {showBacklinks && (
                  <VaultBacklinksPane
                    backlinks={backlinks}
                    currentTitle={selected.title}
                    onSelectBacklink={(filename) => {
                      const match = notes.find((n) => n.filename === filename)
                      if (match) void onSelectNote(match)
                    }}
                  />
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

