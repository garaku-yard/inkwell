import { apiClient } from "@/lib/api"

import type { Character, CharacterStorage } from "@/lib/storage"

// ─── Characters ──────────────────────────────────────────────────────────

export const characters: CharacterStorage = {
  create: async (projectId, _userId, input) => {
    const response = await apiClient<{ character: Character }>("characters", {
      method: "POST",
      body: { project_id: projectId, ...input },
    })
    return response.character
  },

  listForProject: async (projectId, _userId) => {
    const response = await apiClient<{ characters: Character[] }>(
      `characters?project_id=${encodeURIComponent(projectId)}`,
      { method: "GET" },
    )
    return response.characters
  },

  update: async (characterId, _userId, input) => {
    const response = await apiClient<{ character: Character }>(`characters/${encodeURIComponent(characterId)}`, {
      method: "PUT",
      body: input,
    })
    return response.character
  },

  delete: async (characterId, _userId) => {
    await apiClient(`characters/${encodeURIComponent(characterId)}`, { method: "DELETE" })
  },
}
