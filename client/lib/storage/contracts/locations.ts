import type { Location } from "@/services/project"

export interface CreateLocationInput {
  name: string
  description?: string
  type?: string
}

export interface LocationStorage {
  create(projectId: string, userId: string, input: CreateLocationInput): Promise<Location>
  listForProject(projectId: string, userId: string): Promise<Location[]>
}
