import {
  eventNameFromLabel,
  parseConditionalStatement,
  parseSetStatement,
  parseTriggerBlock,
  serializeTriggerBlock,
  type IFTriggerAction,
  type IFTriggerActionKind,
} from "@/lib/interactive-fiction/runtime"

import { elements } from "../elements"
import { projects } from "../projects"
import { scenes } from "../scenes"
import { LOCAL_USER_ID } from "../shared"
import type { ToolArgs, ToolEntry } from "./types"

const str = (args: ToolArgs, key: string) => typeof args[key] === "string" ? args[key].trim() : ""
const actionKinds: IFTriggerActionKind[] = ["reveal", "set", "conditional"]

function readActions(value: unknown): IFTriggerAction[] | string {
  if (!Array.isArray(value) || value.length === 0) return "actions must contain at least one reveal, set, or conditional action."
  const actions: IFTriggerAction[] = []
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return `Action ${index + 1} must be an object.`
    const item = raw as Record<string, unknown>
    const kind = typeof item.kind === "string" ? item.kind : ""
    const content = typeof item.content === "string" ? item.content.trim() : ""
    if (!actionKinds.includes(kind as IFTriggerActionKind)) return `Action ${index + 1} kind must be reveal, set, or conditional.`
    if (!content) return `Action ${index + 1} needs content.`
    try {
      if (kind === "set") parseSetStatement(content)
      if (kind === "conditional") parseConditionalStatement(content)
    } catch (error) {
      return `Action ${index + 1}: ${error instanceof Error ? error.message : "invalid action"}.`
    }
    actions.push({ id: `action-${index + 1}`, kind: kind as IFTriggerActionKind, content })
  }
  return actions
}

/** Create one executable named event directly in an Interactive Fiction passage. */
export const createIfTrigger: ToolEntry = {
  spec: {
    name: "create_if_trigger",
    description:
      "Create an executable named event in an Interactive Fiction passage. " +
      "Use this instead of writing prose that begins with TRIGGER. Actions run in order and may reveal writing, set a variable, or evaluate a condition.",
    parameters: {
      type: "object",
      properties: {
        passage_id: { type: "string", description: "Passage id from list_scenes." },
        event: { type: "string", description: "Stable event name. Start with a letter; then use letters, numbers, dot, colon, dash, or underscore. Derived from label when omitted." },
        label: { type: "string", description: "Writer-facing label shown in Play." },
        note: { type: "string", description: "Optional author note; never shown to the player." },
        once: { type: "boolean", description: "Whether the event can fire only once. Defaults to true." },
        actions: {
          type: "array",
          description: "Ordered executable actions. Set content uses {set $name[:type] to value}; conditional content uses {if expression: result else: result}.",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: actionKinds },
              content: { type: "string" },
            },
            required: ["kind", "content"],
          },
        },
      },
      required: ["passage_id", "label", "actions"],
    },
  },
  requires: "if",
  mutates: true,
  label: (args) => `Creating event${str(args, "label") ? ` “${str(args, "label")}”` : ""}`,
  async run(args, ctx) {
    const project = await projects.getById(ctx.projectId, LOCAL_USER_ID)
    if (project.category !== "interactive_fiction") return "Choose an Interactive Fiction project first."

    const passage = (await scenes.listForProject(ctx.projectId, LOCAL_USER_ID))
      .find((item) => item.id === str(args, "passage_id"))
    if (!passage) return "passage_id must identify a passage in this story."

    const label = str(args, "label")
    if (!label) return "label must not be empty."
    if (args.once !== undefined && typeof args.once !== "boolean") return "once must be true or false."
    if (args.note !== undefined && typeof args.note !== "string") return "note must be text."
    const actions = readActions(args.actions)
    if (typeof actions === "string") return actions

    const trigger = {
      event: str(args, "event") || eventNameFromLabel(label),
      label,
      note: str(args, "note"),
      once: args.once !== false,
      actions,
    }
    const content = serializeTriggerBlock(trigger)
    try {
      parseTriggerBlock(content)
    } catch (error) {
      return error instanceof Error ? error.message : "The event is invalid."
    }

    const existing = await elements.listForScene(passage.id, LOCAL_USER_ID)
    const duplicate = existing.some((element) => {
      if (element.element_type !== "trigger") return false
      try { return parseTriggerBlock(element.content).event === trigger.event } catch { return false }
    })
    if (duplicate) return `This passage already has an event named “${trigger.event}”.`

    const last = existing.at(-1)
    const created = await elements.create({
      projectId: ctx.projectId,
      sceneId: passage.id,
      elementOrder: last ? last.line_number + 1 : 0,
      elementType: "trigger",
      content,
    })
    return `Created event “${trigger.label}” (${trigger.event}) in “${passage.scene_heading || "Untitled"}”. Its stable id is ${created.id}.`
  },
}
