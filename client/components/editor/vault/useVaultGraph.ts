import type React from "react"
import { useEffect, useState } from "react"

import type { Storage, VaultGraph as VaultGraphData, VaultNote } from "@/lib/storage"

interface UseVaultGraphOptions {
  projectId: string
  storage: Storage
  notes: VaultNote[]
  setError: React.Dispatch<React.SetStateAction<string | null>>
}

interface UseVaultGraphResult {
  graphOpen: boolean
  setGraphOpen: React.Dispatch<React.SetStateAction<boolean>>
  graphData: VaultGraphData | null
}

/** Owns the graph-mode toggle and the graph data fetched when the user
 *  opens it. Re-fetches whenever the note set changes so a newly added
 *  link / note shows up without remount. The graph fetch is one SQL
 *  scan + a directory walk, so re-running on every notes change is
 *  cheaper than diffing. */
export function useVaultGraph({
  projectId,
  storage,
  notes,
  setError,
}: UseVaultGraphOptions): UseVaultGraphResult {
  const [graphOpen, setGraphOpen] = useState(false)
  const [graphData, setGraphData] = useState<VaultGraphData | null>(null)

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
  }, [graphOpen, projectId, storage, notes, setError])

  return { graphOpen, setGraphOpen, graphData }
}
