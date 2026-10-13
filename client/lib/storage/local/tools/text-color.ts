import { colorInlineRange, editorHtmlToInline, inlineToHtml, plainInlineText, safeInlineColor } from "@/lib/editor/inline-content"
import { colorMarkdownRange } from "@/lib/editor/markdown-color"
import { parseNovelBlock } from "@/lib/editor/novel-blocks"
import { parseRuleBox, serializeRuleBox } from "@/lib/ttrpg/rule-box"
import { elements } from "../elements"
import { projects } from "../projects"
import { scenes } from "../scenes"
import { LOCAL_USER_ID } from "../shared"
import { vault } from "../vault"
import type { ToolEntry } from "./types"

/** Shared with the desktop MCP bridge and the in-app tool loop. */
export const setTextColor: ToolEntry = {
  spec: {
    name: "set_text_color",
    description: "Color or reset selected words in an editor. Use UTF-16 start/end offsets in the visible element text; Vault notes use raw Markdown source offsets. Pass color as #RRGGBB or null to reset. Read the text first to determine the exact range.",
    parameters: {
      type: "object",
      properties: {
        element_id: { type: "string", description: "Element ID in a Novel, Memoir, Poetry, Lyrics, Screenplay, Comic, TTRPG, or IF project." },
        scene_id: { type: "string", description: "Screenplay scene ID when coloring its heading instead of an element." },
        filename: { type: "string", description: "Vault note filename, including .md, instead of element_id." },
        start: { type: "integer", description: "Inclusive UTF-16 offset of selected text." },
        end: { type: "integer", description: "Exclusive UTF-16 offset of selected text." },
        color: { type: ["string", "null"], description: "#RRGGBB to color, or null to restore default text color." },
      },
      required: ["start", "end", "color"],
    },
  },
  mutates: true,
  label: () => "Coloring selected text",
  async run(args, ctx) {
    const project = await projects.getFull(ctx.projectId, LOCAL_USER_ID)
    const start = args.start
    const end = args.end
    const color = args.color
    if (typeof start !== "number" || typeof end !== "number" || (color !== null && (typeof color !== "string" || !safeInlineColor(color)))) return "Give valid start/end offsets and a #RRGGBB color, or null to reset it."

    if (project.category === "vault") {
      const filename = typeof args.filename === "string" ? args.filename : ""
      const note = (await vault.listNotes(ctx.projectId)).find(item => item.filename === filename)
      if (!note) return "filename must identify a note in this Vault."
      const source = await vault.readNote(ctx.projectId, filename)
      const changed = colorMarkdownRange(source, start, end, color)
      if (!changed) return "The range or color is invalid, or the selected text has no color to reset."
      await vault.writeNote(ctx.projectId, filename, changed.content)
      return `Updated text color in ${filename}.`
    }

    const sceneId = typeof args.scene_id === "string" ? args.scene_id : ""
    if (sceneId) {
      if (project.category !== "screenplay") return "Scene-heading text color is available for screenplay projects."
      const scene = (project.scenes ?? []).find(item => item.id === sceneId)
      if (!scene) return "scene_id must identify a scene in this screenplay."
      const changed = colorInlineRange(editorHtmlToInline(scene.scene_heading), start, end, color)
      if (changed === null) return "The selected range is outside the heading text."
      await scenes.updateHeading(scene.id, LOCAL_USER_ID, inlineToHtml(changed))
      return `Updated text color in scene ${scene.id}.`
    }

    const elementId = typeof args.element_id === "string" ? args.element_id : ""
    const element = (project.scenes ?? []).flatMap(scene => scene.elements ?? []).find(item => item.id === elementId)
    if (!element) return "element_id must identify an element in this project."
    if (project.category === "novel" && parseNovelBlock(element)) return "Structured Novel blocks use their own fields; choose a prose element."
    if (project.category === "tabletop_rpg" && !["body", "h2", "callout", "rule_box"].includes(element.element_type)) return "Choose a TTRPG prose, heading, callout, or rule text element."
    if (project.category === "interactive_fiction" && !["body", "note"].includes(element.element_type)) return "Choose IF passage prose or an author note."
    if (["vault", "board"].includes(project.category)) return "Choose an editor text element."

    const rule = project.category === "tabletop_rpg" && element.element_type === "rule_box" ? parseRuleBox(element.content) : null
    const original = rule ? rule.content : project.category === "screenplay" ? editorHtmlToInline(element.content) : element.content
    const changed = colorInlineRange(original, start, end, color)
    if (changed === null) return `The range must select visible text within 0–${plainInlineText(original).length}.`
    const content = rule ? serializeRuleBox({ ...rule, content: changed }) : project.category === "screenplay" ? inlineToHtml(changed) : changed
    await elements.update(element.id, { content })
    return `Updated text color in element ${element.id}.`
  },
}
