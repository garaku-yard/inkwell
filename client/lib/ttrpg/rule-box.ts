export interface RuleBox { name: string; content: string }

/** Older rule boxes are plain text. Structured boxes keep the optional title
 * separate so both the editor and MCP can edit it without parsing prose. */
export function parseRuleBox(raw: string): RuleBox {
  try {
    const value: unknown = JSON.parse(raw)
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const box = value as Record<string, unknown>
      if (box.kind === "rule_box" && typeof box.name === "string" && typeof box.content === "string") {
        return { name: box.name, content: box.content }
      }
    }
  } catch { /* legacy plain text */ }
  return { name: "", content: raw }
}

export function serializeRuleBox(box: RuleBox): string {
  return JSON.stringify({ kind: "rule_box", name: box.name, content: box.content })
}
