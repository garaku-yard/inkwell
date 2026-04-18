/** Editor service — create, update, and delete script elements and scenes from the editor. */
import { apiClient } from "@/lib/api";
import { ScriptElement } from "./project";

/** Payload for creating a new script element from the editor. */
export interface CreateElementRequest {
  /** UUID of the parent scene. */
  sceneId: string;
  /** 0-based insertion index within the scene (used as `line_number`). */
  elementOrder: number;
  /** Screenplay element type (e.g. `"ACTION"`, `"CHARACTER"`, `"DIALOG"`). */
  elementType: ScriptElement['element_type'];
  /** Text content of the element. */
  content: string;
  /** UUID of the character to associate with dialogue elements, if any. */
  characterId?: string | null;
}

/** Payload for updating an existing script element. */
export interface UpdateElementRequest {
  /** UUID of the requesting user. */
  user_id: string;
  /** New text content, if changing. */
  content?: string;
  /** New element type, if changing. */
  elementType?: ScriptElement['element_type'];
}

/**
 * Creates a new script element within a scene. The element is inserted at the
 * position indicated by `elementOrder`.
 *
 * @param elementData - Element type, text content, and parent scene ID.
 * @returns A promise that resolves to the newly created script element.
 * @throws {Error} When the scene is not found or the user lacks write access.
 *
 * @example
 * ```ts
 * const el = await createScriptElement({ sceneId, elementOrder: 2, elementType: "ACTION", content: "She runs." });
 * ```
 */
export const createScriptElement = (elementData: CreateElementRequest): Promise<ScriptElement> => {
  return apiClient<ScriptElement>(`scenes/${elementData.sceneId}/elements`, {
    method: "POST",
    body: elementData,
  });
};

/**
 * Applies partial updates to an existing script element's content or type.
 *
 * @param elementId - UUID of the element to update.
 * @param updateData - Fields to change, including the required `user_id`.
 * @returns A promise that resolves to the updated script element.
 */
export const updateScriptElement = (elementId: string, updateData: UpdateElementRequest): Promise<ScriptElement> => {
  return apiClient<ScriptElement>(`elements/${elementId}`, {
    method: "PATCH",
    body: updateData,
  });
};

/**
 * Permanently deletes a script element.
 *
 * @param elementId - UUID of the element to delete.
 * @returns A promise that resolves when the deletion is complete.
 */
export const deleteScriptElement = (elementId: string): Promise<void> => {
  return apiClient<void>(`elements/${elementId}`, {
    method: "DELETE",
  });
};

/**
 * Permanently deletes a scene and all of its script elements.
 *
 * @param sceneId - UUID of the scene to delete.
 * @returns A promise that resolves when the scene and its elements are removed.
 */
export const deleteScene = (sceneId: string): Promise<void> => {
  return apiClient<void>(`scenes/${sceneId}`, {
    method: "DELETE",
  });
};
