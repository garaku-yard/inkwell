import { apiClient } from "@/lib/api"

import type { ElementStorage, ProjectElement } from "@/lib/storage"
import { projectsHelpers } from "./shared"

// ─── Elements ─────────────────────────────────────────────────────────────

export const elements: ElementStorage = {
  create: async (input) => {
    // Gateway POST /elements expects flat snake_case body with both
    // scene_id and project_id (the gRPC contract requires both — the
    // service doesn't derive project membership from scene id). The
    // local SQLite impl ignores projectId and looks it up via SQL,
    // so the desktop path doesn't depend on this contract.
    // The gateway wraps the created element as `{ element: … }`; unwrap it so
    // callers get a ProjectElement (with its id + content), matching the local
    // impl — otherwise optimistic renders that read .id/.content break.
    const res = await apiClient<{ element: ProjectElement }>(`elements`, {
      method: "POST",
      body: {
        project_id: input.projectId,
        scene_id: input.sceneId,
        element_type: input.elementType,
        content: input.content,
        line_number: input.elementOrder,
        formatting: {},
      },
    })
    return res.element
  },

  listForScene: (sceneId, userId) => projectsHelpers.listElementsForScene(sceneId, userId),

  update: async (elementId, patch) => {
    // Same `{ element: … }` envelope as create — unwrap to a ProjectElement.
    const res = await apiClient<{ element: ProjectElement }>(`elements/${elementId}`, {
      method: "PATCH",
      body: patch,
    })
    return res.element
  },

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
