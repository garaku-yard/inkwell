import type React from "react"
import { useEffect, useState } from "react"

import {
  getBeatBoardForProject,
  type Beat,
  type Connection,
} from "@/services/beat"
import type { Drawing, Lane, OutlineItem } from "@/services/beat-board"

interface UseBeatBoardDataResult {
  beats: Beat[]
  setBeats: React.Dispatch<React.SetStateAction<Beat[]>>
  connections: Connection[]
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>
  lanes: Lane[]
  setLanes: React.Dispatch<React.SetStateAction<Lane[]>>
  outlineItems: OutlineItem[]
  setOutlineItems: React.Dispatch<React.SetStateAction<OutlineItem[]>>
  drawings: Drawing[]
  setDrawings: React.Dispatch<React.SetStateAction<Drawing[]>>
  isLoading: boolean
  error: string | null
}

/** Fetches the beat-board payload (beats / connections / lanes /
 *  outline items) for `projectId` and exposes them as state slices the
 *  page's interaction hooks can mutate. The caller should pass
 *  `project?.id` from useProjectLoader so the fetch waits for the
 *  project metadata to resolve first. */
export function useBeatBoardData(projectId: string | undefined): UseBeatBoardDataResult {
  const [beats, setBeats] = useState<Beat[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [lanes, setLanes] = useState<Lane[]>([])
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([])
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setIsLoading(true)
    setError(null)
    getBeatBoardForProject(projectId)
      .then((data) => {
        if (cancelled) return
        setBeats(data.beats || [])
        setConnections(data.connections || [])
        setLanes(data.lanes || [])
        setOutlineItems(data.outlineItems || [])
        setDrawings(data.drawings || [])
      })
      .catch((err) => {
        if (cancelled) return
        console.error("beat-board load failed", err)
        setError("Failed to load beat board data.")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  return {
    beats,
    setBeats,
    connections,
    setConnections,
    lanes,
    setLanes,
    outlineItems,
    setOutlineItems,
    drawings,
    setDrawings,
    isLoading,
    error,
  }
}
