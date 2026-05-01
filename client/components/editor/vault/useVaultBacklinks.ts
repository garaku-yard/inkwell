import type React from "react"
import { useEffect, useState } from "react"

import type { Storage, VaultBacklink, VaultNote } from "@/lib/storage"

interface UseVaultBacklinksResult {
  backlinks: VaultBacklink[]
  /** Exposed so the watcher can write fresh backlinks in when an
   *  external edit changes the incoming-link set for the open note. */
  setBacklinks: React.Dispatch<React.SetStateAction<VaultBacklink[]>>
}

/** Owns the backlinks list for the currently-open vault note.
 *  Recomputes whenever `selected` changes; cleared when no note is
 *  open. Cheap query — re-running on every selection change is fine. */
export function useVaultBacklinks(
  projectId: string,
  storage: Storage,
  selected: VaultNote | null,
): UseVaultBacklinksResult {
  const [backlinks, setBacklinks] = useState<VaultBacklink[]>([])

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

  return { backlinks, setBacklinks }
}
