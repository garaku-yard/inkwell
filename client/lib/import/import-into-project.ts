/**
 * Persists a {@link ParsedProject} into an EXISTING project — the editor-side
 * import path ("import into the project I'm currently editing"). Scenes are
 * appended after the project's existing content via `baseOrderIndex`, and the
 * created scenes (with their elements attached) are returned so the editor can
 * splice them into its local state without a full reload.
 *
 * Sequential by necessity: each element needs its scene's id first. Errors
 * propagate; partial state may remain but is recoverable from the project.
 *
 * For the dashboard "import as a NEW project" path, see
 * {@link importFdxAsProject} in ./import-fdx (and its future per-format peers).
 */

import {
  createScene,
  createSceneElement,
  type Scene,
} from "@/services/project"
import type { ParsedProject } from "./types"

export async function importIntoProject(
  projectId: string,
  userId: string,
  parsed: ParsedProject,
  baseOrderIndex: number,
): Promise<Scene[]> {
  const created: Scene[] = []

  for (let sceneIdx = 0; sceneIdx < parsed.scenes.length; sceneIdx++) {
    const scene = parsed.scenes[sceneIdx]
    const createdScene = await createScene(projectId, userId, {
      scene_heading: scene.heading,
      order_index: baseOrderIndex + sceneIdx,
    })

    const elements = []
    for (let elIdx = 0; elIdx < scene.elements.length; elIdx++) {
      const el = scene.elements[elIdx]
      elements.push(
        await createSceneElement(projectId, createdScene.id, userId, {
          element_type: el.type,
          content: el.content,
          order_index: elIdx,
        }),
      )
    }

    // createScene returns a bare scene; attach the elements we just made so the
    // editor can render the imported content immediately.
    created.push({ ...createdScene, elements })
  }

  return created
}
