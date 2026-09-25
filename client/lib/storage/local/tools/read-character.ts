import { characters } from "../characters"
import { LOCAL_USER_ID } from "../shared"
import { sharedToolSpec } from "@/lib/ai/tool-contracts.generated"
import { characterString, findCharacter, formatCharacter } from "./character-args"
import type { ToolEntry } from "./types"

export const readCharacter: ToolEntry = {
  spec: sharedToolSpec("read_character"),
  mutates: false,
  label: (args) => {
    const ref = characterString(args, "character")
    return ref ? `Reading "${ref}"` : "Reading a character"
  },
  async run(args, ctx) {
    const ref = characterString(args, "character")
    if (!ref) return "Give the character's id or exact name."
    const list = await characters.listForProject(ctx.projectId, LOCAL_USER_ID)
    const character = findCharacter(list, ref)
    if (!character) return `No character named or identified by "${ref}" exists in this project.`
    return formatCharacter(character)
  },
}
