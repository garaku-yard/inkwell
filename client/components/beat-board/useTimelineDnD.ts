import type React from "react"
import { useCallback, useState } from "react"

import { type Beat } from "@/services/beat"
import {
  createLane,
  createOutlineItem,
  updateLane,
  updateLaneOrder,
  updateOutlineItem,
  type Lane,
  type OutlineItem,
} from "@/services/beat-board"

interface PageMath {
  /** Convert a percentage along the timeline to a 1-based page number. */
  getPageFromPosition: (position: number) => number
  /** Convert a 1-based page number to a percentage along the timeline. */
  getPositionFromPage: (page: number) => number
  /** Convert a startPage..endPage span to a width percentage. */
  getWidthFromPages: (startPage: number, endPage: number) => number
}

interface UseTimelineDnDOptions {
  projectId: string
  beats: Beat[]
  setBeats: React.Dispatch<React.SetStateAction<Beat[]>>
  outlineItems: OutlineItem[]
  setOutlineItems: React.Dispatch<React.SetStateAction<OutlineItem[]>>
  lanes: Lane[]
  setLanes: React.Dispatch<React.SetStateAction<Lane[]>>
  pageMath: PageMath
  debouncedUpdateBeat: (beatId: string, updates: Partial<Beat>) => void
  debouncedUpdateOutlineItem: (itemId: string, updates: Partial<OutlineItem>) => void
}

interface UseTimelineDnDResult {
  hoveredLane: string | null
  setHoveredLane: React.Dispatch<React.SetStateAction<string | null>>
  draggedLaneItem: string | null
  setDraggedLaneItem: React.Dispatch<React.SetStateAction<string | null>>
  draggedLaneId: string | null
  setDraggedLaneId: React.Dispatch<React.SetStateAction<string | null>>
  handleAddLane: () => Promise<void>
  handleUpdateLane: (laneId: string, updates: Partial<Lane>) => void
  handleLaneDrop: (targetLaneId: string) => void
  handleDropOnTimeline: (
    e: React.DragEvent,
    targetLaneId: string,
    targetItemId?: string,
  ) => Promise<void>
  handleUpdateOutlineItem: (itemId: string, updates: Partial<OutlineItem>) => void
}

/** Owns the StoryLanes / outline-item drag-and-drop slice — lane
 *  reordering, beat→lane drops, item→item insertion, and the layout
 *  pass that recomputes timelinePositions after every reorder. The
 *  beat side-effects (startPage/endPage updates) flow through
 *  pageMath so the hook stays unaware of category-specific page
 *  totals. */
export function useTimelineDnD({
  projectId,
  beats,
  setBeats,
  outlineItems,
  setOutlineItems,
  lanes,
  setLanes,
  pageMath,
  debouncedUpdateBeat,
  debouncedUpdateOutlineItem,
}: UseTimelineDnDOptions): UseTimelineDnDResult {
  void beats
  const [hoveredLane, setHoveredLane] = useState<string | null>(null)
  const [draggedLaneItem, setDraggedLaneItem] = useState<string | null>(null)
  const [draggedLaneId, setDraggedLaneId] = useState<string | null>(null)

  const handleUpdateLane = useCallback(
    (laneId: string, updates: Partial<Lane>) => {
      setLanes((currentLanes) =>
        currentLanes.map((lane) => (lane.id === laneId ? { ...lane, ...updates } : lane)),
      )
      updateLane(laneId, updates).catch((err) => {
        console.error("Failed to update lane name", err)
      })
    },
    [setLanes],
  )

  const handleLaneDrop = useCallback(
    (targetLaneId: string) => {
      if (draggedLaneId === null || draggedLaneId === targetLaneId) return
      let newLanes: Lane[] = []
      setLanes((currentLanes) => {
        const draggedLaneIndex = currentLanes.findIndex((l) => l.id === draggedLaneId)
        const targetLaneIndex = currentLanes.findIndex((l) => l.id === targetLaneId)
        newLanes = [...currentLanes]
        const [draggedLane] = newLanes.splice(draggedLaneIndex, 1)
        newLanes.splice(targetLaneIndex, 0, draggedLane)
        return newLanes
      })
      const orderedIds = newLanes.map((l) => l.id)
      updateLaneOrder(projectId, orderedIds).catch((err) => {
        console.error("Failed to update lane order", err)
      })
      setDraggedLaneId(null)
    },
    [draggedLaneId, projectId, setLanes],
  )

  const handleAddLane = useCallback(async () => {
    const newLaneData: Partial<Lane> = {
      name: "New Lane",
      color: "#e5e7eb",
      order: lanes.length,
    }

    try {
      const createdLane = await createLane(projectId, newLaneData)
      setLanes((currentLanes) => [...currentLanes, createdLane])
    } catch (err) {
      console.error("Failed to create new lane", err)
    }
  }, [lanes.length, projectId, setLanes])

  const handleUpdateOutlineItem = useCallback(
    (itemId: string, updates: Partial<OutlineItem>) => {
      setOutlineItems((prevItems) => {
        const newItems = prevItems.map((item) =>
          item.id === itemId ? { ...item, ...updates } : item,
        )
        if (updates.order !== undefined) {
          const changedItem = newItems.find((item) => item.id === itemId)
          if (changedItem) {
            return layoutLane(changedItem.laneId, newItems)
          }
        }
        return newItems
      })
      debouncedUpdateOutlineItem(itemId, updates)

      if (updates.timelinePosition !== undefined || updates.width !== undefined) {
        const item = outlineItems.find((i) => i.id === itemId)
        if (item) {
          const updatedItem = { ...item, ...updates }
          const position = updatedItem.timelinePosition || 0
          const width = updatedItem.width || 0
          const startPage = pageMath.getPageFromPosition(position)
          const endPage = pageMath.getPageFromPosition(position + width)
          debouncedUpdateBeat(item.beatId, { startPage, endPage })
          setBeats((prev) =>
            prev.map((b) => (b.id === item.beatId ? { ...b, startPage, endPage } : b)),
          )
        }
      }
    },
    [
      debouncedUpdateBeat,
      debouncedUpdateOutlineItem,
      outlineItems,
      pageMath,
      setBeats,
      setOutlineItems,
    ],
  )

  const handleDropOnTimeline = useCallback(
    async (e: React.DragEvent, targetLaneId: string, targetItemId?: string) => {
      e.preventDefault()
      setHoveredLane(null)
      setDraggedLaneItem(null)
      const beatId = e.dataTransfer.getData("text/plain")
      const outlineItemId = e.dataTransfer.getData("application/x-outline-item-id")
      if (beatId) {
        const currentLaneItems = outlineItems.filter((item) => item.laneId === targetLaneId)
        const beat = beats.find((b) => b.id === beatId)
        const startPage = beat?.startPage || 1
        const endPage = beat?.endPage || startPage
        const timelinePosition = pageMath.getPositionFromPage(startPage)
        const width = pageMath.getWidthFromPages(startPage, endPage)
        const newItemData: Partial<OutlineItem> = {
          beatId,
          laneId: targetLaneId,
          order: currentLaneItems.length,
          timelinePosition,
          width,
        }
        try {
          const createdItem = await createOutlineItem(projectId, newItemData)
          setOutlineItems((prevItems) => {
            const updatedItems = [...prevItems, createdItem]
            return layoutLane(targetLaneId, updatedItems)
          })
        } catch (err) {
          console.error("Failed to create outline item", err)
        }
      } else if (outlineItemId) {
        const draggedItem = outlineItems.find((item) => item.id === outlineItemId)
        if (!draggedItem) return
        let finalItems: OutlineItem[] = []
        const originalLaneId = draggedItem.laneId
        setOutlineItems((prevItems) => {
          const allItems = prevItems.filter((item) => item.id !== outlineItemId)
          const targetLaneItems = allItems
            .filter((item) => item.laneId === targetLaneId)
            .sort((a, b) => a.order - b.order)
          const targetItemIndex = targetItemId
            ? targetLaneItems.findIndex((item) => item.id === targetItemId)
            : -1
          const insertIndex =
            targetItemIndex !== -1 ? targetItemIndex : targetLaneItems.length
          targetLaneItems.splice(insertIndex, 0, { ...draggedItem, laneId: targetLaneId })
          const reorderedTargetLane = targetLaneItems.map((item, index) => ({
            ...item,
            order: index,
          }))
          const otherItems = allItems.filter((item) => item.laneId !== targetLaneId)
          finalItems = [...otherItems, ...reorderedTargetLane]
          finalItems = layoutLane(targetLaneId, finalItems)
          if (originalLaneId !== targetLaneId) {
            finalItems = layoutLane(originalLaneId, finalItems)
          }
          return finalItems
        })
        const finalDraggedItemState = finalItems.find((item) => item.id === outlineItemId)
        if (finalDraggedItemState) {
          updateOutlineItem(outlineItemId, {
            laneId: finalDraggedItemState.laneId,
            order: finalDraggedItemState.order,
          }).catch((err) => console.error("Failed to update moved item", err))
        }
      }
    },
    [beats, outlineItems, pageMath, projectId, setOutlineItems],
  )

  return {
    hoveredLane,
    setHoveredLane,
    draggedLaneItem,
    setDraggedLaneItem,
    draggedLaneId,
    setDraggedLaneId,
    handleAddLane,
    handleUpdateLane,
    handleLaneDrop,
    handleDropOnTimeline,
    handleUpdateOutlineItem,
  }
}

/** Recomputes timelinePosition for every item in a lane after a
 *  reorder. Items are laid out with a 0.5% gap so consecutive cards
 *  don't visually fuse. Pure — returns a fresh array, doesn't mutate. */
function layoutLane(laneId: string, items: OutlineItem[]): OutlineItem[] {
  const laneItems = items
    .filter((item) => item.laneId === laneId)
    .sort((a, b) => a.order - b.order)
  let currentPosition = 0
  const gapPercentage = 0.5
  const updatedLaneItemsWithLayout = laneItems.map((item) => {
    const newItem = { ...item, timelinePosition: currentPosition }
    currentPosition += (item.width || 5) + gapPercentage
    return newItem
  })
  const otherItems = items.filter((item) => item.laneId !== laneId)
  return [...otherItems, ...updatedLaneItemsWithLayout]
}
