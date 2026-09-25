import { scenes } from "../scenes"
import { elements } from "../elements"
import { projects } from "../projects"
import { LOCAL_USER_ID } from "../shared"
import { renamePassageLinks } from "@/lib/interactive-fiction/runtime"
import type { ToolArgs, ToolEntry } from "./types"

function stringArg(args: ToolArgs, key: string): string {
  const value = args[key]
  return typeof value === "string" ? value.trim() : ""
}

/** Changes a scene's heading, which `create_scene` otherwise fixes forever.
 *
 *  Not marked destructive: a heading is one short line, replacing it loses at
 *  most that line, and the tool reports the old one so the writer (or the
 *  model) can put it back. Deleting a scene or replacing its body can lose
 *  work that isn't recoverable from the reply. */
export const renameScene: ToolEntry = {
  spec: {
    name: "rename_scene",
    description:
      "Change a scene's heading in the project this conversation is open on. " +
      "In interactive fiction the heading is the passage name that [[links]] " +
      "point at; Inkwell updates exact link targets across the project automatically.",
    parameters: {
      type: "object",
      properties: {
        scene_id: {
          type: "string",
          description: "The scene's id, as returned by list_scenes.",
        },
        heading: { type: "string", description: "The new heading." },
      },
      required: ["scene_id", "heading"],
    },
  },
  mutates: true,
  label: (args) => {
    const heading = stringArg(args, "heading")
    return heading ? `Renaming to "${heading}"` : "Renaming a scene"
  },
  async run(args, ctx) {
    const sceneId = stringArg(args, "scene_id")
    const heading = stringArg(args, "heading")
    if (!heading) return "Give the scene a heading."

    const list = await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)
    const scene = list.find((s) => s.id === sceneId)
    if (!scene) {
      return (
        `No scene with id "${sceneId}" in this project — nothing was renamed. ` +
        "Call list_scenes to see which scenes exist."
      )
    }

    const before = scene.scene_heading || "(untitled scene)"
    await scenes.updateHeading(scene.id, LOCAL_USER_ID, heading)
    let rewritten = 0
    const project = await projects.getById(ctx.projectId, LOCAL_USER_ID)
    if (project?.category === "interactive_fiction") {
      for (const passage of list) {
        for (const element of await elements.listForScene(passage.id, LOCAL_USER_ID)) {
          const content = renamePassageLinks(element.content, scene.scene_heading, heading)
          if (content === element.content) continue
          await elements.update(element.id, { content })
          rewritten++
        }
      }
    }
    return `Renamed "${before}" to "${heading}".${rewritten ? ` Updated ${rewritten} passage link${rewritten === 1 ? "" : "s"}.` : ""}`
  },
}
