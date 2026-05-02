/**
 * Turns a parsed `.fdx` document into a real Inkwell screenplay project.
 *
 * Lives next to the parser so callers (the dashboard import dialog, the
 * file-association handler) only depend on one entrypoint. The function
 * is sequential rather than parallel: scenes need a project id, and
 * elements need a scene id, so any concurrency would still need
 * round-trips between every step.
 */

import {
  createProject,
  createScene,
  createSceneElement,
  type Project,
} from "@/services/project"
import type { ParsedFdx } from "./screenplay-fdx"

/**
 * Persists `parsed` as a fresh screenplay project owned by `userId`.
 * Returns the created project so the caller can navigate to its editor.
 * Errors propagate — partial state may remain on disk if a later
 * createSceneElement fails, but the project itself is recoverable from
 * the user's project list.
 */
export async function importFdxAsProject(
  parsed: ParsedFdx,
  userId: string,
): Promise<Project> {
  const project = await createProject({
    title: parsed.title,
    owner_id: userId,
    category: "screenplay",
  })

  for (let sceneIdx = 0; sceneIdx < parsed.scenes.length; sceneIdx++) {
    const scene = parsed.scenes[sceneIdx]
    const created = await createScene(project.id, userId, {
      scene_heading: scene.heading,
      order_index: sceneIdx,
    })

    for (let elIdx = 0; elIdx < scene.elements.length; elIdx++) {
      const el = scene.elements[elIdx]
      await createSceneElement(project.id, created.id, userId, {
        element_type: el.type,
        content: el.content,
        order_index: elIdx,
      })
    }
  }

  return project
}
