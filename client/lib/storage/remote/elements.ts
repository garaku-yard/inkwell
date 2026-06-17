import { apiClient } from "@/lib/api"

import type { ElementStorage, ProjectElement } from "@/lib/storage"
import { projectsHelpers } from "./shared"

// ─── Elements ─────────────────────────────────────────────────────────────

export const elements: ElementStorage = {
  create: async (input) =>
    // Gateway POST /elements expects flat snake_case body with both
    // scene_id and project_id (the gRPC contract requires both — the
    // service doesn't derive project membership from scene id). The
    // local SQLite impl ignores projectId and looks it up via SQL,
    // so the desktop path doesn't depend on this contract.
    apiClient<ProjectElement>(`elements`, {
      method: "POST",
      body: {
        project_id: input.projectId,
        scene_id: input.sceneId,
        element_type: input.elementType,
        content: input.content,
        line_number: input.elementOrder,
        formatting: {},
      },
    }),

  listForScene: (sceneId, userId) => projectsHelpers.listElementsForScene(sceneId, userId),

  update: async (elementId, patch) =>
    apiClient<ProjectElement>(`elements/${elementId}`, {
      method: "PATCH",
      body: patch,
    }),

  delete: async (elementId) => {
    await apiClient<void>(`elements/${elementId}`, { method: "DELETE" })
  },

  listForProject: async (projectId, userId, startLine, endLine) => {
    let url = `script-elements?project_id=${projectId}&user_id=${userId}`
    if (startLine !== undefined) url += `&start_line=${startLine}`
    if (endLine !== undefined) url += `&end_line=${endLine}`
    const response = await apiClient<{ script_elements: ProjectElement[] }>(url, {
      method: "GET",
    })
    return response.script_elements
  },
}
