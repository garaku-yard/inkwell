import type { Beat, BeatBoardData, Connection } from "@/services/beat"
import type { Lane, OutlineItem } from "@/services/beat-board"

// ─── Beat board ───────────────────────────────────────────────────────────

export interface BeatBoardStorage {
  /** Load the entire board for a project — beats, connections, lanes, outline
   *  items — in one call. */
  getBoard(projectId: string): Promise<BeatBoardData>

  createBeat(projectId: string, input: Partial<Beat>): Promise<Beat>
  updateBeat(beatId: string, patch: Partial<Beat>): Promise<Beat>
  deleteBeat(beatId: string): Promise<void>

  createConnection(projectId: string, input: Partial<Connection>): Promise<Connection>
  deleteConnection(connectionId: string): Promise<void>

  createLane(projectId: string, input: Partial<Lane>): Promise<Lane>
  updateLane(laneId: string, patch: Partial<Lane>): Promise<void>
  updateLaneOrder(projectId: string, orderedIds: string[]): Promise<void>

  createOutlineItem(projectId: string, input: Partial<OutlineItem>): Promise<OutlineItem>
  updateOutlineItem(itemId: string, patch: Partial<OutlineItem>): Promise<void>
  deleteOutlineItem(itemId: string): Promise<void>
}
