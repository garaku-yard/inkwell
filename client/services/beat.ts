/** Beat service — beat cards, connections, and full beat-board data. */
import { apiClient } from "@/lib/api";
import { Lane, OutlineItem } from "./beat-board";

/** Aggregate payload returned by the beat-board endpoint. */
export interface BeatBoardData {
  /** All beat cards on the canvas. */
  beats: Beat[];
  /** Directed edges connecting beat cards. */
  connections: Connection[];
  /** Swim lanes used to organise beats on the timeline. */
  lanes: Lane[];
  /** Beat placements within lanes on the timeline. */
  outlineItems: OutlineItem[];
}

/** A story beat represented as a card on the free-form canvas. */
export interface Beat {
  /** UUID of the beat. */
  id: string;
  /** Short title displayed on the card. */
  title: string;
  /** Longer description or summary of the beat. */
  description: string;
  /** Comma-separated scene numbers this beat maps to in the script. */
  sceneNumbers: string;
  /** Hex colour string used to tint the card (e.g. `"#FF5733"`). */
  color: string;
  /** Canvas position in pixels (`x` = left, `y` = top). */
  position: { x: number; y: number };
  /** Card width in pixels. */
  width: number;
  /** Card height in pixels. */
  height: number;
  /** Act number this beat belongs to (1, 2, or 3 for three-act structure). */
  act: number;
  /** Sort order among beats in the same act. */
  order: number;
  /** Script page where this beat begins, or `null` if unset. */
  startPage: number | null;
  /** Script page where this beat ends, or `null` if unset. */
  endPage: number | null;
  /** Optional URL to an image attached to the beat card. */
  imageUrl?: string;
}

/** A directed edge between two beat cards on the canvas. */
export interface Connection {
  /** UUID of the connection. */
  id: string;
  /** UUID of the beat this edge originates from. */
  fromId: string;
  /** UUID of the beat this edge points to. */
  toId: string;
  /** Side of the source beat card where the edge attaches. */
  fromSide: "top" | "right" | "bottom" | "left";
  /** Side of the target beat card where the edge attaches. */
  toSide: "top" | "right" | "bottom" | "left";
}

/**
 * Fetches all beat-board data for a project in a single call: beats,
 * connections, lanes, and outline items.
 *
 * @param projectId - UUID of the project.
 * @returns A promise that resolves to the complete beat-board aggregate.
 *
 * @example
 * ```ts
 * const { beats, connections, lanes } = await getBeatBoardForProject(projectId);
 * ```
 */
export const getBeatBoardForProject = (projectId: string): Promise<BeatBoardData> => {
  return apiClient<BeatBoardData>(`projects/${projectId}/beat-board`);
};

/**
 * Creates a new beat card on the project's beat board. Position and size
 * values are in pixels relative to the top-left corner of the canvas.
 *
 * @param projectId - UUID of the parent project.
 * @param beatData - Partial beat properties; `position`, `width`, and `height`
 *   are in pixels.
 * @returns A promise that resolves to the newly created beat.
 */
export const createBeat = (projectId: string, beatData: Partial<Beat>): Promise<Beat> => {
  return apiClient<Beat>(`projects/${projectId}/beats`, {
    method: "POST",
    body: beatData,
  });
};

/**
 * Permanently deletes a beat card. Connections referencing this beat are
 * removed by the server before the beat is deleted.
 *
 * @param beatId - UUID of the beat to delete.
 * @returns A promise that resolves when the deletion is complete.
 */
export const deleteBeat = (beatId: string): Promise<void> => {
  return apiClient<void>(`beats/${beatId}`, {
    method: "DELETE",
  });
};

/**
 * Applies partial updates to a beat's content, position, size, or colour.
 * Position and size fields are in pixels.
 *
 * @param beatId - UUID of the beat to update.
 * @param beatData - Partial beat properties to change.
 * @returns A promise that resolves to the updated beat.
 */
export const updateBeat = (beatId: string, beatData: Partial<Beat>): Promise<Beat> => {
  return apiClient<Beat>(`beats/${beatId}`, {
    method: "PATCH",
    body: beatData,
  });
};

/**
 * Creates a new directed edge between two beats on the canvas. `fromSide` and
 * `toSide` indicate which side of each card the edge attaches to.
 *
 * @param projectId - UUID of the parent project.
 * @param connData - Partial connection properties including `fromId`, `toId`,
 *   `fromSide`, and `toSide`.
 * @returns A promise that resolves to the newly created connection.
 *
 * @example
 * ```ts
 * const conn = await createConnection(projectId, {
 *   fromId: beatA.id, fromSide: "right",
 *   toId: beatB.id,   toSide: "left",
 * });
 * ```
 */
export const createConnection = (projectId: string, connData: Partial<Connection>): Promise<Connection> => {
  return apiClient<Connection>(`projects/${projectId}/connections`, {
    method: "POST",
    body: connData,
  });
};

/**
 * Permanently deletes a connection between two beats.
 *
 * @param connectionId - UUID of the connection to delete.
 * @returns A promise that resolves when the deletion is complete.
 */
export const deleteConnection = (connectionId: string): Promise<void> => {
  return apiClient<void>(`connections/${connectionId}`, {
    method: "DELETE",
  });
};
