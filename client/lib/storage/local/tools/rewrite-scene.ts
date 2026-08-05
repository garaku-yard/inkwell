import { elements } from "../elements"
import { projects } from "../projects"
import { scenes } from "../scenes"
import { LOCAL_USER_ID } from "../shared"
import { shapeOf } from "./formats"
import type { ToolArgs, ToolEntry } from "./types"
import { appendBody } from "./write-body"

function stringArg(args: ToolArgs, key: string): string {
  const value = args[key]
  return typeof value === "string" ? value.trim() : ""
}

/** Replaces a scene's text with new text.
 *
 *  A scene's body is a row per element and there is no bulk-replace primitive
 *  underneath, so this is a write followed by a delete — deliberately in that
 *  order. The new text is committed first and the old elements removed after,
 *  which means a failure part-way leaves the scene holding both versions:
 *  untidy, obvious, and fixable by running this again. Deleting first would
 *  leave a failure holding neither, and the writer's words would be gone.
 *
 *  Refuses empty text rather than emptying the scene: that is `delete_scene`,
 *  and it should be asked for by name. */
export const rewriteScene: ToolEntry = {
  spec: {
    name: "rewrite_scene",
    description:
      "Replace the text of a scene in the project this conversation is open " +
      "on. Use it to correct something already written, where append_to_scene " +
      "would only pile a fix underneath the mistake. Read the scene first: " +
      "this replaces the whole body, so anything you don't carry across is " +
      "lost. It never empties a scene — to remove one, use delete_scene.",
    parameters: {
      type: "object",
      properties: {
        scene_id: {
          type: "string",
          description: "The scene's id, as returned by list_scenes.",
        },
        text: {
          type: "string",
          description:
            "The scene's complete new body. Separate paragraphs with a blank " +
            "line; in poetry and lyrics each line is kept as its own line.",
        },
      },
      required: ["scene_id", "text"],
    },
  },
  mutates: true,
  destructive: true,
  label: () => "Rewriting a scene",
  async run(args, ctx) {
    const sceneId = stringArg(args, "scene_id")
    const text = stringArg(args, "text")
    if (!text) {
      return "Give the scene's new text. To remove the scene entirely, use delete_scene."
    }

    const list = await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)
    const scene = list.find((s) => s.id === sceneId)
    if (!scene) {
      return (
        `No scene with id "${sceneId}" in this project — nothing was changed. ` +
        "Call list_scenes to see which scenes exist."
      )
    }

    const project = await projects.getById(ctx.projectId, LOCAL_USER_ID)
    const shape = shapeOf(project.category)
    if (!shape) {
      return `A ${project.category} project has no scenes to rewrite. Nothing was changed.`
    }

    const before = await elements.listForScene(scene.id, LOCAL_USER_ID)
    const written = await appendBody(ctx.projectId, scene.id, text, shape)
    if (written === 0) {
      return "That text was empty once trimmed — nothing was changed."
    }
    // Only now that the replacement is on disk does the old text go.
    for (const element of before) {
      await elements.delete(element.id)
    }

    const heading = scene.scene_heading || "(untitled scene)"
    return (
      `Rewrote "${heading}": ${before.length} ` +
      `${before.length === 1 ? "element" : "elements"} replaced with ${written}.`
    )
  },
}
