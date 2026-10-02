import { elements } from "../elements"
import { projects } from "../projects"
import { scenes } from "../scenes"
import { LOCAL_USER_ID, newId } from "../shared"
import { parseStatInstance, validateStatInstance, type StatField, type StatInstance, type StatSchema } from "@/lib/ttrpg/stat-schemas"
import type { ToolArgs, ToolContext, ToolEntry } from "./types"

const string = (args: ToolArgs, key: string): string =>
  typeof args[key] === "string" ? args[key].trim() : ""

async function ttrpgProject(ctx: ToolContext) {
  const project = await projects.getById(ctx.projectId, LOCAL_USER_ID)
  if (project.category !== "tabletop_rpg") return null
  return project
}

function valuesArg(value: unknown, schema: StatSchema): Record<string, string> | string {
  if (value === undefined) return {}
  if (!value || typeof value !== "object" || Array.isArray(value)) return "values must be an object of field names or IDs to text."
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string" && typeof entry !== "number") return `${key} must have a text or numeric value.`
    const field = schema.fields.find((item) => item.id === key || item.label.toLowerCase() === key.toLowerCase())
    if (!field) return `Unknown field "${key}" for ${schema.name}. List the schema first.`
    result[field.id] = String(entry)
  }
  return result
}

const projectOnly = "Choose a tabletop RPG project with use_project first."

export const listStatSchemas: ToolEntry = {
  spec: {
    name: "list_ttrpg_stat_schemas",
    description: "List this TTRPG project's stat block shapes and exact field IDs, names, types, and choice options before writing blocks.",
    parameters: { type: "object", properties: {} },
  },
  requires: "ttrpg",
  mutates: false,
  label: () => "Listing stat block schemas",
  async run(_args, ctx) {
    const project = await ttrpgProject(ctx)
    return project ? JSON.stringify(project.ttrpg_stat_schemas ?? []) : projectOnly
  },
}

export const saveStatSchema: ToolEntry = {
  spec: {
    name: "save_ttrpg_stat_schema",
    description: "Create or edit a project-owned stat block shape. For an edit, provide schema_id and each existing field's id to preserve values in existing blocks. Fields can be text, number, or choice.",
    parameters: {
      type: "object",
      properties: {
        schema_id: { type: "string", description: "Existing schema ID to edit; omit to create." },
        name: { type: "string", description: "Shape name, e.g. Fault or Organism." },
        fields: { type: "array", items: { type: "object", properties: {
          id: { type: "string" }, label: { type: "string" }, kind: { type: "string", enum: ["text", "number", "choice"] },
          options: { type: "array", items: { type: "string" } },
        }, required: ["label", "kind"] } },
      },
      required: ["name", "fields"],
    },
  },
  requires: "ttrpg",
  mutates: true,
  label: (args) => `Saving ${string(args, "name") || "stat block"} schema`,
  async run(args, ctx) {
    const project = await ttrpgProject(ctx)
    if (!project) return projectOnly
    const name = string(args, "name")
    const rawFields = args.fields
    if (!name || !Array.isArray(rawFields) || rawFields.length > 30) return "Give a name and up to 30 fields."
    const schemas = project.ttrpg_stat_schemas ?? []
    const id = string(args, "schema_id") || newId()
    const existing = schemas.find((item) => item.id === id)
    if (string(args, "schema_id") && !existing) return "That schema is not in this project."
    if (schemas.some((item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) return `A ${name} schema already exists.`
    const fields: StatField[] = []
    for (const input of rawFields) {
      if (!input || typeof input !== "object" || Array.isArray(input)) return "Every field must be an object."
      const field = input as Record<string, unknown>
      const label = typeof field.label === "string" ? field.label.trim() : ""
      const kind = field.kind
      if (!label || (kind !== "text" && kind !== "number" && kind !== "choice")) return "Every field needs a label and a valid kind."
      const fieldId = typeof field.id === "string" && field.id.trim()
        ? field.id.trim()
        : existing?.fields.find((item) => item.label.toLowerCase() === label.toLowerCase())?.id ?? newId()
      const options = kind === "choice" && Array.isArray(field.options)
        ? field.options.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
        : []
      if (kind === "choice" && !options.length) return `${label} needs choice options.`
      fields.push({ id: fieldId, label, kind, ...(kind === "choice" ? { options } : {}) })
    }
    if (new Set(fields.map((field) => field.id)).size !== fields.length ||
      new Set(fields.map((field) => field.label.toLowerCase())).size !== fields.length) return "Field IDs and labels must be unique."
    const schema: StatSchema = { id, name, fields }
    const next = existing ? schemas.map((item) => item.id === id ? schema : item) : [...schemas, schema]
    await projects.update(ctx.projectId, LOCAL_USER_ID, { ttrpg_stat_schemas: next })
    return JSON.stringify(schema)
  },
}

export const listTtrpgStatBlocks: ToolEntry = {
  spec: {
    name: "query_ttrpg_stat_blocks",
    description: "Find structured TTRPG stat blocks by schema, section, and field value. Returns block and section IDs so a block can be edited precisely.",
    parameters: { type: "object", properties: {
      schema: { type: "string", description: "Schema name or ID, e.g. Fault." },
      section_id: { type: "string" },
      field: { type: "string", description: "Field name or ID, e.g. Status." },
      equals: { type: "string", description: "Exact field value, case insensitive." },
    } },
  },
  requires: "ttrpg",
  mutates: false,
  label: () => "Querying TTRPG stat blocks",
  async run(args, ctx) {
    const project = await ttrpgProject(ctx)
    if (!project) return projectOnly
    const schemas = project.ttrpg_stat_schemas ?? []
    const schemaFilter = string(args, "schema").toLowerCase()
    const sectionFilter = string(args, "section_id")
    const fieldFilter = string(args, "field").toLowerCase()
    const equals = string(args, "equals").toLowerCase()
    if (equals && !fieldFilter) return "Give a field when filtering by equals."
    const found = []
    for (const scene of await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)) {
      if (sectionFilter && scene.id !== sectionFilter) continue
      for (const el of await elements.listForScene(scene.id, LOCAL_USER_ID)) {
        if (el.element_type !== "ttrpg_stat") continue
        const instance = parseStatInstance(el.content)
        if (!instance) continue
        const schema = schemas.find((item) => item.id === instance.schemaId)
        if (schemaFilter && schema?.id.toLowerCase() !== schemaFilter && schema?.name.toLowerCase() !== schemaFilter) continue
        const field = schema?.fields.find((item) => item.id.toLowerCase() === fieldFilter || item.label.toLowerCase() === fieldFilter)
        if (fieldFilter && !field) continue
        if (field && equals && (instance.values[field.id] ?? "").toLowerCase() !== equals) continue
        found.push({ id: el.id, section_id: scene.id, section: scene.scene_heading, schema: schema?.name ?? "Missing schema", ...instance })
      }
    }
    return JSON.stringify(found)
  },
}

export const createTtrpgStatBlock: ToolEntry = {
  spec: {
    name: "create_ttrpg_stat_block",
    description: "Add a structured stat block to a TTRPG section using a project schema. List schemas first; values keys may be field labels or IDs.",
    parameters: { type: "object", properties: {
      section_id: { type: "string" }, schema_id: { type: "string" }, name: { type: "string" },
      values: { type: "object", additionalProperties: { type: "string" } },
    }, required: ["section_id", "schema_id", "name"] },
  },
  requires: "ttrpg",
  mutates: true,
  label: (args) => `Creating ${string(args, "name") || "stat"} block`,
  async run(args, ctx) {
    const project = await ttrpgProject(ctx)
    if (!project) return projectOnly
    const schema = project.ttrpg_stat_schemas?.find((item) => item.id === string(args, "schema_id"))
    if (!schema) return "That schema is not in this project. Call list_ttrpg_stat_schemas."
    const section = (await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)).find((item) => item.id === string(args, "section_id"))
    if (!section) return "That section is not in this project. Call list_scenes."
    const values = valuesArg(args.values, schema)
    if (typeof values === "string") return values
    const instance: StatInstance = { schemaId: schema.id, name: string(args, "name"), values }
    const error = validateStatInstance(instance, schema)
    if (error) return error
    const existing = await elements.listForScene(section.id, LOCAL_USER_ID)
    const order = existing.length ? existing[existing.length - 1].line_number + 1 : 0
    const created = await elements.create({ projectId: ctx.projectId, sceneId: section.id,
      elementOrder: order, elementType: "ttrpg_stat", content: JSON.stringify(instance) })
    return `Created ${schema.name} block "${instance.name}" in ${section.scene_heading}. Its id is ${created.id}.`
  },
}

export const updateTtrpgStatBlock: ToolEntry = {
  spec: {
    name: "update_ttrpg_stat_block",
    description: "Change a structured stat block by ID. Values patches update only named fields; other fields stay as written.",
    parameters: { type: "object", properties: {
      block_id: { type: "string" }, name: { type: "string" },
      values: { type: "object", additionalProperties: { type: "string" } },
    }, required: ["block_id"] },
  },
  requires: "ttrpg",
  mutates: true,
  destructive: true,
  label: () => "Updating a TTRPG stat block",
  async describe(args, ctx) {
    for (const scene of await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)) {
      const block = (await elements.listForScene(scene.id, LOCAL_USER_ID)).find((item) => item.id === string(args, "block_id"))
      if (block) return `Update ${parseStatInstance(block.content)?.name ?? block.id} in ${scene.scene_heading}`
    }
    return ""
  },
  async run(args, ctx) {
    const project = await ttrpgProject(ctx)
    if (!project) return projectOnly
    for (const scene of await scenes.listForProject(ctx.projectId, LOCAL_USER_ID)) {
      const block = (await elements.listForScene(scene.id, LOCAL_USER_ID)).find((item) => item.id === string(args, "block_id"))
      if (!block) continue
      if (block.element_type !== "ttrpg_stat") return "That ID is not a structured stat block."
      const before = parseStatInstance(block.content)
      if (!before) return "This block has invalid saved data; nothing was changed."
      const schema = project.ttrpg_stat_schemas?.find((item) => item.id === before.schemaId)
      if (!schema) return "This block's schema is missing; nothing was changed."
      const values = valuesArg(args.values, schema)
      if (typeof values === "string") return values
      const next = { ...before, name: args.name === undefined ? before.name : string(args, "name"),
        values: { ...before.values, ...values } }
      const error = validateStatInstance(next, schema)
      if (error) return error
      await elements.update(block.id, { content: JSON.stringify(next) })
      return `Updated ${schema.name} block "${next.name}". Its id is ${block.id}.`
    }
    return "No block with that ID belongs to this project. Query stat blocks first."
  },
}
