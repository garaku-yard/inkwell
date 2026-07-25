import type React from "react"
import { useCallback, useRef, useState } from "react"

import {
  createDrawing,
  deleteDrawing,
  type Drawing,
  type DrawingData,
  type DrawingKind,
} from "@/services/beat-board"
import { toCanvasPoint } from "./canvasGeometry"

/** "select" is the normal board: the drawing layer is inert and cards behave as
 *  usual. Everything else takes the pointer. */
export type DrawTool = "select" | DrawingKind | "eraser"

export interface UseDrawingResult {
  tool: DrawTool
  setTool: (t: DrawTool) => void
  color: string
  setColor: (c: string) => void
  width: number
  setWidth: (w: number) => void
  /** The stroke being drawn right now — rendered but not yet persisted. */
  draft: Drawing | null
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: () => void
  eraseShape: (id: string) => void
}

interface Options {
  projectId: string | undefined
  surfaceRef: React.RefObject<HTMLDivElement | null>
  drawings: Drawing[]
  setDrawings: React.Dispatch<React.SetStateAction<Drawing[]>>
}

/** A pen stroke samples every pointer move, which is far more precision than a
 *  drawing needs and more points than are pleasant to store. Dropping samples
 *  closer than this (in canvas units) keeps strokes light without a visible
 *  change to the line. */
const MIN_SAMPLE_DISTANCE = 2

const isDrawTool = (t: DrawTool): t is DrawingKind =>
  t === "pen" || t === "line" || t === "arrow" || t === "rect" || t === "ellipse"

/**
 * Drawing interaction for the beat-board canvas: tracks the active tool and the
 * in-flight stroke, and persists a shape once (on release) rather than on every
 * sample — a stroke is one gesture, so it's one row and one sync push
 * (decisions/0022). Nothing is written while the pointer is down.
 */
export function useDrawing({ projectId, surfaceRef, drawings, setDrawings }: Options): UseDrawingResult {
  const [tool, setTool] = useState<DrawTool>("select")
  const [color, setColor] = useState("#1f2420")
  const [width, setWidth] = useState(3)
  // The in-flight stroke lives in a ref; `draft` only mirrors it for rendering.
  // Reading it from state instead loses strokes: pointerdown→move→up can land in
  // a single React batch, so the state the up-handler closes over is still the
  // pre-stroke value and the shape is silently dropped. A ref is current the
  // moment it's written, which is what a gesture needs.
  const draftRef = useRef<Drawing | null>(null)
  const [draft, setDraft] = useState<Drawing | null>(null)
  const drawingRef = useRef(false)

  const setDraftBoth = useCallback((d: Drawing | null) => {
    draftRef.current = d
    setDraft(d)
  }, [])

  /** Screen → canvas coordinates, via the same helper every other gesture on
   *  the board uses — shapes must land where the cards they annotate live. */
  const toCanvas = useCallback(
    (e: React.PointerEvent) => toCanvasPoint(surfaceRef.current, e.clientX, e.clientY),
    [surfaceRef],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawTool(tool) || !projectId) return
      e.preventDefault()
      drawingRef.current = true
      const p = toCanvas(e)
      const data: DrawingData = { points: [p], color, width }
      // A local-only id: the draft is replaced by the persisted shape (with its
      // real id) on release, so this never reaches the database.
      setDraftBoth({ id: "__draft__", kind: tool, data, order: drawings.length })
    },
    [tool, projectId, toCanvas, color, width, drawings.length, setDraftBoth],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawingRef.current) return
      const prev = draftRef.current
      if (!prev) return
      const p = toCanvas(e)
      const pts = prev.data.points

      if (prev.kind === "pen") {
        const last = pts[pts.length - 1]
        if (last && Math.hypot(p.x - last.x, p.y - last.y) < MIN_SAMPLE_DISTANCE) return
        setDraftBoth({ ...prev, data: { ...prev.data, points: [...pts, p] } })
        return
      }
      // line/arrow/rect/ellipse are two points: origin and wherever the pointer
      // is now.
      setDraftBoth({ ...prev, data: { ...prev.data, points: [pts[0], p] } })
    },
    [toCanvas, setDraftBoth],
  )

  const onPointerUp = useCallback(() => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const shape = draftRef.current
    setDraftBoth(null)
    if (!shape || !projectId) return

    // A tap with no drag isn't a shape — don't persist a dot the user can't see
    // or select. Two-point tools need an actual extent for the same reason.
    const pts = shape.data.points
    if (shape.kind === "pen" ? pts.length < 2 : pts.length < 2 || (pts[0].x === pts[1].x && pts[0].y === pts[1].y)) {
      return
    }

    void (async () => {
      try {
        const saved = await createDrawing(projectId, {
          kind: shape.kind,
          data: shape.data,
          order: shape.order,
        })
        setDrawings((prev) => [...prev, saved])
      } catch (err) {
        // Say so rather than leaving a stroke on screen that isn't saved — the
        // draft is already gone, so the shape visibly disappears, which is the
        // honest outcome.
        console.error("failed to save drawing", err)
      }
    })()
  }, [projectId, setDrawings, setDraftBoth])

  /** Erase optimistically, but restore the shape if the delete didn't land —
   *  otherwise it stays gone on screen and returns on the next load, which reads
   *  as data resurrecting itself. Re-inserted at its z-order, not appended. */
  const eraseShape = useCallback(
    (id: string) => {
      const removed = drawings.find((d) => d.id === id)
      if (!removed) return
      setDrawings((prev) => prev.filter((d) => d.id !== id))
      void deleteDrawing(id).catch((err) => {
        console.error("failed to erase drawing", err)
        setDrawings((prev) =>
          prev.some((d) => d.id === id)
            ? prev
            : [...prev, removed].sort((x, y) => x.order - y.order),
        )
      })
    },
    [drawings, setDrawings],
  )

  return {
    tool, setTool, color, setColor, width, setWidth,
    draft, onPointerDown, onPointerMove, onPointerUp, eraseShape,
  }
}
