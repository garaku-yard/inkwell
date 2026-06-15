import { apiClient } from "@/lib/api"

import type { Character, CharacterStorage } from "@/lib/storage"

// ─── Characters ──────────────────────────────────────────────────────────

export const characters: CharacterStorage = {
  create: async (projectId, userId, input) => {
    const response = await apiClient<{ character: Character }>("characters", {
      method: "POST",
      body: { project_id: projectId, user_id: userId, ...input },
    })
    return response.character
  },

  listForProject: async (projectId, userId) => {
    const response = await apiClient<{ characters: Character[] }>(
      `characters?project_id=${projectId}&user_id=${userId}`,
      { method: "GET" },
    )
    return response.characters
  },
}
