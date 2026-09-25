import { characters } from "../characters"
import { LOCAL_USER_ID } from "../shared"
import { sharedToolSpec } from "@/lib/ai/tool-contracts.generated"
import { characterString, findCharacter, formatCharacter } from "./character-args"
import type { ToolArgs, ToolEntry } from "./types"

function optionalString(args: ToolArgs, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(args, key) ? characterString(args, key) : undefined
}

export const updateCharacterTool: ToolEntry = {
  spec: sharedToolSpec("update_character"),
  mutates: true,
  label: (args) => {
    const ref = characterString(args, "character")
    return ref ? `Updating character "${ref}"` : "Updating a character"
  },
  async run(args, ctx) {
    const ref = characterString(args, "character")
    if (!ref) return "Give the character's id or exact name."
    const list = await characters.listForProject(ctx.projectId, LOCAL_USER_ID)
    const current = findCharacter(list, ref)
    if (!current) return `No character named or identified by "${ref}" exists in this project.`

    const attributes = { ...current.attributes }
    for (const key of ["traits", "motivation", "voice", "relationships"] as const) {
      const value = optionalString(args, key)
      if (value === undefined) continue
      if (value) attributes[key] = value
      else delete attributes[key]
    }
    const updated = await characters.update(current.id, LOCAL_USER_ID, {
      name: optionalString(args, "name"),
      role: optionalString(args, "role"),
      description: optionalString(args, "description"),
      attributes,
    })
    return `Updated character profile.\n${formatCharacter(updated)}`
  },
}
