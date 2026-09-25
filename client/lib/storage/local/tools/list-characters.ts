import { characters } from "../characters"
import { LOCAL_USER_ID } from "../shared"
import { sharedToolSpec } from "@/lib/ai/tool-contracts.generated"
import type { ToolEntry } from "./types"

export const listCharacters: ToolEntry = {
  spec: sharedToolSpec("list_characters"),
  mutates: false,
  label: () => "Listing characters",
  async run(_args, ctx) {
    const list = await characters.listForProject(ctx.projectId, LOCAL_USER_ID)
    if (list.length === 0) return "This project has no character profiles yet."
    return list
      .map((character, index) =>
        `${index + 1}. ${character.name}${character.role ? ` — ${character.role}` : ""} (id ${character.id})`,
      )
      .join("\n")
  },
}
