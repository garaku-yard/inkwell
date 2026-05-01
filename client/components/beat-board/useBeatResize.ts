import type React from "react"
import { useCallback, useState } from "react"

import type { Beat } from "@/services/beat"

interface UseBeatResizeOptions {
  beats: Beat[]
  setBeats: React.Dispatch<React.SetStateAction<Beat[]>>
  snapToGrid: (value: number) => number
  /** Called once on mouse-up with the final size. The parent's
   *  debouncedUpdateBeat persists it. */
  onCommit: (beatId: string, size: { width: number; height: number }) => void
}

interface UseBeatResizeResult {
  isResizing: string | null
  /** Bind to the bottom-right resize-handle's onMouseDown. Stops the
   *  event so the drag hook on the same card doesn't also fire. */
  onResizeMouseDown: (e: React.MouseEvent, beatId: string) => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseUp: () => void
}

/** Owns the resize-handle interaction: which beat is being resized,
 *  the captured starting mouse + size, and the per-frame size update.
 *  Honours a 200×150 minimum and snaps each delta to grid. */
export function useBeatResize({
  beats,
  setBeats,
  snapToGrid,
  onCommit,
}: UseBeatResizeOptions): UseBeatResizeResult {
  const [isResizing, setIsResizing] = useState<string | null>(null)
  const [resizeStartMousePos, setResizeStartMousePos] = useState({ x: 0, y: 0 })
  const [resizeStartBeatSize, setResizeStartBeatSize] = useState({ width: 0, height: 0 })

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent, beatId: string) => {
      e.stopPropagation()
      setIsResizing(beatId)
      setResizeStartMousePos({ x: e.clientX, y: e.clientY })
      const beat = beats.find((b) => b.id === beatId)
      if (beat) setResizeStartBeatSize({ width: beat.width, height: beat.height })
    },
    [beats],
  )

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isResizing) return
      const deltaX = e.clientX - resizeStartMousePos.x
      const deltaY = e.clientY - resizeStartMousePos.y
      setBeats((prev) =>
        prev.map((beat) => {
          if (beat.id !== isResizing) return beat
          const newWidth = snapToGrid(Math.max(200, resizeStartBeatSize.width + deltaX))
          const newHeight = snapToGrid(Math.max(150, resizeStartBeatSize.height + deltaY))
          return { ...beat, width: newWidth, height: newHeight }
        }),
      )
    },
    [isResizing, resizeStartMousePos, resizeStartBeatSize, setBeats, snapToGrid],
  )

  const onMouseUp = useCallback(() => {
    if (!isResizing) return
    const beat = beats.find((b) => b.id === isResizing)
    if (beat) onCommit(beat.id, { width: beat.width, height: beat.height })
    setIsResizing(null)
  }, [isResizing, beats, onCommit])

  return { isResizing, onResizeMouseDown, onMouseMove, onMouseUp }
}
