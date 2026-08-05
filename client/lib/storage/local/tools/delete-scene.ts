import { scenes } from "../scenes"
import { LOCAL_USER_ID } from "../shared"
import type { ToolArgs, ToolEntry } from "./types"

function sceneIdOf(args: ToolArgs): string {
  return typeof args.scene_id === "string" ? args.scene_id.trim() : ""
}

/** Removes a scene and everything in it.
 *
 *  The first tool that can take writing away. `scenes.delete` soft-deletes and
 *  cascades tombstones to the scene's elements, so the rows survive on disk and
 *  a sync carries the removal rather than resurrecting the scene — but from the
 *  writer's side it is gone, and nothing in the app undoes it. */
export const deleteScene: ToolEntry = {
  spec: {
    name: "delete_scene",
    description:
      "Delete a scene from the project this conversation is open on, with all " +
      "of its text. This cannot be undone from inside Inkwell, so read the " +
      "scene first and be certain it is the one the writer meant. To correct " +
      "text rather than remove it, use rewrite_scene.",
    parameters: {
      type: "object",
      properties: {
        scene_id: {
          type: "string",
          description: "The scene's id, as returned by list_scenes.",
        },
      },
      required: ["scene_id"],
    },
  },
  mutates: true,
  destructive: true,
  label: () => "Deleting a scene",
  async run(args, ctx) {
    const sceneId = sceneIdOf(args)
    // Listing the project's own scenes is both the lookup and the boundary: a
    // stray id can't delete something in another project.
    const list = await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)
    const scene = list.find((s) => s.id === sceneId)
    if (!scene) {
      return (
        `No scene with id "${sceneId}" in this project — nothing was deleted. ` +
        "Call list_scenes to see which scenes exist."
      )
    }

    await scenes.delete(scene.id)
    return `Deleted "${scene.scene_heading || "(untitled scene)"}" and its text.`
  },
}
