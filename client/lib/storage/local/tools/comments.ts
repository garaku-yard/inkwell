import { collaboration } from "../collaboration"
import { elements } from "../elements"
import { projects } from "../projects"
import { scenes } from "../scenes"
import { LOCAL_USER_ID } from "../shared"
import type { ToolArgs, ToolContext, ToolEntry } from "./types"

const str = (args: ToolArgs, key: string) => typeof args[key] === "string" ? args[key].trim() : ""

async function supported(ctx: ToolContext) {
  const project = await projects.getById(ctx.projectId, LOCAL_USER_ID)
  return project.category === "tabletop_rpg" || project.category === "interactive_fiction"
}

export const listProjectComments: ToolEntry = {
  spec: { name: "list_project_comments", description: "Read comments on the open TTRPG or interactive fiction project, including target IDs and resolution status.",
    parameters: { type: "object", properties: { include_resolved: { type: "boolean" } } } },
  requires: "ttrpg_or_if", mutates: false, label: () => "Reading project comments",
  async run(args, ctx) {
    if (!await supported(ctx)) return "Choose a TTRPG or interactive fiction project first."
    const comments = await collaboration.listComments(ctx.projectId)
    return JSON.stringify(args.include_resolved === false ? comments.filter((item) => !item.isResolved) : comments)
  },
}

export const addProjectComment: ToolEntry = {
  spec: { name: "add_project_comment", description: "Add a comment to a section or element in the open TTRPG or interactive fiction project.",
    parameters: { type: "object", properties: { target_id: { type: "string" }, content: { type: "string" } }, required: ["target_id", "content"] } },
  requires: "ttrpg_or_if", mutates: true, label: () => "Adding a project comment",
  async run(args, ctx) {
    if (!await supported(ctx)) return "Choose a TTRPG or interactive fiction project first."
    const content = str(args, "content")
    if (!content) return "Give the comment text."
    const target = str(args, "target_id")
    const allScenes = await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)
    const scene = allScenes.find((item) => item.id === target)
    let element = false
    if (!scene) for (const item of allScenes) {
      if ((await elements.listForScene(item.id, LOCAL_USER_ID)).some((el) => el.id === target)) { element = true; break }
    }
    if (!scene && !element) return "That target is not a section or element in this project."
    const comment = await collaboration.addComment({ projectId: ctx.projectId, screenplayId: ctx.projectId,
      content, lineNumber: 0, ...(scene ? { sceneId: target } : { scriptElementId: target }) })
    return JSON.stringify(comment)
  },
}
