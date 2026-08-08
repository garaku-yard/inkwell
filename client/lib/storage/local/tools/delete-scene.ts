import { elements } from "../elements"
import { scenes } from "../scenes"
import { LOCAL_USER_ID } from "../shared"
import { recordUndo } from "./undo"
import type { ToolArgs, ToolEntry } from "./types"

function sceneIdOf(args: ToolArgs): string {
  return typeof args.scene_id === "string" ? args.scene_id.trim() : ""
}

/** Removes a scene and everything in it.
 *
 *  The first tool that can take writing away. `scenes.delete` soft-deletes and
 *  cascades tombstones to the scene's elements, so the rows survive on disk and
 *  a sync carries the removal rather than resurrecting the scene. Since ADR 0027
 *  that survival is reachable: the ids are journalled here, and Recent AI changes
 *  puts them back. */
export const deleteScene: ToolEntry = {
  spec: {
    name: "delete_scene",
    description:
      "Delete a scene from the project this conversation is open on, with all " +
      "of its text. The writer is asked to approve this before it runs, and can " +
      "reverse it afterwards, but read the scene first and be certain it is the " +
      "one they meant — their undo is not a substitute for your care. To correct " +
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
  async describe(args, ctx) {
    const list = await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)
    const scene = list.find((s) => s.id === sceneIdOf(args))
    if (!scene) return ""
    const count = (await elements.listForScene(scene.id, LOCAL_USER_ID)).length
    const heading = scene.scene_heading || "(untitled scene)"
    return `Delete "${heading}" and its ${count} ${count === 1 ? "element" : "elements"}`
  },
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

    // Capture the live elements *before* deleting: `scenes.delete` cascades
    // `deleted_at` only to those not already deleted, so this is the only moment
    // the set undo must restore is knowable. Reading it afterwards would sweep
    // up elements that were already gone before this call and resurrect them.
    const cascaded = await elements.listForScene(scene.id, LOCAL_USER_ID)

    await scenes.delete(scene.id)

    const heading = scene.scene_heading || "(untitled scene)"
    await recordUndo({
      projectId: ctx.projectId,
      tool: "delete_scene",
      source: ctx.source ?? "chat",
      summary: `Deleted "${heading}"`,
      sceneIds: [scene.id],
      restoreElementIds: cascaded.map((element) => element.id),
    })
    return `Deleted "${heading}" and its text. The writer can undo this from Recent AI changes.`
  },
}
