import type React from "react"
import { useCallback, useEffect } from "react"
import { useDebouncedCallback } from "use-debounce"

import type { Storage, VaultNote } from "@/lib/storage"

interface UseVaultAutosaveOptions {
  projectId: string
  storage: Storage
  selected: VaultNote | null
  content: string
  dirty: boolean
  setDirty: React.Dispatch<React.SetStateAction<boolean>>
  setError: React.Dispatch<React.SetStateAction<string | null>>
  selectedFilenameRef: React.RefObject<string | null>
}

interface UseVaultAutosaveResult {
  /** Schedule a save for `filename` with the given body. The debounce
   *  fires 600 ms after the last call, matching the original inline
   *  delay. Caller should also flip `dirty` to true via setDirty (the
   *  hook doesn't do it because callers update content + dirty in the
   *  same React tick). */
  scheduleSave: (filename: string, body: string) => void
  /** Synchronously cancel any pending debounced save and write the
   *  current content immediately. Used on note navigation, folder
   *  changes, and the Ctrl+S handler so users never lose in-flight
   *  typing. No-op when nothing is dirty. */
  flushPending: () => Promise<void>
  /** Discard any pending debounced save without writing. Used by
   *  destructive flows like delete-note where the file is about to
   *  vanish — flushing would just write to a doomed path. */
  cancelPending: () => void
}

/** Owns the vault's debounced save dispatcher, the synchronous flush
 *  helper, and the global Ctrl/Cmd+S keyboard listener. The hook does
 *  NOT own selected / content / dirty — those live in useVaultNotes
 *  because openNote resets them; this hook reads them as inputs and
 *  drives writes. */
export function useVaultAutosave({
  projectId,
  storage,
  selected,
  content,
  dirty,
  setDirty,
  setError,
  selectedFilenameRef,
}: UseVaultAutosaveOptions): UseVaultAutosaveResult {
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
  }, [content, debouncedSave, dirty, projectId, selected, storage, setDirty])

  const scheduleSave = useCallback(
    (filename: string, body: string) => {
      debouncedSave(filename, body)
    },
    [debouncedSave],
  )

  const cancelPending = useCallback(() => {
    debouncedSave.cancel()
  }, [debouncedSave])

  // Ctrl/Cmd+S forces an immediate flush.
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

  // Make selectedFilenameRef available so consumers that wire raw
  // keystroke handlers can decide which file to schedule against.
  void selectedFilenameRef

  return { scheduleSave, flushPending, cancelPending }
}
