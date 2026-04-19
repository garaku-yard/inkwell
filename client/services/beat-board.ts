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
