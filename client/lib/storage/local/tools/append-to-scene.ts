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

/** Adds text to the end of an existing scene. Append-only — see
 *  {@link appendBody} for why nothing here can overwrite the writer's words. */
export const appendToScene: ToolEntry = {
  spec: {
    name: "append_to_scene",
    description:
      "Add text to the end of a scene in the project this conversation is " +
      "open on, in the project's own format. It can only add: nothing you " +
      "write here replaces or deletes what the writer already has. Scene ids " +
      "come from list_scenes; read the scene first so what you add follows on.",
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
            "The text to add. Separate paragraphs with a blank line; in " +
            "poetry and lyrics each line is kept as its own line.",
        },
      },
      required: ["scene_id", "text"],
    },
  },
  mutates: true,
  label: () => "Adding to a scene",
  async run(args, ctx) {
    const sceneId = stringArg(args, "scene_id")
    const text = stringArg(args, "text")
    if (!text) return "Give some text to add."

    const list = await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)
    const scene = list.find((s) => s.id === sceneId)
    if (!scene) {
      return (
        `No scene with id "${sceneId}" in this project — nothing was written. ` +
        "Call list_scenes to see which scenes exist."
      )
    }

    const project = await projects.getById(ctx.projectId, LOCAL_USER_ID)
    const shape = shapeOf(project.category)
    if (!shape) {
      return `A ${project.category} project has no scenes to write into. Nothing was written.`
    }

    const written = await appendBody(ctx.projectId, scene.id, text, shape)
    if (written === 0) return "That text was empty once trimmed — nothing was written."
    return (
      `Added ${written} ${written === 1 ? "element" : "elements"} to ` +
      `"${scene.scene_heading || "(untitled scene)"}".`
    )
  },
}
