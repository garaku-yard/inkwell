import type { ScriptElement } from "@/services/project"
import type {
  CreateElementRequest,
  UpdateElementRequest,
} from "@/services/editor"

export interface ElementStorage {
  /** Create via the scene-level endpoint (used by the editor). */
  create(input: CreateElementRequest): Promise<ScriptElement>
  listForScene(sceneId: string, userId: string): Promise<ScriptElement[]>
  update(elementId: string, patch: UpdateElementRequest): Promise<ScriptElement>
  delete(elementId: string): Promise<void>
  /** Range query used by the outline editor when only a line window is visible. */
  listForProject(projectId: string, userId: string, startLine?: number, endLine?: number): Promise<ScriptElement[]>
}
