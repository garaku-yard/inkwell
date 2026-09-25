import { characters } from "../characters"
import { LOCAL_USER_ID } from "../shared"
import { sharedToolSpec } from "@/lib/ai/tool-contracts.generated"
import { characterAttributes, characterString } from "./character-args"
import type { ToolEntry } from "./types"

export const createCharacterTool: ToolEntry = {
  spec: sharedToolSpec("create_character"),
  mutates: true,
  label: (args) => {
    const name = characterString(args, "name")
    return name ? `Creating character "${name}"` : "Creating a character"
  },
  async run(args, ctx) {
    const name = characterString(args, "name")
    if (!name) return "Give the character a name."
    const existing = await characters.listForProject(ctx.projectId, LOCAL_USER_ID)
    if (existing.some((character) => character.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      return `A character named "${name}" already exists. Use update_character to change that profile.`
    }
    const character = await characters.create(ctx.projectId, LOCAL_USER_ID, {
      name,
      role: characterString(args, "role"),
      description: characterString(args, "description"),
      attributes: characterAttributes(args),
    })
    return `Created character "${character.name}". Its id is ${character.id}.`
  },
}
