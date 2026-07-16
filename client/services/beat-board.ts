/** Beat-board service — thin wrappers around the Storage abstraction for
 *  lanes and outline items on the timeline. */
import { getStorage } from "@/lib/storage"

export interface Lane {
  id: string
  name: string
  color: string
  order: number
}

export interface OutlineItem {
  id: string
  projectId: string
  beatId: string
  laneId: string
  order: number
  timelinePosition?: number
  width?: number
}

// ─── Drawing layer ────────────────────────────────────────────────────────

/** Shape kinds the toolbar can draw. A plain string on the wire and in the DB
 *  (decisions/0022) — adding a kind shouldn't cost a migration on two databases
 *  and a proto change. */
export type DrawingKind = "pen" | "line" | "arrow" | "rect" | "ellipse"

/** Every shape is a point list plus a style, whatever its kind — `pen` carries
 *  the whole stroke, `line`/`arrow` two ends, `rect`/`ellipse` two opposite
 *  corners. One shape for all kinds keeps the payload (and the renderer's input)
 *  uniform; the kind decides how the points are read. */
export interface DrawingData {
  points: Array<{ x: number; y: number }>
  /** Stroke colour, any CSS colour. */
  color: string
  /** Stroke width in canvas units. */
  width: number
  /** Fill for closed shapes; null/absent = outline only. */
  fill?: string | null
}

export interface Drawing {
  id: string
  kind: DrawingKind
  data: DrawingData
  /** z-order within the layer. */
  order: number
}

export const createDrawing = (projectId: string, input: Partial<Drawing>): Promise<Drawing> =>
  getStorage().beatBoard.createDrawing(projectId, input)

export const updateDrawing = (drawingId: string, patch: Partial<Drawing>): Promise<Drawing> =>
  getStorage().beatBoard.updateDrawing(drawingId, patch)

export const deleteDrawing = (drawingId: string): Promise<void> =>
  getStorage().beatBoard.deleteDrawing(drawingId)

export const updateLane = (laneId: string, updates: Partial<Lane>): Promise<void> =>
  getStorage().beatBoard.updateLane(laneId, updates)

export const updateLaneOrder = (projectId: string, orderedIds: string[]): Promise<void> =>
  getStorage().beatBoard.updateLaneOrder(projectId, orderedIds)

export const createOutlineItem = (
  projectId: string,
  itemData: Partial<OutlineItem>,
): Promise<OutlineItem> => getStorage().beatBoard.createOutlineItem(projectId, itemData)

export const updateOutlineItem = (
  itemId: string,
  updates: Partial<OutlineItem>,
): Promise<void> => getStorage().beatBoard.updateOutlineItem(itemId, updates)

export const deleteOutlineItem = (itemId: string): Promise<void> =>
  getStorage().beatBoard.deleteOutlineItem(itemId)

export const createLane = (projectId: string, laneData: Partial<Lane>): Promise<Lane> =>
  getStorage().beatBoard.createLane(projectId, laneData)
