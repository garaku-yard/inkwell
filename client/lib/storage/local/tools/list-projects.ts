import { projects } from "../projects"
import { LOCAL_USER_ID } from "../shared"
import type { ToolEntry } from "./types"

/** Lists what the writer is working on. Personal projects only — org-owned
 *  ones live in a workspace of their own and `listOwned` filters them out
 *  (ADR 0024), so the description says so rather than quietly under-reporting. */
export const listProjects: ToolEntry = {
  spec: {
    name: "list_projects",
    description:
      "List the writer's projects: title, format, status and id for each. Use " +
      "it to answer questions about their body of work as a whole. Projects " +
      "owned by an organization are not included. Reading scenes only works " +
      "for the project this conversation is open on, whichever projects this " +
      "returns.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  mutates: false,
  label: () => "Listing projects",
  async run() {
    const { projects: owned } = await projects.listOwned(LOCAL_USER_ID)
    if (owned.length === 0) return "The writer has no projects yet."
    return owned
      .map(
        (p) =>
          `- ${p.title}${p.is_starred ? " ★" : ""} — ${p.category}, ${p.status}` +
          ` (id ${p.id}, updated ${p.updated_at})`,
      )
      .join("\n")
  },
}
