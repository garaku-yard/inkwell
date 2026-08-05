import { beatBoard } from "../beat-board"
import type { ToolArgs, ToolEntry } from "./types"

/** Card geometry, matching what the board's own "add beat" button creates so
 *  a beat added here doesn't look like it came from somewhere else. */
const CARD = { width: 250, height: 150, color: "#fef3c7" }

/** New cards are laid out in a grid instead of all landing at the origin,
 *  which is what a bare default position would do — the writer would find one
 *  card and several hidden underneath it. */
const GRID = { columns: 4, originX: 80, originY: 80, stepX: 290, stepY: 190 }

function stringArg(args: ToolArgs, key: string): string {
  const value = args[key]
  return typeof value === "string" ? value.trim() : ""
}

/** Adds a card to the project's beat board. Format-agnostic: every project
 *  has a board, including the `board` category, which is only a board. */
export const addBeat: ToolEntry = {
  spec: {
    name: "add_beat",
    description:
      "Add a beat card to the beat board of the project this conversation is " +
      "open on — the planning surface where the writer arranges what happens " +
      "before writing it. Use it to record a story beat they've decided on, " +
      "not to think out loud.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short name for the beat, as it reads on the card.",
        },
        description: {
          type: "string",
          description: "Optional detail — what happens in this beat.",
        },
      },
      required: ["title"],
    },
  },
  mutates: true,
  label: (args) => {
    const title = stringArg(args, "title")
    return title ? `Adding beat "${title}"` : "Adding a beat"
  },
  async run(args, ctx) {
    const title = stringArg(args, "title")
    if (!title) return "Give the beat a title."

    const board = await beatBoard.getBoard(ctx.projectId)
    const index = board.beats.length
    await beatBoard.createBeat(ctx.projectId, {
      title,
      description: stringArg(args, "description"),
      position: {
        x: GRID.originX + (index % GRID.columns) * GRID.stepX,
        y: GRID.originY + Math.floor(index / GRID.columns) * GRID.stepY,
      },
      width: CARD.width,
      height: CARD.height,
      color: CARD.color,
      act: 1,
      order: index,
      startPage: 1,
      endPage: 1,
    })
    return `Added the beat "${title}" to the board.`
  },
}
