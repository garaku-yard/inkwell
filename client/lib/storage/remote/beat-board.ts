import { apiClient } from "@/lib/api"

import type {
  Beat,
  BeatBoardData,
  BeatBoardStorage,
  Connection,
  Drawing,
  Lane,
  OutlineItem,
} from "@/lib/storage"

// ─── Beat board ───────────────────────────────────────────────────────────

export const beatBoard: BeatBoardStorage = {
  getBoard: (projectId) =>
    apiClient<BeatBoardData>(`projects/${projectId}/beat-board`),

  createBeat: (projectId, input) =>
    apiClient<Beat>(`projects/${projectId}/beat-board/beats`, { method: "POST", body: input }),
  updateBeat: (beatId, patch) =>
    apiClient<Beat>(`beats/${beatId}`, { method: "PATCH", body: patch }),
  deleteBeat: async (beatId) => {
    await apiClient<void>(`beats/${beatId}`, { method: "DELETE" })
  },

  createConnection: (projectId, input) =>
    apiClient<Connection>(`projects/${projectId}/beat-board/connections`, {
      method: "POST",
      body: input,
    }),
  deleteConnection: async (connectionId) => {
    await apiClient<void>(`connections/${connectionId}`, { method: "DELETE" })
  },

  createLane: (projectId, input) =>
    apiClient<Lane>(`projects/${projectId}/beat-board/lanes`, { method: "POST", body: input }),
  updateLane: async (laneId, patch) => {
    await apiClient<void>(`lanes/${laneId}`, { method: "PATCH", body: patch })
  },
  updateLaneOrder: async (projectId, orderedIds) => {
    await apiClient<void>(`projects/${projectId}/beat-board/lanes/order`, {
      method: "PATCH",
      body: { orderedIds },
    })
  },

  createOutlineItem: (projectId, input) =>
    apiClient<OutlineItem>(`projects/${projectId}/beat-board/outline-items`, {
      method: "POST",
      body: input,
    }),
  updateOutlineItem: async (itemId, patch) => {
    await apiClient<void>(`outline-items/${itemId}`, { method: "PATCH", body: patch })
  },
  deleteOutlineItem: async (itemId) => {
    await apiClient<void>(`outline-items/${itemId}`, { method: "DELETE" })
  },

  createDrawing: (projectId, input) =>
    apiClient<Drawing>(`projects/${projectId}/beat-board/drawings`, {
      method: "POST",
      body: input,
    }),
  updateDrawing: (drawingId, patch) =>
    apiClient<Drawing>(`drawings/${drawingId}`, { method: "PATCH", body: patch }),
  deleteDrawing: async (drawingId) => {
    await apiClient<void>(`drawings/${drawingId}`, { method: "DELETE" })
  },
}
