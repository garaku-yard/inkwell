import { apiClient } from "@/lib/api"

import type { Location, LocationStorage } from "@/lib/storage"

// ─── Locations ───────────────────────────────────────────────────────────

export const locations: LocationStorage = {
  create: async (projectId, userId, input) => {
    const response = await apiClient<{ location: Location }>("locations", {
      method: "POST",
      body: { project_id: projectId, user_id: userId, ...input },
    })
    return response.location
  },

  listForProject: async (projectId, userId) => {
    const response = await apiClient<{ locations: Location[] }>(
      `locations?project_id=${projectId}&user_id=${userId}`,
      { method: "GET" },
    )
    return response.locations
  },
}
