import { apiClient } from "@/lib/api";
import { Lane, OutlineItem } from "./beat-board";

export interface BeatBoardData {
  beats: Beat[];
  connections: Connection[];
  lanes: Lane[]; // Add this
  outlineItems: OutlineItem[]; // Add this
}

export interface Beat {
  id: string
  title: string
  description: string
  sceneNumbers: string // DEPRECATED: Use startPage and endPage
  color: string
  position: { x: number; y: number }
  width: number
  height: number
  act: number
  order: number
  startPage: number | null
  endPage: number | null
  imageUrl?: string
}

export interface Connection {
  id: string
  fromId: string
  toId: string
  fromSide: "top" | "right" | "bottom" | "left"
  toSide: "top" | "right" | "bottom" | "left"
}

/**
 * Fetches all data for the beat board for a specific project.
 */
export const getBeatBoardForProject = (projectId: string): Promise<BeatBoardData> => {
  return apiClient<BeatBoardData>(`projects/${projectId}/beat-board`);
};

/**
 * Creates a new beat for a project.
 */
export const createBeat = (projectId: string, beatData: Partial<Beat>): Promise<Beat> => {
  return apiClient<Beat>(`projects/${projectId}/beats`, {
    method: "POST",
    body: beatData,
  });
};

/**
 * Deletes a beat.
 */
export const deleteBeat = (beatId: string): Promise<void> => {
  return apiClient<void>(`beats/${beatId}`, {
    method: "DELETE",
  });
};

/**
 * Updates a beat's properties (content, position, size, color, etc.).
 */
export const updateBeat = (beatId: string, beatData: Partial<Beat>): Promise<Beat> => {
  return apiClient<Beat>(`beats/${beatId}`, {
    method: "PATCH",
    body: beatData,
  });
};

/**
 * Creates a new connection between two beats.
 */
export const createConnection = (projectId: string, connData: Partial<Connection>): Promise<Connection> => {
  return apiClient<Connection>(`projects/${projectId}/connections`, {
    method: "POST",
    body: connData,
  });
};

/**
 * Deletes a connection.
 */
export const deleteConnection = (connectionId: string): Promise<void> => {
  return apiClient<void>(`connections/${connectionId}`, {
    method: "DELETE",
  });
};
