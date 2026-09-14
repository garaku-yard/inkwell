import type { Project } from "@/services/project"
import { sharedToolSpec } from "@/lib/ai/tool-contracts.generated"

import { organizations } from "../organizations"
import { projects } from "../projects"
import { LOCAL_USER_ID } from "../shared"
import type { ToolEntry } from "./types"

function line(project: Project, owner: string): string {
  return (
    `- ${project.title}${project.is_starred ? " ★" : ""} — ${project.category}, ` +
    `${project.status}, ${owner} (id ${project.id}, updated ${project.updated_at})`
  )
}

/** Lists what the writer is working on, personal and org-owned alike.
 *
 *  Two lists, because `listOwned` deliberately excludes org projects: on the
 *  dashboard they belong to the org's workspace and would otherwise appear
 *  twice (ADR 0024). A tool answering "what am I working on" has no such
 *  duality, and leaving them out would hide real work.
 *
 *  Orgs themselves live on the gateway (ADR 0023), so listing them needs a
 *  linked cloud account *and* a reachable server. Either can be missing, and
 *  they fail differently: unlinked, `isAvailable()` is false; linked but
 *  offline, `list()` throws. Both end the same way here — the writer's
 *  personal projects are still returned, with a line saying what's missing,
 *  rather than an error that hides the projects this device can see perfectly
 *  well. */
export const listProjects: ToolEntry = {
  spec: sharedToolSpec("list_projects"),
  scope: "account",
  mutates: false,
  label: () => "Listing projects",
  async run() {
    const { projects: personal } = await projects.listOwned(LOCAL_USER_ID)
    const lines = personal.map((p) => line(p, "personal"))

    let orgNote = ""
    try {
      if (await organizations.isAvailable()) {
        for (const org of await organizations.list()) {
          for (const project of await organizations.listProjects(org.id)) {
            lines.push(line(project, `org: ${org.name}`))
          }
        }
      } else {
        orgNote = "no cloud account is linked"
      }
    } catch (err) {
      orgNote = (err as Error).message
    }
    if (orgNote) {
      // The reason may be a thrown message that already ends in a full stop.
      orgNote =
        `\n\n(Org-owned projects aren't included — ${orgNote.replace(/\.+$/, "")}. ` +
        "If you know an org project's id, use_project still accepts it.)"
    }

    if (lines.length === 0) return "The writer has no projects yet."
    return lines.join("\n") + orgNote
  },
}
