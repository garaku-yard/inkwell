import type { Scene } from "@/services/project"

// ─── Scenes & elements ────────────────────────────────────────────────────

/** Fields accepted when creating a new scene. Mirrors what the scripts service
 *  expects; `outline_unit_id` and `order_index` are optional. */
export interface CreateSceneInput {
  scene_heading: string
  content?: string
  outline_unit_id?: string
  order_index?: number
}

export interface SceneStorage {
  create(projectId: string, userId: string, input: CreateSceneInput): Promise<Scene>
  listForProject(projectId: string, userId: string): Promise<Scene[]>
  updateHeading(sceneId: string, userId: string, heading: string): Promise<Scene>
  updateContent(sceneId: string, userId: string, content: string): Promise<Scene>
  delete(sceneId: string): Promise<void>
}
