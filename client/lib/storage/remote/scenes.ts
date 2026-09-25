import { apiClient } from "@/lib/api"

import type { Scene, SceneStorage } from "@/lib/storage"
import { projectsHelpers } from "./shared"

// ─── Scenes ───────────────────────────────────────────────────────────────

export const scenes: SceneStorage = {
  create: async (projectId, userId, input) => {
    const response = await apiClient<{ scene: Scene }>("scenes", {
      method: "POST",
      body: { project_id: projectId, user_id: userId, ...input },
    })
    return response.scene
  },

  listForProject: (projectId, userId) => projectsHelpers.listSceneArray(projectId, userId),

  updateHeading: async (sceneId, userId, heading) => {
    const response = await apiClient<{ scene: Scene }>(`scenes/${sceneId}`, {
      method: "PUT",
      body: { user_id: userId, scene_heading: heading },
    })
    return response.scene
  },

  updateContent: async (sceneId, _userId, content) => {
    const response = await apiClient<{ scene: Scene }>(`scenes/${encodeURIComponent(sceneId)}`, {
      method: "PATCH",
      body: { content },
    })
    return response.scene
  },

  delete: async (sceneId) => {
    await apiClient<void>(`scenes/${sceneId}`, { method: "DELETE" })
  },
}
