import type React from "react"
import { useCallback, useEffect, useState } from "react"

import type { Storage, VaultNote, VaultTag } from "@/lib/storage"

interface UseVaultTagsResult {
  tags: VaultTag[]
  /** Currently-applied tag filter, or null when no filter is active. */
  tagFilter: string | null
  /** Set of vault-relative filenames matching the active tag, or null
   *  when there's no filter. The render layer uses this for an O(1)
   *  membership check inside the filteredNotes memo. */
  tagFilterNotes: Set<string> | null
  tagsExpanded: boolean
  setTagsExpanded: React.Dispatch<React.SetStateAction<boolean>>
  setTagFilter: React.Dispatch<React.SetStateAction<string | null>>
  /** Toggle helper: clicking the active tag clears the filter; clicking
   *  any other tag swaps to it. Case-insensitive on the equality check. */
  onTagClick: (tag: string) => void
}

/** Owns the vault's tag list (`#tags` parsed out of note bodies), the
 *  currently-applied filter, and the resolved set of filenames matching
 *  that filter. Refetches the tag list whenever notes change so newly
 *  added / renamed tags appear without remount. */
export function useVaultTags(
  projectId: string,
  storage: Storage,
  notes: VaultNote[],
): UseVaultTagsResult {
  const [tags, setTags] = useState<VaultTag[]>([])
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [tagFilterNotes, setTagFilterNotes] = useState<Set<string> | null>(null)
  const [tagsExpanded, setTagsExpanded] = useState(true)

  // Tag list — one indexed SQL group-by over `note_tags`.
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

  const onTagClick = useCallback((tag: string) => {
    setTagFilter((current) => (current?.toLowerCase() === tag.toLowerCase() ? null : tag))
  }, [])

  return { tags, tagFilter, tagFilterNotes, tagsExpanded, setTagsExpanded, setTagFilter, onTagClick }
}
