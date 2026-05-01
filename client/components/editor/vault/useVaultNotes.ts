import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { getStorage, type Storage, type VaultNote } from "@/lib/storage"

interface UseVaultNotesResult {
  /** Vault directory the user picked at project creation, or null when
   *  no vault is configured yet. */
  vaultPath: string | null
  /** Always available so the parent can update vaultPath after a
   *  pickFolder-style flow without re-running the initial load. */
  setVaultPath: React.Dispatch<React.SetStateAction<string | null>>
  notes: VaultNote[]
  /** Currently-open note. Null on first load (until refresh resolves) or
   *  after the last note has been deleted. */
  selected: VaultNote | null
  setSelected: React.Dispatch<React.SetStateAction<VaultNote | null>>
  /** Body of the currently-open note as the editor sees it. Authoritative
   *  for unsaved typing — the on-disk copy lags behind by up to one
   *  autosave debounce tick. */
  content: string
  setContent: React.Dispatch<React.SetStateAction<string>>
  dirty: boolean
  setDirty: React.Dispatch<React.SetStateAction<boolean>>
  /** Most-recently-loaded filename. Owned as a ref so the autosave hook
   *  can read the latest filename without re-binding its debounce on
   *  every navigation (which would silently swallow pending writes). */
  selectedFilenameRef: React.RefObject<string | null>
  isLoading: boolean
  error: string | null
  setError: React.Dispatch<React.SetStateAction<string | null>>
  /** Re-list the vault from disk and update local state. Returns the
   *  fresh list so callers like the create-note flow can navigate
   *  directly to a newly-written file without an extra round trip. */
  refresh: () => Promise<VaultNote[]>
  /** Loads `note.filename` from disk and resets selected/content/dirty.
   *  No-op if read fails (the error message lands on `error`). */
  openNote: (note: VaultNote) => Promise<void>
  storage: Storage
}

/** Owns the vault's note list, vault path, and the currently-open note
 *  (selected + content + dirty + filename ref). The autosave / watcher
 *  / backlinks / tags / graph hooks all read from this state but don't
 *  mutate it directly — they receive setters / refs via props. */
export function useVaultNotes(projectId: string): UseVaultNotesResult {
  const storage = useMemo(() => getStorage(), [])

  const [vaultPath, setVaultPath] = useState<string | null>(null)
  const [notes, setNotes] = useState<VaultNote[]>([])
  const [selected, setSelected] = useState<VaultNote | null>(null)
  const [content, setContent] = useState<string>("")
  const [dirty, setDirty] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Track the most recently-loaded filename so the autosave hook can't
  // stomp on a file the user has already navigated away from.
  const selectedFilenameRef = useRef<string | null>(null)

  const refresh = useCallback(async () => {
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
        selectedFilenameRef.current = note.filename
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

  // Initial load — discover the vault path, list notes, open the first
  // one. `cancelled` guards against a project change racing the fetch.
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
      const list = await refresh()
      if (cancelled) return
      if (list.length > 0) void openNote(list[0])
      setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, storage, refresh, openNote])

  return {
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
    refresh,
    openNote,
    storage,
  }
}
