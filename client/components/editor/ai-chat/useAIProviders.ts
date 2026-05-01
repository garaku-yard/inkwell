import { useCallback, useEffect, useMemo, useState } from "react"

import { getStorage } from "@/lib/storage"
import type { AIProviderSettings } from "@/lib/storage"

const SELECTION_KEY_PREFIX = "inkwell.ai.selection"

interface StoredSelection {
  providerId: string
  model?: string
}

/** Storage key for a given project's provider selection. Falls back to a
 *  shared global key when the panel is mounted outside any project, so
 *  the selection still persists across sessions. */
function selectionKeyFor(projectId?: string): string {
  return projectId ? `${SELECTION_KEY_PREFIX}.${projectId}` : SELECTION_KEY_PREFIX
}

function readSelection(projectId?: string): StoredSelection | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(selectionKeyFor(projectId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSelection
    if (typeof parsed.providerId !== "string") return null
    return parsed
  } catch {
    return null
  }
}

function writeSelection(projectId: string | undefined, selection: StoredSelection | null) {
  if (typeof window === "undefined") return
  const key = selectionKeyFor(projectId)
  if (selection === null) {
    window.localStorage.removeItem(key)
    return
  }
  window.localStorage.setItem(key, JSON.stringify(selection))
}

interface UseAIProvidersResult {
  providers: AIProviderSettings[]
  providersLoaded: boolean
  selectedProvider: AIProviderSettings | null
  selectedId: string | null
  selectProvider: (id: string) => void
  /** Re-load the provider list from storage. The chat panel calls this
   *  on open so a freshly added provider shows up without remount. */
  reload: () => Promise<void>
}

/** Owns the provider list, the per-project selection persisted to
 *  localStorage, and the filtering rule for "usable" rows (enabled
 *  plus either has a stored key or is openai_compatible — which
 *  doesn't always need one for local Ollama). */
export function useAIProviders(
  projectId: string | undefined,
  shouldLoad: boolean,
): UseAIProvidersResult {
  const storage = getStorage()

  const [providers, setProviders] = useState<AIProviderSettings[]>([])
  const [providersLoaded, setProvidersLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const rows = await storage.ai.listProviderSettings()
      const usable = rows.filter(
        (p) => p.enabled && (p.hasKey || p.kind === "openai_compatible"),
      )
      setProviders(usable)
      const stored = readSelection(projectId)
      const fallback = usable[0]?.id ?? null
      const next =
        stored && usable.some((p) => p.id === stored.providerId)
          ? stored.providerId
          : fallback
      setSelectedId(next)
      if (next && (!stored || stored.providerId !== next)) {
        writeSelection(projectId, { providerId: next })
      }
    } catch {
      setProviders([])
      setSelectedId(null)
    } finally {
      setProvidersLoaded(true)
    }
  }, [storage, projectId])

  useEffect(() => {
    if (shouldLoad) void reload()
  }, [shouldLoad, reload])

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === selectedId) ?? null,
    [providers, selectedId],
  )

  const selectProvider = useCallback(
    (id: string) => {
      setSelectedId(id)
      writeSelection(projectId, { providerId: id })
    },
    [projectId],
  )

  return { providers, providersLoaded, selectedProvider, selectedId, selectProvider, reload }
}
