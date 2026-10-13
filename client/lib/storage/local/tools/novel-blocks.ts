import { defaultNovelBlock, NOVEL_BLOCK_KINDS, novelBlockText, novelNumbering, novelReferenceLabel, parseNovelBlock, type NovelBlock, type NovelBlockKind } from "@/lib/editor/novel-blocks"
import { renderNovelHtml, type NovelPagePreset } from "@/lib/export/novel-html"
import { elements } from "../elements"
import { projects } from "../projects"
import { scenes } from "../scenes"
import { LOCAL_USER_ID } from "../shared"
import { createPlacedTtrpgElement } from "./ttrpg-placement"
import type { ToolArgs, ToolContext, ToolEntry } from "./types"

const str = (args: ToolArgs, key: string) => typeof args[key] === "string" ? args[key] as string : ""
const imageData = (value: string) => !value || (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value) && value.length <= 1_000_000)

async function novelProject(ctx: ToolContext) {
  const project = await projects.getFull(ctx.projectId, LOCAL_USER_ID)
  return project.category === "novel" ? project : null
}

function patchBlock(block: NovelBlock, args: ToolArgs): NovelBlock | string {
  const allowed: Record<NovelBlockKind, string[]> = {
    figure: ["caption", "alt", "image_data_url"], step: ["title", "body", "image_data_url"],
    materials: ["materials", "tools"], callout: ["tone", "body"],
    build_card: ["difficulty", "time", "output"], cross_reference: ["target_type", "target_id"],
    glossary: ["entries"], index: ["entries"],
  }
  const next = { ...block } as Record<string, unknown>
  for (const [key, value] of Object.entries(args)) {
    if (["kind", "section_id", "block_id", "after_block_id"].includes(key)) continue
    if (!allowed[block.kind].includes(key)) return `Unknown ${block.kind} field: ${key}.`
    if (key === "entries") {
      if (!Array.isArray(value)) return "entries must be an array."
      if (block.kind === "glossary") {
        if (value.some(item => !item || typeof item !== "object" || Array.isArray(item) || typeof item.term !== "string" || typeof item.definition !== "string")) return "Glossary entries need term and definition text."
        next.entries = value.map(item => ({ term: item.term, definition: item.definition }))
      } else if (block.kind === "index") {
        if (value.some(item => !item || typeof item !== "object" || Array.isArray(item) || typeof item.term !== "string" || !["chapter", "figure"].includes(item.targetType) || typeof item.targetId !== "string")) return "Index entries need term, targetType (chapter or figure), and targetId."
        next.entries = value.map(item => ({ term: item.term, targetType: item.targetType, targetId: item.targetId }))
      }
      continue
    }
    if (typeof value !== "string") return `${key} must be text.`
    const field = key === "image_data_url" ? "image" : key === "target_type" ? "targetType" : key === "target_id" ? "targetId" : key
    next[field] = value
  }
  if ((block.kind === "figure" || block.kind === "step") && !imageData(String(next.image ?? ""))) return "image_data_url must be a JPG or PNG data URL under 750 KB."
  if (block.kind === "callout" && !["warning", "aside"].includes(String(next.tone))) return "tone must be warning or aside."
  if (block.kind === "cross_reference" && !["chapter", "figure"].includes(String(next.targetType))) return "target_type must be chapter or figure."
  return next as NovelBlock
}

const fields = {
  kind: { type: "string", enum: [...NOVEL_BLOCK_KINDS] },
  section_id: { type: "string", description: "Chapter ID from list_scenes." },
  block_id: { type: "string", description: "Stable element ID from list_novel_blocks." },
  after_block_id: { type: "string", description: "Optional ID of the block after which to insert." },
  caption: { type: "string" }, alt: { type: "string" }, image_data_url: { type: "string", description: "Optional data:image/png;base64,... or data:image/jpeg;base64,... under 750 KB." },
  title: { type: "string" }, body: { type: "string" }, materials: { type: "string", description: "One item per line." },
  tools: { type: "string", description: "One item per line." }, tone: { type: "string", enum: ["warning", "aside"] },
  difficulty: { type: "string" }, time: { type: "string" }, output: { type: "string" },
  target_type: { type: "string", enum: ["chapter", "figure"] }, target_id: { type: "string", description: "Stable chapter or figure ID." },
  entries: { type: "array", description: "For glossary: [{term, definition}]. For index: [{term, targetType: chapter|figure, targetId}].", items: { type: "object" } },
}

function validTargets(block: NovelBlock, numbers: ReturnType<typeof novelNumbering>): boolean {
  if (block.kind === "cross_reference") return (block.targetType === "chapter" ? numbers.chapterLabels : numbers.figureLabels).has(block.targetId)
  if (block.kind === "index") return block.entries.every(entry => (entry.targetType === "chapter" ? numbers.chapterLabels : numbers.figureLabels).has(entry.targetId))
  return true
}

export const listNovelBlocks: ToolEntry = {
  spec: { name: "list_novel_blocks", description: "List structured novel blocks, including figures, steps, glossary, and index, with current numbers and stable IDs.",
    parameters: { type: "object", properties: { section_id: fields.section_id } } },
  requires: "novel", mutates: false, label: () => "Listing novel blocks",
  async run(args, ctx) {
    const project = await novelProject(ctx)
    if (!project) return "Choose a novel project first."
    const numbers = novelNumbering(project)
    const result = []
    for (const section of project.scenes ?? []) {
      if (str(args, "section_id") && str(args, "section_id") !== section.id) continue
      for (const element of section.elements ?? []) {
        const block = parseNovelBlock(element)
        if (!block) continue
        const label = block.kind === "figure" ? numbers.figureLabels.get(element.id)
          : block.kind === "step" ? numbers.stepLabels.get(element.id)
          : block.kind === "cross_reference" ? novelReferenceLabel(block, numbers) : undefined
        result.push({ id: element.id, section_id: section.id, label, text: novelBlockText(block, label, numbers),
          ...block, ...(block.kind === "figure" || block.kind === "step" ? { image: block.image ? "[image attached]" : "" } : {}) })
      }
    }
    return JSON.stringify(result)
  },
}

export const readNovelBlock: ToolEntry = {
  spec: { name: "read_novel_block", description: "Read one structured novel block by stable ID, including its full JPG/PNG image data URL when attached and its current display number.",
    parameters: { type: "object", properties: { block_id: fields.block_id }, required: ["block_id"] } },
  requires: "novel", mutates: false, label: () => "Reading a novel block",
  async run(args, ctx) {
    const project = await novelProject(ctx)
    if (!project) return "Choose a novel project first."
    for (const section of project.scenes ?? []) {
      const element = (section.elements ?? []).find(item => item.id === str(args, "block_id"))
      if (!element) continue
      const block = parseNovelBlock(element)
      if (!block) return "That element is not a structured novel block."
      const numbers = novelNumbering(project)
      const label = block.kind === "figure" ? numbers.figureLabels.get(element.id)
        : block.kind === "step" ? numbers.stepLabels.get(element.id)
        : block.kind === "cross_reference" ? novelReferenceLabel(block, numbers) : undefined
      return JSON.stringify({ id: element.id, section_id: section.id, label, ...block })
    }
    return "block_id must identify a block in this novel."
  },
}

export const createNovelBlock: ToolEntry = {
  spec: { name: "create_novel_block", description: "Create a structured block in a novel chapter, including glossary and index blocks. Figures and steps accept JPG/PNG data URLs. References target stable chapter or figure IDs.",
    parameters: { type: "object", properties: { ...fields }, required: ["section_id", "kind"] } },
  requires: "novel", mutates: true, label: () => "Creating a novel block",
  async run(args, ctx) {
    if (!await novelProject(ctx)) return "Choose a novel project first."
    const kind = str(args, "kind") as NovelBlockKind
    if (!NOVEL_BLOCK_KINDS.includes(kind)) return `kind must be one of: ${NOVEL_BLOCK_KINDS.join(", ")}.`
    const section = (await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)).find(item => item.id === str(args, "section_id"))
    if (!section) return "section_id must identify a chapter in this novel."
    const block = patchBlock(defaultNovelBlock(kind), args)
    if (typeof block === "string") return block
    if (block.kind === "cross_reference" || block.kind === "index") {
      const project = await novelProject(ctx)
      const numbers = novelNumbering(project!)
      if (!validTargets(block, numbers)) return "Every target ID must identify a chapter or figure in this novel."
    }
    const existing = await elements.listForScene(section.id, LOCAL_USER_ID)
    const created = await createPlacedTtrpgElement(ctx.projectId, section.id, kind, JSON.stringify(block), existing, str(args, "after_block_id"))
    return typeof created === "string" ? created : `Created ${kind} in ${section.scene_heading || "Untitled"}. Its stable id is ${created.id}.`
  },
}

export const updateNovelBlock: ToolEntry = {
  spec: { name: "update_novel_block", description: "Edit a structured novel block by stable ID, including replacing or clearing its image_data_url.",
    parameters: { type: "object", properties: { ...fields }, required: ["block_id"] } },
  requires: "novel", mutates: true, destructive: true, label: () => "Updating a novel block",
  async describe(args) { return `Update block ${str(args, "block_id")}` },
  async run(args, ctx) {
    const project = await novelProject(ctx)
    if (!project) return "Choose a novel project first."
    const element = project.scenes?.flatMap(section => section.elements ?? []).find(item => item.id === str(args, "block_id"))
    if (!element) return "block_id must identify a block in this novel."
    const before = parseNovelBlock(element)
    if (!before) return "That element is not a structured novel block."
    const next = patchBlock(before, args)
    if (typeof next === "string") return next
    if (next.kind === "cross_reference" || next.kind === "index") {
      const numbers = novelNumbering(project)
      if (!validTargets(next, numbers)) return "Every target ID must identify a chapter or figure in this novel."
    }
    await elements.update(element.id, { content: JSON.stringify(next) })
    return `Updated ${next.kind} ${element.id}.`
  },
}

export const moveNovelStep: ToolEntry = {
  spec: { name: "move_novel_step", description: "Move a step one position up or down among steps in its chapter; displayed step numbers update automatically.",
    parameters: { type: "object", properties: { block_id: fields.block_id, direction: { type: "string", enum: ["up", "down"] } }, required: ["block_id", "direction"] } },
  requires: "novel", mutates: true, label: () => "Moving a novel step",
  async run(args, ctx) {
    const project = await novelProject(ctx)
    if (!project) return "Choose a novel project first."
    const direction = str(args, "direction")
    if (direction !== "up" && direction !== "down") return "direction must be up or down."
    for (const section of project.scenes ?? []) {
      const steps = (section.elements ?? []).filter(item => item.element_type === "step")
      const index = steps.findIndex(item => item.id === str(args, "block_id"))
      if (index < 0) continue
      const other = steps[index + (direction === "up" ? -1 : 1)]
      if (!other) return "The step is already at that end of its chapter."
      const current = steps[index]
      const currentContent = current.content
      const otherContent = other.content
      await elements.update(current.id, { content: otherContent })
      try {
        await elements.update(other.id, { content: currentContent })
      } catch (error) {
        await elements.update(current.id, { content: currentContent })
        throw error
      }
      return `Moved step ${direction}; step numbers will update from chapter order.`
    }
    return "block_id must identify a step in this novel."
  },
}

export const deleteNovelBlock: ToolEntry = {
  spec: { name: "delete_novel_block", description: "Remove a structured block from a novel by stable ID. Figure numbers and cross-references update; references to the removed figure become missing references.",
    parameters: { type: "object", properties: { block_id: fields.block_id }, required: ["block_id"] } },
  requires: "novel", mutates: true, destructive: true, label: () => "Removing a novel block",
  async describe(args) { return `Remove block ${str(args, "block_id")}` },
  async run(args, ctx) {
    const project = await novelProject(ctx)
    if (!project) return "Choose a novel project first."
    const element = project.scenes?.flatMap(section => section.elements ?? []).find(item => item.id === str(args, "block_id"))
    if (!element || !parseNovelBlock(element)) return "block_id must identify a structured block in this novel."
    await elements.delete(element.id)
    return `Removed ${element.element_type} ${element.id}.`
  },
}

export const exportNovelHtmlTool: ToolEntry = {
  spec: { name: "export_novel_html", description: "Return standalone typesetting HTML for this novel with resolved figure/step numbers, live cross-references, embedded images, and an A6 or A7 CSS page-size preset. Print or typeset the HTML for final pagination.",
    parameters: { type: "object", properties: { page_size: { type: "string", enum: ["a6", "a7"] } }, required: ["page_size"] } },
  requires: "novel", mutates: false, label: () => "Exporting novel HTML",
  async run(args, ctx) {
    const project = await novelProject(ctx)
    if (!project) return "Choose a novel project first."
    const pageSize = str(args, "page_size")
    if (pageSize !== "a6" && pageSize !== "a7") return "page_size must be a6 or a7."
    return renderNovelHtml(project, pageSize as NovelPagePreset)
  },
}
