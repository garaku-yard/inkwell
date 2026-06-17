/**
 * Shared remote-storage helpers used by more than one domain file.
 * Single-domain helpers live in their own domain file instead.
 */

import { apiClient } from "@/lib/api"

import type { Comment, Scene, ProjectElement } from "@/lib/storage"

// Helpers reused by getFull. Defined outside the struct so nested method
// references don't get tripped up by the interface typing.
export const projectsHelpers = {
  async listSceneArray(projectId: string, userId: string): Promise<Scene[]> {
    const response = await apiClient<{ scenes: Scene[] }>(
      `scenes?project_id=${projectId}&user_id=${userId}`,
      { method: "GET" },
    )
    return response.scenes
  },

  async listCommentArray(screenplayId: string): Promise<Comment[]> {
    const response = await apiClient<Array<{
      id: string
      script_element_id?: string
      scene_id?: string
      user_id: string
      username: string
      content: string
      is_resolved: boolean
      created_at: string
    }>>(`comments?screenplay_id=${screenplayId}`, { method: "GET" })
    return response.map((c) => ({
      id: c.id,
      userName: c.username || `User ${c.user_id.slice(0, 8)}`,
      content: c.content,
      timestamp: c.created_at,
      isResolved: c.is_resolved,
      elementId: c.script_element_id || c.scene_id,
      isScene: !!c.scene_id,
    }))
  },

  async listElementsForScene(sceneId: string, userId: string): Promise<ProjectElement[]> {
    const response = await apiClient<{ elements: ProjectElement[] }>(
      `elements?scene_id=${sceneId}&user_id=${userId}`,
      { method: "GET" },
    )
    return response.elements
  },
}
