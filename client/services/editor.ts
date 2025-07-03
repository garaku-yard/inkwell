// client/services/editorService.ts

import { apiClient } from "@/lib/api";
import { ScriptElement } from "./project";

export interface CreateElementRequest {
  sceneId: string;
  elementOrder: number;
  elementType: ScriptElement['elementType'];
  content: string;
  characterId?: string | null;
}

export interface UpdateElementRequest {
  content?: string;
  elementType?: ScriptElement['elementType'];
}

/**
 * Creates a new script element within a scene.
 */
export const createScriptElement = (elementData: CreateElementRequest): Promise<ScriptElement> => {
  return apiClient<ScriptElement>(`scenes/${elementData.sceneId}/elements`, {
    method: "POST",
    body: elementData,
  });
};

/**
 * Updates an existing script element.
 */
export const updateScriptElement = (elementId: string, updateData: UpdateElementRequest): Promise<ScriptElement> => {
  return apiClient<ScriptElement>(`elements/${elementId}`, {
    method: "PATCH",
    body: updateData,
  });
};

/**
 * Deletes a script element.
 */
export const deleteScriptElement = (elementId: string): Promise<void> => {
  return apiClient<void>(`elements/${elementId}`, {
    method: "DELETE",
  });
};
