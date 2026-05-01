import type React from "react"
import { useCallback, useState } from "react"

import type { Beat } from "@/services/beat"

interface UseBeatDragOptions {
  beats: Beat[]
  setBeats: React.Dispatch<React.SetStateAction<Beat[]>>
  boardRef: React.RefObject<HTMLDivElement | null>
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
  boardRef,
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
      if (!movingBeatId || !boardRef.current) return
      const boardRect = boardRef.current.getBoundingClientRect()
      const newX = snapToGrid(e.clientX - boardRect.left - dragOffset.x)
      const newY = snapToGrid(e.clientY - boardRect.top - dragOffset.y)
      setBeats((prev) =>
        prev.map((beat) =>
          beat.id === movingBeatId
            ? { ...beat, position: { x: Math.max(0, newX), y: Math.max(0, newY) } }
            : beat,
        ),
      )
    },
    [movingBeatId, boardRef, dragOffset, setBeats, snapToGrid],
  )

  const onMouseUp = useCallback(() => {
    if (!movingBeatId) return
    const beat = beats.find((b) => b.id === movingBeatId)
    if (beat) onCommit(beat.id, beat.position)
    setMovingBeatId(null)
  }, [movingBeatId, beats, onCommit])

  return { movingBeatId, onBeatMouseDown, onMouseMove, onMouseUp }
}
