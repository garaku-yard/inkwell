import type { ProjectCategory } from "@/services/project"

import { projects } from "../projects"
import { LOCAL_USER_ID } from "../shared"
import { workspaces } from "../workspaces"
import type { ToolArgs, ToolEntry } from "./types"

/** Formats a tool may create.
 *
 *  `vault` is absent on purpose: a vault project is a folder of markdown on
 *  disk, and the folder is chosen through a native picker the writer has to
 *  answer. Creating the row without one would leave a project that opens onto
 *  nothing. */
const CREATABLE: ProjectCategory[] = [
  "novel",
  "memoir",
  "screenplay",
  "comic_script",
  "poetry",
  "lyrics",
  "interactive_fiction",
  "tabletop_rpg",
  "board",
]

function stringArg(args: ToolArgs, key: string): string {
  const value = args[key]
  return typeof value === "string" ? value.trim() : ""
}

/** Makes sure a personal workspace exists that can show this format, creating
 *  one if not. Returns whether it had to.
 *
 *  The dashboard lists a project only when the active workspace's categories
 *  include its format (`hooks/useProjects.ts`), and the app's own new-project
 *  dialog can only offer formats the active workspace already holds — so a
 *  project made through the UI is always visible somewhere. A tool that can
 *  create any format has to close that gap itself; otherwise it produces a
 *  project the writer has nowhere to find, which is only a slower way of
 *  losing their work. */
async function ensureWorkspaceFor(category: ProjectCategory): Promise<boolean> {
  const { personal } = await workspaces.list()
  const covered = personal.some((ws) =>
    (ws.categories ?? []).some((c) => c.slug === category),
  )
  if (covered) return false
  await workspaces.createPersonal(LOCAL_USER_ID, [category])
  return true
}

/** Starts a new project. Account-scoped: it makes the thing the other tools
 *  act on, so it can't require one to have been chosen first. */
export const createProject: ToolEntry = {
  spec: {
    name: "create_project",
    description:
      "Start a new project for the writer. Pick the format that matches what " +
      "they're writing — it decides the editor they get and how their text is " +
      "stored, and it can't be changed afterwards. Follow with use_project to " +
      "work on it.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "What the project is called." },
        category: {
          type: "string",
          enum: CREATABLE,
          description:
            "The format: novel or memoir for prose, screenplay, comic_script, " +
            "poetry or lyrics for verse, interactive_fiction for branching " +
            "passages, tabletop_rpg for supplements, board for a bare planning " +
            "canvas.",
        },
        description: {
          type: "string",
          description: "Optional one-line description.",
        },
      },
      required: ["title", "category"],
    },
  },
  scope: "account",
  mutates: true,
  label: (args) => {
    const title = stringArg(args, "title")
    return title ? `Creating "${title}"` : "Creating a project"
  },
  async run(args) {
    const title = stringArg(args, "title")
    if (!title) return "Give the project a title."

    const category = stringArg(args, "category") as ProjectCategory
    if (!CREATABLE.includes(category)) {
      return (
        `"${category}" isn't a format a tool can create. ` +
        `Choose one of: ${CREATABLE.join(", ")}.`
      )
    }

    const project = await projects.create({
      title,
      description: stringArg(args, "description") || undefined,
      owner_id: LOCAL_USER_ID,
      category,
    })

    let where = ""
    try {
      if (await ensureWorkspaceFor(category)) {
        where = ` Added a ${category} workspace to the dashboard rail for it — the writer may need to switch to it.`
      }
    } catch (err) {
      // The project is real and reachable by id even if this failed; say so
      // rather than implying it will be sitting on the dashboard.
      where =
        ` It may not show on the dashboard: no workspace holds ${category} ` +
        `projects and one couldn't be added (${(err as Error).message}).`
    }

    return (
      `Created the ${category} project "${project.title}". Its id is ` +
      `${project.id} — call use_project with it to start writing.${where}`
    )
  },
}
