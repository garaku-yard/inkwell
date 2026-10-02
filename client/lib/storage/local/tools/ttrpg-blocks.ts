import { elements } from "../elements"
import { projects } from "../projects"
import { scenes } from "../scenes"
import { LOCAL_USER_ID } from "../shared"
import { blockType, defaultTtrpgBlock, parseTtrpgBlock, ttrpgBlockToText, type TtrpgBlock } from "@/lib/ttrpg/blocks"
import { parseRandomTable, rollRandomTable } from "@/lib/ttrpg/random-table"
import { createPlacedTtrpgElement } from "./ttrpg-placement"
import { recordUndo } from "./undo"
import type { ToolArgs, ToolContext, ToolEntry } from "./types"

const str = (args: ToolArgs, key: string) => typeof args[key] === "string" ? args[key].trim() : ""
const kinds = ["clock", "read_aloud", "keyed_location", "cross_reference"] as const
const textKinds = ["table", "dice_table", "random_table", "designer_note", "callout", "rule_box"] as const
const elementType = (kind: string) => kind === "random_table" ? "dice_table" : kind === "designer_note" ? "callout" : kind
const isTextKind = (kind: string): kind is typeof textKinds[number] => textKinds.some((item) => item === kind)

function tableContent(args: ToolArgs, kind: string): string {
  if (kind !== "dice_table" && kind !== "random_table") return str(args, "content")
  if (args.rows === undefined) return str(args, "content")
  if (!Array.isArray(args.rows) || !args.rows.length) return ""
  const rows = args.rows.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null
    const row = item as Record<string, unknown>
    const result = typeof row.result === "string" ? row.result.trim() : ""
    const weight = row.weight === undefined ? 1 : row.weight
    if (!result || result.includes("\n") || result.includes("|") || typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) return null
    return `${weight} | ${result}`
  })
  if (rows.some((row) => row === null)) return ""
  return `Weight | Result\n--- | ---\n${rows.join("\n")}`
}

function validTextContent(kind: string, content: string): string | null {
  if (kind === "dice_table" && !parseRandomTable(content)) return "Give valid random-table rows, or supply rows as {result, weight} objects with positive weights."
  if (!content) return "content must not be empty."
  if (kind === "table" && !/^\s*\|?\s*[^\n|]+\|[^\n]*\n\s*[-|:\s]+\n/m.test(content)) return "A table needs a pipe-separated header and separator row."
  return null
}

async function resolveTarget(sourceProjectId: string, targetProjectId: string, targetId: string): Promise<{ label: string } | { error: string }> {
  if (!targetId) return { error: "targetId is required for a cross-reference." }
  const projectId = targetProjectId || sourceProjectId
  let project
  try { project = await projects.getById(projectId, LOCAL_USER_ID) } catch { return { error: "targetProjectId must identify an accessible local project." } }
  for (const section of await scenes.listForProject(projectId, LOCAL_USER_ID)) {
    if (section.id === targetId) return { label: `${project.title} / ${section.scene_heading || "Untitled passage"}` }
    const target = (await elements.listForScene(section.id, LOCAL_USER_ID)).find((item) => item.id === targetId)
    if (target) {
      const parsed = parseTtrpgBlock(target.element_type, target.content)
      return { label: `${project.title} / ${section.scene_heading || "Untitled"} / ${(parsed ? ttrpgBlockToText(parsed) : target.content).split("\n")[0].slice(0, 60)}` }
    }
  }
  return { error: "targetId must identify a passage or block in the target project." }
}

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
    cross_reference: ["targetId", "targetProjectId", "label"],
  }
  const next = { ...before } as Record<string, unknown>
  for (const [key, value] of Object.entries(args)) {
    if (["block_id", "section_id", "after_block_id", "kind"].includes(key)) continue
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
    parameters: { type: "object", properties: { kind: { type: "string", description: "Block kind, e.g. clock, read_aloud, keyed_location, cross_reference, designer_note, rule_box, table, dice_table." }, section_id: { type: "string" } } } },
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
          !(kind === "random_table" && shortKind === "dice_table") &&
          !(kind === "table" && shortKind === "dice_table")) continue
        const block = parseTtrpgBlock(el.element_type, el.content)
        const target = block?.kind === "cross_reference"
          ? await resolveTarget(ctx.projectId, block.targetProjectId ?? "", block.targetId) : null
        result.push({ id: el.id, section_id: section.id, section: section.scene_heading, kind: shortKind === "callout" ? "designer_note" : shortKind,
          content: block ? ttrpgBlockToText(block, target && "label" in target ? target.label : undefined) : el.content,
          ...(block ?? {}), ...(target ? { target_status: "error" in target ? target.error : "ok", target_label: "label" in target ? target.label : block?.kind === "cross_reference" ? block.label : "" } : {}) })
      }
    }
    return JSON.stringify(result)
  },
}

export const createTtrpgBlock: ToolEntry = {
  spec: { name: "create_ttrpg_block", description: "Create a TTRPG clock, read-aloud box, keyed location, cross-reference, table, weighted random table, designer note, or rule box. Use after_block_id to place it after an existing block in the same section.",
    parameters: { type: "object", properties: {
      section_id: { type: "string" }, after_block_id: { type: "string" },
      kind: { type: "string", enum: [...kinds, ...textKinds] },
      name: { type: "string" }, segments: { type: "integer" }, filled: { type: "integer" }, note: { type: "string" },
      text: { type: "string" }, gmNote: { type: "string" }, key: { type: "string" },
      description: { type: "string" }, contents: { type: "string" }, targetId: { type: "string" }, targetProjectId: { type: "string" },
      content: { type: "string", description: "Text for table, designer_note, or rule_box; random tables accept 'Weight | Result' pipe rows." },
      rows: { type: "array", description: "Random-table outcomes. Each weight must be positive; omit weight for 1.", items: { type: "object", properties: { result: { type: "string" }, weight: { type: "number" } }, required: ["result"] } },
    }, required: ["section_id", "kind"] } },
  requires: "ttrpg", mutates: true, label: (args) => `Creating ${str(args, "kind") || "TTRPG"} block`,
  async run(args, ctx) {
    const sections = await projectSections(ctx)
    if (!sections) return "Choose a tabletop RPG project first."
    const section = sections.find((item) => item.id === str(args, "section_id"))
    if (!section) return "That section is not in this project."
    const kind = str(args, "kind")
    if (isTextKind(kind)) {
      const type = elementType(kind)
      if (args.rows !== undefined && type !== "dice_table") return "rows only applies to a random table."
      if (args.rows !== undefined && args.content !== undefined) return "Supply either rows or content, not both."
      const content = tableContent(args, kind)
      const error = validTextContent(type, content)
      if (error) return error
      const existing = await elements.listForScene(section.id, LOCAL_USER_ID)
      const created = await createPlacedTtrpgElement(ctx.projectId, section.id, type, content, existing, str(args, "after_block_id"))
      return typeof created === "string" ? created : `Created ${kind} block ${created.id} in ${section.scene_heading}.`
    }
    if (!kinds.some((item) => item === kind)) return "Unknown TTRPG block kind."
    const block = patchBlock(defaultTtrpgBlock(kind as TtrpgBlock["kind"]), args)
    if (typeof block === "string") return block
    if (block.kind === "cross_reference") {
      const target = await resolveTarget(ctx.projectId, block.targetProjectId ?? "", block.targetId)
      if ("error" in target) return target.error
      block.label = target.label
    }
    const existing = await elements.listForScene(section.id, LOCAL_USER_ID)
    const created = await createPlacedTtrpgElement(ctx.projectId, section.id, blockType(block.kind), JSON.stringify(block), existing, str(args, "after_block_id"))
    return typeof created === "string" ? created : `Created ${block.kind} block ${created.id} in ${section.scene_heading}.`
  },
}

export const updateTtrpgBlock: ToolEntry = {
  spec: { name: "update_ttrpg_block", description: "Edit a TTRPG typed block, table, random table, designer note, or rule box by stable block ID. Supply only fields to change.",
    parameters: { type: "object", properties: {
      block_id: { type: "string" }, name: { type: "string" }, segments: { type: "integer" }, filled: { type: "integer" },
      note: { type: "string" }, text: { type: "string" }, gmNote: { type: "string" }, key: { type: "string" },
      description: { type: "string" }, contents: { type: "string" }, targetId: { type: "string" }, targetProjectId: { type: "string" },
      content: { type: "string" }, rows: { type: "array", items: { type: "object", properties: { result: { type: "string" }, weight: { type: "number" } }, required: ["result"] } },
    }, required: ["block_id"] } },
  requires: "ttrpg", mutates: true, destructive: true, label: () => "Updating a TTRPG block",
  async describe(args, ctx) {
    const sections = await projectSections(ctx)
    if (!sections) return ""
    for (const section of sections) {
      const el = (await elements.listForScene(section.id, LOCAL_USER_ID)).find((item) => item.id === str(args, "block_id"))
      if (el) {
        const block = parseTtrpgBlock(el.element_type, el.content)
        return `Update ${block?.kind.replaceAll("_", " ") ?? el.element_type} "${(block ? ttrpgBlockToText(block) : el.content).split("\n")[0]}" in ${section.scene_heading}`
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
    if (["table", "dice_table", "callout", "rule_box"].includes(existing.element_type)) {
      if (Object.keys(args).some((key) => !["block_id", "content", "rows"].includes(key))) return "Use content (or rows for a random table) to edit this block."
      if (args.rows !== undefined && existing.element_type !== "dice_table") return "rows only applies to a random table."
      if (args.rows !== undefined && args.content !== undefined) return "Supply either rows or content, not both."
      const content = tableContent(args, existing.element_type)
      const error = validTextContent(existing.element_type, content)
      if (error) return error
      await elements.update(existing.id, { content })
      return `Updated ${existing.element_type} block ${existing.id}.`
    }
    const before = parseTtrpgBlock(existing.element_type, existing.content)
    if (!before) return "That ID is not a supported typed block, or its saved data is invalid."
    const next = patchBlock(before, args)
    if (typeof next === "string") return next
    if (next.kind === "cross_reference") {
      const target = await resolveTarget(ctx.projectId, next.targetProjectId ?? "", next.targetId)
      if ("error" in target) return target.error
      next.label = target.label
    }
    await elements.update(existing.id, { content: JSON.stringify(next) })
    return `Updated ${next.kind} block ${existing.id}.`
  },
}

export const rollTtrpgTable: ToolEntry = {
  spec: { name: "roll_ttrpg_table", description: "Roll a random result table N times and return outcome counts and percentages. A 'Weight | Result' header gives each row its declared positive weight; legacy Result tables use equal weights.",
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
      const counts = new Map<string, number>()
      const weights = new Map<string, number>()
      for (const row of table.rows) weights.set(row.result, (weights.get(row.result) ?? 0) + row.weight)
      for (let i = 0; i < Number(count); i++) {
        const outcome = rollRandomTable(table)
        counts.set(outcome.result, (counts.get(outcome.result) ?? 0) + 1)
      }
      return JSON.stringify({ rolls: count, outcomes: weights.size,
        distribution: [...weights].map(([result, weight]) => ({ result, weight,
          expected_percent: Math.round(weight / table.totalWeight * 10000) / 100,
          hits: counts.get(result) ?? 0,
          observed_percent: Math.round((counts.get(result) ?? 0) / Number(count) * 10000) / 100 })) })
    }
    return "That table is not in this project."
  },
}

const deletableTypes = new Set(["table", "dice_table", "callout", "rule_box", "stat_block", "ttrpg_stat", ...kinds.map(blockType)])

export const deleteTtrpgBlock: ToolEntry = {
  spec: { name: "delete_ttrpg_block", description: "Delete one TTRPG block by ID after confirmation. Includes tables, random tables, designer notes, rule boxes, stat blocks, and typed blocks. The writer can undo this from Recent AI changes.",
    parameters: { type: "object", properties: { block_id: { type: "string" } }, required: ["block_id"] } },
  requires: "ttrpg", mutates: true, destructive: true, label: () => "Deleting a TTRPG block",
  async describe(args, ctx) {
    const sections = await projectSections(ctx)
    if (!sections) return ""
    for (const section of sections) {
      const block = (await elements.listForScene(section.id, LOCAL_USER_ID)).find((item) => item.id === str(args, "block_id"))
      if (block && deletableTypes.has(block.element_type)) return `Delete ${block.element_type.replaceAll("_", " ")} in ${section.scene_heading || "Untitled section"}`
    }
    return ""
  },
  async run(args, ctx) {
    const sections = await projectSections(ctx)
    if (!sections) return "Choose a tabletop RPG project first."
    for (const section of sections) {
      const block = (await elements.listForScene(section.id, LOCAL_USER_ID)).find((item) => item.id === str(args, "block_id"))
      if (!block) continue
      if (!deletableTypes.has(block.element_type)) return "That ID is not a TTRPG block. Nothing was deleted."
      await elements.delete(block.id)
      await recordUndo({ projectId: ctx.projectId, tool: "delete_ttrpg_block", source: ctx.source ?? "chat",
        summary: `Deleted ${block.element_type.replaceAll("_", " ")} in ${section.scene_heading || "Untitled section"}`,
        restoreElementIds: [block.id] })
      return `Deleted block ${block.id}. The writer can undo this from Recent AI changes.`
    }
    return "That block is not in this project. Nothing was deleted."
  },
}
