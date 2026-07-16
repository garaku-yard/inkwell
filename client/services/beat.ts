/** Beat service — thin wrappers around the Storage abstraction for beat cards
 *  and connections on the beat board. */
import { getStorage } from "@/lib/storage"
import type { Drawing, Lane, OutlineItem } from "./beat-board"

export interface BeatBoardData {
  beats: Beat[]
  connections: Connection[]
  lanes: Lane[]
  outlineItems: OutlineItem[]
  drawings: Drawing[]
}

export interface Beat {
  id: string
  title: string
  description: string
  sceneNumbers: string
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

export const getBeatBoardForProject = (projectId: string): Promise<BeatBoardData> =>
  getStorage().beatBoard.getBoard(projectId)

export const createBeat = (projectId: string, beatData: Partial<Beat>): Promise<Beat> =>
  getStorage().beatBoard.createBeat(projectId, beatData)

export const deleteBeat = (beatId: string): Promise<void> =>
  getStorage().beatBoard.deleteBeat(beatId)

export const updateBeat = (beatId: string, beatData: Partial<Beat>): Promise<Beat> =>
  getStorage().beatBoard.updateBeat(beatId, beatData)

export const createConnection = (
  projectId: string,
  connData: Partial<Connection>,
): Promise<Connection> => getStorage().beatBoard.createConnection(projectId, connData)

export const deleteConnection = (connectionId: string): Promise<void> =>
  getStorage().beatBoard.deleteConnection(connectionId)
