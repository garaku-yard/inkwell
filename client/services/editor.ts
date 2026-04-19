/** Editor service — thin wrappers around the Storage abstraction for the
 *  create/update/delete flows used by the editor UI. */
import { getStorage } from "@/lib/storage"
import type { ScriptElement } from "./project"

export interface CreateElementRequest {
  sceneId: string
  elementOrder: number
  elementType: ScriptElement["element_type"]
  content: string
  characterId?: string | null
}

export interface UpdateElementRequest {
  content?: string
  elementType?: ScriptElement["element_type"]
}

export const createScriptElement = (elementData: CreateElementRequest): Promise<ScriptElement> =>
  getStorage().elements.create(elementData)

export const updateScriptElement = (
  elementId: string,
  updateData: UpdateElementRequest,
): Promise<ScriptElement> => getStorage().elements.update(elementId, updateData)

export const deleteScriptElement = (elementId: string): Promise<void> =>
  getStorage().elements.delete(elementId)

export const deleteScene = (sceneId: string): Promise<void> =>
  getStorage().scenes.delete(sceneId)
