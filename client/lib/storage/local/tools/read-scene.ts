import { elements } from "../elements"
import { scenes } from "../scenes"
import { LOCAL_USER_ID } from "../shared"
import type { ToolArgs, ToolEntry } from "./types"

function sceneIdOf(args: ToolArgs): string {
  return typeof args.scene_id === "string" ? args.scene_id : ""
}

/** Reads one scene of the open project in full.
 *
 *  A scene's text is not one blob: it is a row per paragraph, line or beat in
 *  `script_elements`, each carrying the element type the editor renders it as.
 *  Those types are the format's vocabulary — `dialogue` and `action` mean
 *  different things to a screenplay than `paragraph` does to a novel — so they
 *  are kept in the rendering rather than flattened into prose the model would
 *  have to guess the shape of.
 *
 *  Scenes created without ever being opened in an editor have their body in
 *  the legacy `scenes.content` column instead, hence the fallback. */
export const readScene: ToolEntry = {
  spec: {
    name: "read_scene",
    description:
      "Read one scene of the project this conversation is open on, in full. " +
      "Each line is prefixed with its element type — [paragraph], [dialogue], " +
      "[action], [character] and so on — so you can see the shape of the " +
      "writing and not only its words. Scene ids come from list_scenes.",
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
  mutates: false,
  label: () => "Reading a scene",
  async run(args, ctx) {
    const sceneId = sceneIdOf(args)
    // Listing the project's own scenes and matching within it is both the
    // lookup and the boundary: an id from another project can't be read.
    const list = await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)
    const scene = list.find((s) => s.id === sceneId)
    if (!scene) {
      return (
        `No scene with id "${sceneId}" in this project. ` +
        "Call list_scenes to see which scenes exist."
      )
    }

    const heading = scene.scene_heading || "(untitled scene)"
    const parts = await elements.listForScene(scene.id, LOCAL_USER_ID)
    const body =
      parts.length > 0
        ? parts.map((el) => `[${el.element_type}] ${el.content}`).join("\n")
        : scene.content.trim()

    return body ? `${heading}\n\n${body}` : `${heading}\n\n(This scene is empty.)`
  },
}
