import type React from "react"
import { useCallback, useState } from "react"

import type { Beat } from "@/services/beat"
import { toCanvasPoint } from "./canvasGeometry"

interface UseBeatDragOptions {
  beats: Beat[]
  setBeats: React.Dispatch<React.SetStateAction<Beat[]>>
  surfaceRef: React.RefObject<HTMLDivElement | null>
  snapToGrid: (value: number) => number
  /** Called once on mouse-up with the final position. The parent's
   *  debouncedUpdateBeat persists it. */
  onCommit: (beatId: string, position: { x: number; y: number }) => void
}

interface UseBeatDragResult {
  movingBeatId: string | null
  /** Bind to a beat card's onMouseDown. Skips the gesture when the
   *  click started on a child input, button, resize handle, or
   *  connection handle so dragging doesn't fight the controls. */
  onBeatMouseDown: (e: React.MouseEvent, beatId: string) => void
  /** Outer onMouseMove handler — no-op when no drag is in progress. */
  onMouseMove: (e: React.MouseEvent) => void
  /** Outer onMouseUp handler — no-op when no drag is in progress. */
  onMouseUp: () => void
}

/** Owns the position-drag interaction: which beat is moving, the
 *  pointer-relative offset captured at mousedown, and the per-frame
 *  position update during drag. snapToGrid is passed in so all the
 *  beat-board hooks share the same grid step. */
export function useBeatDrag({
  beats,
  setBeats,
  surfaceRef,
  snapToGrid,
  onCommit,
}: UseBeatDragOptions): UseBeatDragResult {
  const [movingBeatId, setMovingBeatId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const onBeatMouseDown = useCallback((e: React.MouseEvent, beatId: string) => {
    if (
      (e.target as HTMLElement).closest(
        ".resize-handle, .connection-handle, input, textarea, button, [draggable=true]",
      )
    ) {
      return
    }
    setMovingBeatId(beatId)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!movingBeatId || !surfaceRef.current) return
      // Against the surface, not the scroll container: measuring from the
      // container ignored the scroll offset, so grabbing a card on a scrolled
      // board threw it back by however far the board was scrolled. dragOffset
      // is a client-to-client delta, so it needs no conversion.
      const point = toCanvasPoint(surfaceRef.current, e.clientX, e.clientY)
      const newX = snapToGrid(point.x - dragOffset.x)
      const newY = snapToGrid(point.y - dragOffset.y)
      setBeats((prev) =>
        prev.map((beat) =>
          beat.id === movingBeatId
            ? { ...beat, position: { x: Math.max(0, newX), y: Math.max(0, newY) } }
            : beat,
        ),
      )
    },
    [movingBeatId, surfaceRef, dragOffset, setBeats, snapToGrid],
  )

  const onMouseUp = useCallback(() => {
    if (!movingBeatId) return
    const beat = beats.find((b) => b.id === movingBeatId)
    if (beat) onCommit(beat.id, beat.position)
    setMovingBeatId(null)
  }, [movingBeatId, beats, onCommit])

  return { movingBeatId, onBeatMouseDown, onMouseMove, onMouseUp }
}
