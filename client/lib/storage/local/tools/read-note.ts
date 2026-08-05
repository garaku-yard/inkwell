import { knowledge } from "../knowledge"
import type { ToolArgs, ToolEntry } from "./types"

/** Reads the `title` argument, tolerating a model that omits it or sends the
 *  wrong type. An empty title falls through to the "no such note" answer,
 *  which tells the model what went wrong far better than a thrown error. */
function titleOf(args: ToolArgs): string {
  return typeof args.title === "string" ? args.title : ""
}

/** Fetches one note's full body by title, scoped to what the project has
 *  wired as knowledge. The scope check lives in `knowledge.readNoteForTool`,
 *  so a model cannot reach a note the writer hasn't shared with the project. */
export const readNote: ToolEntry = {
  spec: {
    name: "read_note",
    description:
      "Fetch the full markdown body of one of the writer's notes by its title. " +
      "Use this when the retrieved excerpts are not enough and you need the " +
      "complete note. Only notes in the project's wired knowledge scope are " +
      "available.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The note's title (its filename without the .md extension).",
        },
      },
      required: ["title"],
    },
  },
  mutates: false,
  summarize: titleOf,
  async run(args, ctx) {
    const title = titleOf(args)
    const note = await knowledge.readNoteForTool(ctx.projectId, title)
    return note
      ? note.content
      : `No note titled "${title}" is in this project's knowledge scope.`
  },
}
