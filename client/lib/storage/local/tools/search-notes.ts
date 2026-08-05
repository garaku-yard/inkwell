import { knowledge } from "../knowledge"
import type { ToolArgs, ToolEntry } from "./types"

/** How many chunks one search returns. Matches the automatic retrieval that
 *  seeds the conversation, so a deliberate search is as wide as the free
 *  one the model gets without asking. */
const SEARCH_K = 8

function queryOf(args: ToolArgs): string {
  return typeof args.query === "string" ? args.query.trim() : ""
}

/** Semantic search across the notes this project has wired as knowledge.
 *
 *  Scoped by the same `retrieve` the chat already uses to seed context, so a
 *  search can't reach notes the writer hasn't shared with this project. It
 *  ranks by embedding similarity, which means it finds notes that discuss a
 *  subject without using the search words — and equally, that it returns
 *  nothing at all when the vault has never been indexed. */
export const searchNotes: ToolEntry = {
  spec: {
    name: "search_notes",
    description:
      "Search the writer's notes by meaning and return the closest passages " +
      "with the note each came from. Use it to find material the excerpts " +
      "already in this conversation don't cover; follow up with read_note for " +
      "a note's full text. Only notes wired into this project's knowledge are " +
      "searched.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "What to look for, phrased as the idea you want — full sentences " +
            "match better than keywords.",
        },
      },
      required: ["query"],
    },
  },
  requires: "knowledge",
  mutates: false,
  label: (args) => {
    const query = queryOf(args)
    return query ? `Searching notes for "${query}"` : "Searching notes"
  },
  async run(args, ctx) {
    const query = queryOf(args)
    if (!query) return "Give a query to search for."

    const hits = await knowledge.retrieve(ctx.projectId, query, SEARCH_K)
    if (hits.length === 0) {
      return (
        `Nothing in the wired notes matched "${query}". The vault's index may ` +
        "not be built yet — Settings → Knowledge builds it."
      )
    }
    return hits
      .map((hit) => `[Note: ${hit.title}] (similarity ${hit.score.toFixed(2)})\n${hit.text}`)
      .join("\n\n---\n\n")
  },
}
