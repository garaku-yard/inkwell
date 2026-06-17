/** Editor service — thin wrappers around the Storage abstraction for the
 *  create/update/delete flows used by the editor UI. */
import { getStorage } from "@/lib/storage"
import type { ScriptElement } from "./project"

export interface CreateElementRequest {
  /** Required by the remote gateway, which doesn't derive project
   *  membership from scene id (the gRPC contract requires both).
   *  The local SQLite impl ignores this field and looks up project_id
   *  via the scene row, so it's safe to pass an empty string from
   *  desktop-only call paths if absolutely necessary — though every
   *  current caller already has it available. */
  projectId: string
  sceneId: string
  elementOrder: number
  elementType: ScriptElement["element_type"]
  content: string
}

export interface UpdateElementRequest {
  content?: string
  elementType?: ScriptElement["element_type"]
}

export const updateScriptElement = (
  elementId: string,
  updateData: UpdateElementRequest,
): Promise<ScriptElement> => getStorage().elements.update(elementId, updateData)

export const deleteScriptElement = (elementId: string): Promise<void> =>
  getStorage().elements.delete(elementId)

export const deleteScene = (sceneId: string): Promise<void> =>
  getStorage().scenes.delete(sceneId)
