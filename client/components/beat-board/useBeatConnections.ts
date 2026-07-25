import type React from "react"
import { useCallback, useState } from "react"

import {
  createConnection,
  type Connection,
} from "@/services/beat"
import { toCanvasPoint } from "./canvasGeometry"

export type ConnectionSide = "top" | "right" | "bottom" | "left"

interface UseBeatConnectionsOptions {
  projectId: string
  connections: Connection[]
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>
  surfaceRef: React.RefObject<HTMLDivElement | null>
}

interface UseBeatConnectionsResult {
  isConnecting: boolean
  connectionStart: { beatId: string; side: ConnectionSide } | null
  /** Cursor-following endpoint for the in-progress connection arrow.
   *  Null means no drag in progress. */
  tempConnection: { x: number; y: number } | null
  onConnectionStart: (e: React.MouseEvent, beatId: string, side: ConnectionSide) => void
  onConnectionEnd: (beatId: string, side: ConnectionSide) => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseUp: () => void
}

/** Owns the connect-two-beats interaction: which side of which beat
 *  the user grabbed, where the cursor currently is (so the arrow can
 *  follow), and the persistence call once the user drops on a target.
 *  onMouseUp clears the gesture even if the drop missed a valid
 *  target — leaving stale state would visually freeze the arrow. */
export function useBeatConnections({
  projectId,
  setConnections,
  surfaceRef,
}: UseBeatConnectionsOptions): UseBeatConnectionsResult {
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStart, setConnectionStart] = useState<{
    beatId: string
    side: ConnectionSide
  } | null>(null)
  const [tempConnection, setTempConnection] = useState<{ x: number; y: number } | null>(null)

  const onConnectionStart = useCallback(
    (e: React.MouseEvent, beatId: string, side: ConnectionSide) => {
      e.stopPropagation()
      setIsConnecting(true)
      setConnectionStart({ beatId, side })
    },
    [],
  )

  const onConnectionEnd = useCallback(
    (beatId: string, side: ConnectionSide) => {
      if (connectionStart && connectionStart.beatId !== beatId) {
        createConnection(projectId, {
          fromId: connectionStart.beatId,
          toId: beatId,
          fromSide: connectionStart.side,
          toSide: side,
        }).then((newConnection) => setConnections((prev) => [...prev, newConnection]))
      }
      setIsConnecting(false)
      setConnectionStart(null)
      setTempConnection(null)
    },
    [connectionStart, projectId, setConnections],
  )

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isConnecting || !connectionStart || !surfaceRef.current) return
      // The arrow is drawn in canvas coordinates alongside the beats, so its
      // loose end has to be converted the same way they are. Measured from the
      // scroll container it ignored the scroll offset and the arrow trailed the
      // cursor by however far the board was scrolled.
      setTempConnection(toCanvasPoint(surfaceRef.current, e.clientX, e.clientY))
    },
    [isConnecting, connectionStart, surfaceRef],
  )

  const onMouseUp = useCallback(() => {
    // If the user dropped without landing on a beat-side target, clear
    // the in-progress arrow. The handler that runs on a successful
    // drop (onConnectionEnd) does the same cleanup.
    if (!isConnecting) return
    setIsConnecting(false)
    setConnectionStart(null)
    setTempConnection(null)
  }, [isConnecting])

  return {
    isConnecting,
    connectionStart,
    tempConnection,
    onConnectionStart,
    onConnectionEnd,
    onMouseMove,
    onMouseUp,
  }
}
