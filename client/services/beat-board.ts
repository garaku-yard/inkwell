import { apiClient } from "@/lib/api";


export interface Lane {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface OutlineItem {
  id: string;
  projectId: string;
  beatId: string;
  laneId: string;
  order: number;
  timelinePosition?: number;
  width?: number;
}


/**
 * Updates a lane's properties (e.g., its name).
 * @param laneId The ID of the lane to update.
 * @param updates A partial object of the lane's properties to update.
 */
export const updateLane = (laneId: string, updates: Partial<Lane>): Promise<void> => {
  return apiClient<void>(`lanes/${laneId}`, {
    method: "PATCH",
    body: updates,
  });
};

/**
 * Updates the vertical order of all lanes for a project.
 * @param projectId The ID of the project.
 * @param orderedIds An array of lane IDs in their new desired order.
 */
export const updateLaneOrder = (projectId: string, orderedIds: string[]): Promise<void> => {
  return apiClient<void>(`projects/${projectId}/lanes/order`, {
    method: "PATCH",
    body: { orderedIds },
  });
};

/**
 * Creates a new outline item and links it to a beat and a lane.
 * @param itemData The data for the new outline item.
 */
export const createOutlineItem = (itemData: Partial<OutlineItem>): Promise<OutlineItem> => {
  return apiClient<OutlineItem>(`outline-items`, {
    method: "POST",
    body: itemData,
  });
};

/**
 * Updates an outline item's properties (e.g., position, width, order, lane).
 * @param itemId The ID of the outline item to update.
 * @param updates A partial object of the item's properties to update.
 */
export const updateOutlineItem = (itemId: string, updates: Partial<OutlineItem>): Promise<void> => {
  return apiClient<void>(`outline-items/${itemId}`, {
    method: "PATCH",
    body: updates,
  });
};

/**
 * Deletes an outline item.
 * @param itemId The ID of the outline item to delete.
 */
export const deleteOutlineItem = (itemId: string): Promise<void> => {
  return apiClient<void>(`outline-items/${itemId}`, {
    method: "DELETE",
  });
};

/**
 * Creates a new lane for a project.
 * @param projectId The ID of the project to add the lane to.
 * @param laneData The partial data for the new lane.
 */
export const createLane = (projectId: string, laneData: Partial<Lane>): Promise<Lane> => {
  return apiClient<Lane>(`projects/${projectId}/lanes`, {
    method: "POST",
    body: laneData,
  });
};
