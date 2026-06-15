import { apiClient } from "@/lib/api"

import type { FullProject, Project, ProjectStorage } from "@/lib/storage"
import { projectsHelpers } from "./shared"

// ─── Projects ─────────────────────────────────────────────────────────────

export const projects: ProjectStorage = {
  create: async (input) => {
    const response = await apiClient<{ project: Project }>("projects", {
      method: "POST",
      body: input,
    })
    return response.project
  },

  getById: async (projectId, userId) => {
    const response = await apiClient<{ project: Project }>(
      `projects/${projectId}?user_id=${userId}`,
      { method: "GET" },
    )
    return response.project
  },

  getFull: async (projectId, userId) => {
    const projectResponse = await apiClient<{ project: Project }>(
      `projects/${projectId}?user_id=${userId}`,
      { method: "GET" },
    )

    const scenes = await projectsHelpers.listSceneArray(projectId, userId)
    const allComments = await projectsHelpers.listCommentArray(projectId)

    const scenesWithElements = await Promise.all(
      scenes.map(async (scene) => {
        try {
          const elements = await projectsHelpers.listElementsForScene(scene.id, userId)
          const elementsWithComments = elements.map((el) => ({
            ...el,
            comments: allComments.filter(
              (c) => c.elementId === el.id && !c.isScene,
            ),
          }))
          const sceneComments = allComments.filter(
            (c) => c.elementId === scene.id && c.isScene,
          )
          return { ...scene, elements: elementsWithComments, comments: sceneComments }
        } catch (err) {
          console.warn(`Failed to load elements for scene ${scene.id}:`, err)
          return { ...scene, elements: [], comments: [] }
        }
      }),
    )

    const full: FullProject = { ...projectResponse.project, scenes: scenesWithElements }
    return full
  },

  listOwned: async (userId) => {
    const response = await apiClient<{
      projects: (Project & { collaborator_count?: number })[]
      pagination?: { total_items: number }
    }>(`projects?user_id=${userId}`, { method: "GET" })
    return {
      projects: response.projects,
      total: response.pagination?.total_items ?? response.projects.length,
    }
  },

  listShared: async () => {
    const response = await apiClient<{ projects: Project[] }>("projects/shared", {
      method: "GET",
    })
    return response.projects ?? []
  },

  update: async (projectId, userId, patch) => {
    const response = await apiClient<{ project: Project }>(`projects/${projectId}`, {
      method: "PUT",
      body: { ...patch, user_id: userId },
    })
    return response.project
  },

  toggleStar: async (projectId, userId) => {
    const response = await apiClient<{ project: Project }>(
      `projects/${projectId}/star`,
      { method: "PATCH", body: { user_id: userId } },
    )
    return response.project
  },

  delete: async (projectId, userId) => {
    await apiClient<void>(`projects/${projectId}`, {
      method: "DELETE",
      body: { user_id: userId },
    })
  },
}
