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

/** Adds a scene at the end of the open project, optionally with a first
 *  draft of its text.
 *
 *  Text is optional but accepted in the same call rather than left to a
 *  follow-up append: the tool loop is capped at four iterations, so making
 *  "add a scene and write it" cost two of them would be spending the model's
 *  budget on plumbing. */
export const createScene: ToolEntry = {
  spec: {
    name: "create_scene",
    description:
      "Add a new scene at the end of the project this conversation is open " +
      "on. Optionally give it a first pass of text, which is stored in the " +
      "project's own format — paragraphs for prose, lines for verse, action " +
      "for screenplay. The writer sees it in their editor immediately, so " +
      "write what they asked for and nothing extra.",
    parameters: {
      type: "object",
      properties: {
        heading: {
          type: "string",
          description:
            "The scene's heading, as it should read in the manuscript " +
            "(a screenplay wants INT./EXT. form).",
        },
        text: {
          type: "string",
          description:
            "Optional body text. Separate paragraphs with a blank line; in " +
            "poetry and lyrics each line is kept as its own line.",
        },
      },
      required: ["heading"],
    },
  },
  mutates: true,
  label: (args) => {
    const heading = stringArg(args, "heading")
    return heading ? `Creating "${heading}"` : "Creating a scene"
  },
  async run(args, ctx) {
    const heading = stringArg(args, "heading")
    if (!heading) return "Give the scene a heading."

    const project = await projects.getById(ctx.projectId, LOCAL_USER_ID)
    const shape = shapeOf(project.category)
    if (!shape) {
      return (
        `A ${project.category} project has no scenes to add to. ` +
        "Nothing was created."
      )
    }

    const existing = await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)
    const lastOrder = existing.reduce((max, s) => Math.max(max, s.order_index), -1)
    const scene = await scenes.create(ctx.projectId, LOCAL_USER_ID, {
      scene_heading: heading,
      order_index: lastOrder + 1,
    })

    const text = stringArg(args, "text")
    const written = text ? await appendBody(ctx.projectId, scene.id, text, shape) : 0
    const body =
      written > 0 ? ` with ${written} ${written === 1 ? "element" : "elements"} of text` : " (empty)"
    return `Created scene "${heading}"${body}. Its id is ${scene.id}.`
  },
}
