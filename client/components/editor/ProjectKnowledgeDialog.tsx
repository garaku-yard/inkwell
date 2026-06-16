"use client"

import { useCallback, useEffect, useState } from "react"
import { BookOpen, Loader2, Plus, X } from "lucide-react"

import { useAuth } from "@/lib/AuthContext"
import { getStorage } from "@/lib/storage"
import type {
  KnowledgeIndexStatus,
  KnowledgeScope,
  KnowledgeScopeType,
  Project,
} from "@/lib/storage"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface ProjectKnowledgeDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Human label for a wired scope row. */
function describeScope(scope: KnowledgeScope, vaultTitle: string): string {
  switch (scope.scopeType) {
    case "folder":
      return `${vaultTitle} · folder “${scope.scopeValue}”`
    case "tag":
      return `${vaultTitle} · #${scope.scopeValue}`
    default:
      return `${vaultTitle} · whole vault`
  }
}

/**
 * Per-project Knowledge settings. Lets a non-vault project wire one or more
 * slices of a vault (whole vault / a folder / a tag) as AI chat context, then
 * build the local embedding index over those notes. Desktop-only — the gear
 * that opens this is gated on the `ai.knowledge` capability.
 */
export function ProjectKnowledgeDialog({
  projectId,
  open,
  onOpenChange,
}: ProjectKnowledgeDialogProps) {
  const { user } = useAuth()
  const storage = getStorage()

  const [scopes, setScopes] = useState<KnowledgeScope[]>([])
  const [vaults, setVaults] = useState<Project[]>([])
  const [vaultTitles, setVaultTitles] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<Record<string, KnowledgeIndexStatus>>({})
  const [building, setBuilding] = useState<Record<string, { done: number; total: number }>>({})
  const [error, setError] = useState<string | null>(null)

  // Draft "add a source" controls.
  const [draftVault, setDraftVault] = useState<string>("")
  const [draftType, setDraftType] = useState<KnowledgeScopeType>("vault")
  const [draftValue, setDraftValue] = useState<string>("")
  const [folderOptions, setFolderOptions] = useState<string[]>([])
  const [tagOptions, setTagOptions] = useState<string[]>([])

  const refreshStatus = useCallback(
    async (scopeList: KnowledgeScope[]) => {
      const vaultIds = Array.from(new Set(scopeList.map((s) => s.vaultProjectId)))
      const next: Record<string, KnowledgeIndexStatus> = {}
      for (const id of vaultIds) {
        next[id] = await storage.knowledge.getIndexStatus(id)
      }
      setStatus(next)
    },
    [storage],
  )

  // Load scopes + candidate vaults whenever the dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const [loadedScopes, owned] = await Promise.all([
          storage.knowledge.getScopes(projectId),
          user?.id
            ? storage.projects.listOwned(user.id)
            : Promise.resolve({ projects: [], total: 0 }),
        ])
        if (cancelled) return
        const vaultProjects = owned.projects.filter((p) => p.category === "vault")
        const titles: Record<string, string> = {}
        for (const p of vaultProjects) titles[p.id] = p.title
        setVaults(vaultProjects)
        setVaultTitles(titles)
        setScopes(loadedScopes)
        setDraftVault(vaultProjects[0]?.id ?? "")
        await refreshStatus(loadedScopes)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, projectId, user?.id, storage, refreshStatus])

  // Populate folder / tag options when the draft vault or scope type changes.
  useEffect(() => {
    if (!open || !draftVault) return
    let cancelled = false
    void (async () => {
      try {
        if (draftType === "folder") {
          const notes = await storage.vault.listNotes(draftVault)
          if (cancelled) return
          const folders = Array.from(
            new Set(notes.map((n) => n.folder).filter(Boolean)),
          ).sort()
          setFolderOptions(folders)
          setDraftValue(folders[0] ?? "")
        } else if (draftType === "tag") {
          const tags = await storage.vault.listTags(draftVault)
          if (cancelled) return
          setTagOptions(tags.map((t) => t.tag))
          setDraftValue(tags[0]?.tag ?? "")
        } else {
          setDraftValue("")
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, draftVault, draftType, storage])

  /** Persists a new scope list immediately so retrieval + indexing see a
   *  consistent DB. */
  const persist = useCallback(
    async (next: KnowledgeScope[]) => {
      setScopes(next)
      await storage.knowledge.setScopes(projectId, next)
      await refreshStatus(next)
    },
    [projectId, storage, refreshStatus],
  )

  const handleAdd = async () => {
    if (!draftVault) return
    if ((draftType === "folder" || draftType === "tag") && !draftValue) return
    const candidate: KnowledgeScope = {
      vaultProjectId: draftVault,
      scopeType: draftType,
      scopeValue: draftType === "vault" ? "" : draftValue,
    }
    const exists = scopes.some(
      (s) =>
        s.vaultProjectId === candidate.vaultProjectId &&
        s.scopeType === candidate.scopeType &&
        s.scopeValue === candidate.scopeValue,
    )
    if (exists) return
    try {
      await persist([...scopes, candidate])
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleRemove = async (scope: KnowledgeScope) => {
    try {
      await persist(
        scopes.filter(
          (s) =>
            !(
              s.vaultProjectId === scope.vaultProjectId &&
              s.scopeType === scope.scopeType &&
              s.scopeValue === scope.scopeValue
            ),
        ),
      )
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleBuild = async (vaultProjectId: string) => {
    setError(null)
    setBuilding((b) => ({ ...b, [vaultProjectId]: { done: 0, total: 0 } }))
    try {
      const result = await storage.knowledge.buildIndex(vaultProjectId, (p) =>
        setBuilding((b) => ({ ...b, [vaultProjectId]: p })),
      )
      setStatus((s) => ({ ...s, [vaultProjectId]: result }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBuilding((b) => {
        const next = { ...b }
        delete next[vaultProjectId]
        return next
      })
    }
  }

  const wiredVaultIds = Array.from(new Set(scopes.map((s) => s.vaultProjectId)))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Knowledge
          </DialogTitle>
          <DialogDescription>
            Give the Writing Buddy access to your notes. Pick a vault — or a
            folder or tag within one — and the chat will ground its answers in
            those notes.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {vaults.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You don’t have any vault projects yet. Create a vault and add some
            notes, then come back to wire it up here.
          </p>
        ) : (
          <div className="space-y-6">
            {/* Current sources */}
            <section className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Sources
              </Label>
              {scopes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No sources yet. Add one below.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {scopes.map((scope, i) => (
                    <li
                      key={`${scope.vaultProjectId}-${scope.scopeType}-${scope.scopeValue}-${i}`}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span>
                        {describeScope(
                          scope,
                          vaultTitles[scope.vaultProjectId] ?? "Unknown vault",
                        )}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => handleRemove(scope)}
                        aria-label="Remove source"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Add a source */}
            <section className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Add a source
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={draftVault} onValueChange={setDraftVault}>
                  <SelectTrigger className="h-9 w-[180px]">
                    <SelectValue placeholder="Vault" />
                  </SelectTrigger>
                  <SelectContent>
                    {vaults.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={draftType}
                  onValueChange={(v) => setDraftType(v as KnowledgeScopeType)}
                >
                  <SelectTrigger className="h-9 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vault">Whole vault</SelectItem>
                    <SelectItem value="folder">Folder</SelectItem>
                    <SelectItem value="tag">Tag</SelectItem>
                  </SelectContent>
                </Select>

                {draftType === "folder" && (
                  <Select value={draftValue} onValueChange={setDraftValue}>
                    <SelectTrigger className="h-9 w-[160px]">
                      <SelectValue placeholder="Folder" />
                    </SelectTrigger>
                    <SelectContent>
                      {folderOptions.length === 0 ? (
                        <SelectItem value="" disabled>
                          No subfolders
                        </SelectItem>
                      ) : (
                        folderOptions.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}

                {draftType === "tag" && (
                  <Select value={draftValue} onValueChange={setDraftValue}>
                    <SelectTrigger className="h-9 w-[160px]">
                      <SelectValue placeholder="Tag" />
                    </SelectTrigger>
                    <SelectContent>
                      {tagOptions.length === 0 ? (
                        <SelectItem value="" disabled>
                          No tags
                        </SelectItem>
                      ) : (
                        tagOptions.map((t) => (
                          <SelectItem key={t} value={t}>
                            #{t}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}

                <Button size="sm" className="h-9 gap-1.5" onClick={handleAdd}>
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            </section>

            {/* Index status + build */}
            {wiredVaultIds.length > 0 && (
              <section className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Index
                </Label>
                <p className="text-xs text-muted-foreground">
                  Notes are embedded locally on your machine — your notes never
                  leave your device. Build the index after wiring a vault or
                  making large edits. The first build downloads a one-time
                  ~22MB model, so it needs an internet connection; after that
                  indexing works offline.
                </p>
                <ul className="space-y-2">
                  {wiredVaultIds.map((vaultId) => {
                    const st = status[vaultId]
                    const prog = building[vaultId]
                    return (
                      <li
                        key={vaultId}
                        className="rounded-md border px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span>{vaultTitles[vaultId] ?? "Vault"}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5"
                            disabled={!!prog}
                            onClick={() => handleBuild(vaultId)}
                          >
                            {prog ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            {prog ? "Building…" : "Build index"}
                          </Button>
                        </div>
                        {prog && prog.total > 0 && (
                          <div className="mt-2 space-y-1">
                            <Progress
                              value={Math.round((prog.done / prog.total) * 100)}
                            />
                            <p className="text-xs text-muted-foreground">
                              {prog.done} / {prog.total} notes
                            </p>
                          </div>
                        )}
                        {!prog && st && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {st.notes} notes · {st.chunks} chunks indexed
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
