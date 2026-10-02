import { projectToMarkdown } from "@/lib/export/text-export"
import { beatBoard } from "../beat-board"
import { projects } from "../projects"
import { scenes } from "../scenes"
import { getDb, LOCAL_USER_ID, markDirty, now } from "../shared"
import type { ToolArgs, ToolEntry } from "./types"

const str = (args: ToolArgs, key: string) => typeof args[key] === "string" ? args[key].trim() : ""

export const reorderSections: ToolEntry = {
  spec: { name: "reorder_sections", description: "Set the complete section order for the open project. Pass every section ID once, in the desired order.",
    parameters: { type: "object", properties: { section_ids: { type: "array", items: { type: "string" } } }, required: ["section_ids"] } },
  mutates: true, destructive: true, label: () => "Reordering sections",
  async describe(args, ctx) {
    const sections = await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)
    return Array.isArray(args.section_ids) ? `Reorder sections as: ${args.section_ids.map((id) => sections.find((item) => item.id === id)?.scene_heading || String(id)).join(" → ")}` : "Reorder sections"
  },
  async run(args, ctx) {
    const existing = await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)
    const ids = args.section_ids
    if (!Array.isArray(ids) || ids.length !== existing.length ||
      new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string") ||
      ids.some((id) => !existing.some((section) => section.id === id))) return "Pass every section ID in this project exactly once. Call list_scenes first."
    const db = await getDb()
    const ts = now()
    for (let index = 0; index < ids.length; index++) {
      await db.execute("UPDATE scenes SET order_index = ?, updated_at = ? WHERE id = ? AND project_id = ? AND deleted_at IS NULL",
        [index, ts, ids[index], ctx.projectId])
      await markDirty(db, "scene", ctx.projectId, ids[index] as string)
    }
    return JSON.stringify(ids.map((id, index) => ({ id, heading: existing.find((section) => section.id === id)?.scene_heading, order: index })))
  },
}

export const exportSectionMarkdown: ToolEntry = {
  spec: { name: "export_section_markdown", description: "Return one section of the open project as Markdown, ready to copy into a document.",
    parameters: { type: "object", properties: { section_id: { type: "string" } }, required: ["section_id"] } },
  mutates: false, label: () => "Exporting section Markdown",
  async run(args, ctx) {
    const section = (await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)).find((item) => item.id === str(args, "section_id"))
    if (!section) return "That section is not in this project."
    const project = await projects.getFull(ctx.projectId, LOCAL_USER_ID)
    const markdown = projectToMarkdown(project, section.id)
    return markdown
  },
}

export const listBeats: ToolEntry = {
  spec: { name: "list_beats", description: "List beat board cards with IDs, text, act, order and canvas position.", parameters: { type: "object", properties: {} } },
  mutates: false, label: () => "Listing beats",
  async run(_args, ctx) { return JSON.stringify((await beatBoard.getBoard(ctx.projectId)).beats) },
}

export const updateBeatTool: ToolEntry = {
  spec: { name: "update_beat", description: "Edit the title, description or act of an existing beat board card.",
    parameters: { type: "object", properties: { beat_id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, act: { type: "integer" } }, required: ["beat_id"] } },
  mutates: true, destructive: true, label: () => "Updating a beat",
  async describe(args, ctx) {
    const beat = (await beatBoard.getBoard(ctx.projectId)).beats.find((item) => item.id === str(args, "beat_id"))
    return beat ? `Update beat "${beat.title}"` : ""
  },
  async run(args, ctx) {
    const beat = (await beatBoard.getBoard(ctx.projectId)).beats.find((item) => item.id === str(args, "beat_id"))
    if (!beat) return "That beat is not on this project's board."
    const patch: { title?: string; description?: string; act?: number } = {}
    if (args.title !== undefined) patch.title = str(args, "title")
    if (args.description !== undefined) patch.description = str(args, "description")
    if (args.act !== undefined) {
      if (!Number.isInteger(args.act) || Number(args.act) < 1) return "act must be a positive integer."
      patch.act = Number(args.act)
    }
    if (!Object.keys(patch).length) return "Give a title, description or act to update."
    return JSON.stringify(await beatBoard.updateBeat(beat.id, patch))
  },
}

export const moveBeat: ToolEntry = {
  spec: { name: "move_beat", description: "Move an existing beat card to an absolute canvas position (x, y).",
    parameters: { type: "object", properties: { beat_id: { type: "string" }, x: { type: "number" }, y: { type: "number" } }, required: ["beat_id", "x", "y"] } },
  mutates: true, label: () => "Moving a beat",
  async run(args, ctx) {
    const beat = (await beatBoard.getBoard(ctx.projectId)).beats.find((item) => item.id === str(args, "beat_id"))
    if (!beat) return "That beat is not on this project's board."
    if (typeof args.x !== "number" || typeof args.y !== "number" || !Number.isFinite(args.x) || !Number.isFinite(args.y)) return "x and y must be finite numbers."
    return JSON.stringify(await beatBoard.updateBeat(beat.id, { position: { x: args.x, y: args.y } }))
  },
}
