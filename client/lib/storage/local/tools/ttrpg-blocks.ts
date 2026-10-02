import { elements } from "../elements"
import { projects } from "../projects"
import { scenes } from "../scenes"
import { LOCAL_USER_ID } from "../shared"
import { blockType, defaultTtrpgBlock, parseTtrpgBlock, ttrpgBlockToText, type TtrpgBlock } from "@/lib/ttrpg/blocks"
import { parseRandomTable, rollRandomTable } from "@/lib/ttrpg/random-table"
import type { ToolArgs, ToolContext, ToolEntry } from "./types"

const str = (args: ToolArgs, key: string) => typeof args[key] === "string" ? args[key].trim() : ""
const kinds = ["clock", "read_aloud", "keyed_location", "cross_reference"] as const

async function projectSections(ctx: ToolContext) {
  const project = await projects.getById(ctx.projectId, LOCAL_USER_ID)
  if (project.category !== "tabletop_rpg") return null
  return scenes.listForProject(ctx.projectId, LOCAL_USER_ID)
}

function patchBlock(before: TtrpgBlock, args: ToolArgs): TtrpgBlock | string {
  const allowed: Record<TtrpgBlock["kind"], string[]> = {
    clock: ["name", "segments", "filled", "note"],
    read_aloud: ["text", "gmNote"],
    keyed_location: ["key", "name", "description", "contents"],
    cross_reference: ["targetId", "label"],
  }
  const next = { ...before } as Record<string, unknown>
  for (const [key, value] of Object.entries(args)) {
    if (["block_id", "section_id", "kind"].includes(key)) continue
    if (!allowed[before.kind].includes(key)) return `Unknown ${before.kind} field: ${key}.`
    if (key === "segments" || key === "filled") {
      if (!Number.isInteger(value)) return `${key} must be an integer.`
    } else if (typeof value !== "string") return `${key} must be text.`
    next[key] = value
  }
  if (before.kind === "clock") {
    if (Number(next.segments) < 1 || Number(next.segments) > 24 ||
      Number(next.filled) < 0 || Number(next.filled) > Number(next.segments)) return "A clock needs 1–24 segments and filled progress within that range."
  }
  return next as TtrpgBlock
}

export const queryTtrpgBlocks: ToolEntry = {
  spec: { name: "query_ttrpg_blocks", description: "List TTRPG blocks by kind and section; includes designer notes and tables. Returns stable block IDs and readable content.",
    parameters: { type: "object", properties: { kind: { type: "string", description: "Block kind, e.g. clock, read_aloud, keyed_location, cross_reference, callout, table, dice_table." }, section_id: { type: "string" } } } },
  requires: "ttrpg", mutates: false, label: () => "Querying TTRPG blocks",
  async run(args, ctx) {
    const sections = await projectSections(ctx)
    if (!sections) return "Choose a tabletop RPG project first."
    const kind = str(args, "kind")
    const sectionId = str(args, "section_id")
    const result = []
    for (const section of sections) {
      if (sectionId && section.id !== sectionId) continue
      for (const el of await elements.listForScene(section.id, LOCAL_USER_ID)) {
        const shortKind = el.element_type.startsWith("ttrpg_") ? el.element_type.slice(6) : el.element_type
        if (kind && kind !== shortKind && !(kind === "designer_note" && shortKind === "callout") &&
          !(kind === "table" && shortKind === "dice_table")) continue
        const block = parseTtrpgBlock(el.element_type, el.content)
        result.push({ id: el.id, section_id: section.id, section: section.scene_heading, kind: shortKind,
          content: block ? ttrpgBlockToText(block) : el.content, ...(block ?? {}) })
      }
    }
    return JSON.stringify(result)
  },
}

export const createTtrpgBlock: ToolEntry = {
  spec: { name: "create_ttrpg_block", description: "Create a TTRPG clock, read-aloud box, keyed location, or stable cross-reference in a section. Fields match the block kind.",
    parameters: { type: "object", properties: {
      section_id: { type: "string" }, kind: { type: "string", enum: kinds },
      name: { type: "string" }, segments: { type: "integer" }, filled: { type: "integer" }, note: { type: "string" },
      text: { type: "string" }, gmNote: { type: "string" }, key: { type: "string" },
      description: { type: "string" }, contents: { type: "string" }, targetId: { type: "string" },
    }, required: ["section_id", "kind"] } },
  requires: "ttrpg", mutates: true, label: (args) => `Creating ${str(args, "kind") || "TTRPG"} block`,
  async run(args, ctx) {
    const sections = await projectSections(ctx)
    if (!sections) return "Choose a tabletop RPG project first."
    const section = sections.find((item) => item.id === str(args, "section_id"))
    if (!section) return "That section is not in this project."
    const kind = str(args, "kind") as TtrpgBlock["kind"]
    if (!kinds.includes(kind)) return "Kind must be clock, read_aloud, keyed_location, or cross_reference."
    const block = patchBlock(defaultTtrpgBlock(kind), args)
    if (typeof block === "string") return block
    if (block.kind === "cross_reference") {
      const all = (await Promise.all(sections.map((item) => elements.listForScene(item.id, LOCAL_USER_ID)))).flat()
      const target = all.find((item) => item.id === block.targetId)
      if (!target) return "targetId must identify a block in this project."
      block.label = target.content.slice(0, 60)
    }
    const existing = await elements.listForScene(section.id, LOCAL_USER_ID)
    const order = existing.length ? existing[existing.length - 1].line_number + 1 : 0
    const created = await elements.create({ projectId: ctx.projectId, sceneId: section.id, elementOrder: order,
      elementType: blockType(block.kind), content: JSON.stringify(block) })
    return `Created ${block.kind} block ${created.id} in ${section.scene_heading}.`
  },
}

export const updateTtrpgBlock: ToolEntry = {
  spec: { name: "update_ttrpg_block", description: "Edit a clock, read-aloud box, keyed location, or cross-reference by stable block ID. Supply only fields to change.",
    parameters: { type: "object", properties: {
      block_id: { type: "string" }, name: { type: "string" }, segments: { type: "integer" }, filled: { type: "integer" },
      note: { type: "string" }, text: { type: "string" }, gmNote: { type: "string" }, key: { type: "string" },
      description: { type: "string" }, contents: { type: "string" }, targetId: { type: "string" },
    }, required: ["block_id"] } },
  requires: "ttrpg", mutates: true, destructive: true, label: () => "Updating a TTRPG block",
  async describe(args, ctx) {
    const sections = await projectSections(ctx)
    if (!sections) return ""
    for (const section of sections) {
      const el = (await elements.listForScene(section.id, LOCAL_USER_ID)).find((item) => item.id === str(args, "block_id"))
      if (el) {
        const block = parseTtrpgBlock(el.element_type, el.content)
        return block ? `Update ${block.kind.replaceAll("_", " ")} "${ttrpgBlockToText(block).split("\n")[0]}" in ${section.scene_heading}` : ""
      }
    }
    return ""
  },
  async run(args, ctx) {
    const sections = await projectSections(ctx)
    if (!sections) return "Choose a tabletop RPG project first."
    const all = (await Promise.all(sections.map((item) => elements.listForScene(item.id, LOCAL_USER_ID)))).flat()
    const existing = all.find((item) => item.id === str(args, "block_id"))
    if (!existing) return "That block is not in this project."
    const before = parseTtrpgBlock(existing.element_type, existing.content)
    if (!before) return "That ID is not a supported typed block, or its saved data is invalid."
    const next = patchBlock(before, args)
    if (typeof next === "string") return next
    if (next.kind === "cross_reference" && !all.some((item) => item.id === next.targetId)) return "targetId must identify a block in this project."
    await elements.update(existing.id, { content: JSON.stringify(next) })
    return `Updated ${next.kind} block ${existing.id}.`
  },
}

export const rollTtrpgTable: ToolEntry = {
  spec: { name: "roll_ttrpg_table", description: "Roll a random result table N times and return outcome counts and percentages. Each nonempty result row has equal weight.",
    parameters: { type: "object", properties: { block_id: { type: "string" }, rolls: { type: "integer", description: "1–10000" } }, required: ["block_id", "rolls"] } },
  requires: "ttrpg", mutates: false, label: () => "Rolling a random table",
  async run(args, ctx) {
    const sections = await projectSections(ctx)
    if (!sections) return "Choose a tabletop RPG project first."
    const count = args.rolls
    if (!Number.isInteger(count) || Number(count) < 1 || Number(count) > 10000) return "rolls must be an integer from 1 to 10000."
    for (const section of sections) {
      const el = (await elements.listForScene(section.id, LOCAL_USER_ID)).find((item) => item.id === str(args, "block_id"))
      if (!el) continue
      if (el.element_type !== "dice_table") return "That block is not a random table."
      const table = parseRandomTable(el.content)
      if (!table) return "The random table has no valid result rows."
      const counts = new Map<typeof table.rows[number], number>()
      for (let i = 0; i < Number(count); i++) {
        const outcome = rollRandomTable(table)
        counts.set(outcome, (counts.get(outcome) ?? 0) + 1)
      }
      return JSON.stringify({ rolls: count, outcomes: table.rows.length,
        distribution: table.rows.map((row) => ({ result: row.result, weight: row.weight,
          expected_percent: Math.round(row.weight / table.totalWeight * 10000) / 100,
          hits: counts.get(row) ?? 0,
          observed_percent: Math.round((counts.get(row) ?? 0) / Number(count) * 10000) / 100 })) })
    }
    return "That table is not in this project."
  },
}
