import type { Character } from "@/services/project"

// ─── Characters & locations ───────────────────────────────────────────────

export interface CreateCharacterInput {
  name: string
  description?: string
  role?: string
  attributes?: Record<string, string>
}

export interface CharacterStorage {
  create(projectId: string, userId: string, input: CreateCharacterInput): Promise<Character>
  listForProject(projectId: string, userId: string): Promise<Character[]>
}
