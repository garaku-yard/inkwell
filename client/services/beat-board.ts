/** Beat-board service — lanes, outline items, and their ordering. */
import { apiClient } from "@/lib/api";

/** A swim lane that groups beats by story thread or character arc on the timeline. */
export interface Lane {
  /** UUID of the lane. */
  id: string;
  /** Display name shown as the row label. */
  name: string;
  /** Hex colour string used to tint the lane header (e.g. `"#3B82F6"`). */
  color: string;
  /** 0-based vertical position among sibling lanes. */
  order: number;
}

/** A beat placed on a lane at a specific position on the timeline. */
export interface OutlineItem {
  /** UUID of the outline item. */
  id: string;
  /** UUID of the parent project. */
  projectId: string;
  /** UUID of the beat this item represents on the timeline. */
  beatId: string;
  /** UUID of the lane this item belongs to. */
  laneId: string;
  /** Sort order among items within the same lane. */
  order: number;
  /**
   * Fractional horizontal position within the lane (0.0 = far left,
   * 1.0 = far right).
   */
  timelinePosition?: number;
  /** Width of the item on the timeline expressed as the same fractional unit as `timelinePosition`. */
  width?: number;
}

/**
 * Applies partial updates to a lane's name, colour, or sort order.
 *
 * @param laneId - UUID of the lane to update.
 * @param updates - Partial lane properties to change.
 * @returns A promise that resolves when the update is complete.
 */
export const updateLane = (laneId: string, updates: Partial<Lane>): Promise<void> => {
  return apiClient<void>(`lanes/${laneId}`, {
    method: "PATCH",
    body: updates,
  });
};

/**
 * Reorders all lanes for a project in a single atomic call. The array must
 * contain every lane ID for the project in the new desired order.
 *
 * @param projectId - UUID of the project.
 * @param orderedIds - All lane UUIDs in their new vertical order.
 * @returns A promise that resolves when the reorder is complete.
 */
export const updateLaneOrder = (projectId: string, orderedIds: string[]): Promise<void> => {
  return apiClient<void>(`projects/${projectId}/lanes/order`, {
    method: "PATCH",
    body: { orderedIds },
  });
};

/**
 * Creates a new outline item, placing a beat on a lane at a specific position
 * on the timeline.
 *
 * @param projectId - UUID of the parent project.
 * @param itemData - Beat ID, lane ID, and optional position/width (fractional, 0–1).
 * @returns A promise that resolves to the newly created outline item.
 */
export const createOutlineItem = (projectId: string, itemData: Partial<OutlineItem>): Promise<OutlineItem> => {
  return apiClient<OutlineItem>(`projects/${projectId}/beat-board/outline-items`, {
    method: "POST",
    body: itemData,
  });
};

/**
 * Applies partial updates to an outline item's position, width, order, or lane.
 * `timelinePosition` and `width` are fractional values in the range 0–1.
 *
 * @param itemId - UUID of the outline item to update.
 * @param updates - Partial outline item properties to change.
 * @returns A promise that resolves when the update is complete.
 */
export const updateOutlineItem = (itemId: string, updates: Partial<OutlineItem>): Promise<void> => {
  return apiClient<void>(`outline-items/${itemId}`, {
    method: "PATCH",
    body: updates,
  });
};

/**
 * Removes a beat's placement from its lane on the timeline. The beat card
 * itself is not deleted.
 *
 * @param itemId - UUID of the outline item to delete.
 * @returns A promise that resolves when the deletion is complete.
 */
export const deleteOutlineItem = (itemId: string): Promise<void> => {
  return apiClient<void>(`outline-items/${itemId}`, {
    method: "DELETE",
  });
};

/**
 * Creates a new swim lane for a project.
 *
 * @param projectId - UUID of the project to add the lane to.
 * @param laneData - Partial lane properties (name, colour, and initial order).
 * @returns A promise that resolves to the newly created lane.
 */
export const createLane = (projectId: string, laneData: Partial<Lane>): Promise<Lane> => {
  return apiClient<Lane>(`projects/${projectId}/lanes`, {
    method: "POST",
    body: laneData,
  });
};
