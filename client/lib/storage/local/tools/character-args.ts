import type { Character } from "@/services/project"

import type { ToolArgs } from "./types"

export function characterString(args: ToolArgs, key: string): string {
  const value = args[key]
  return typeof value === "string" ? value.trim() : ""
}

export function characterAttributes(args: ToolArgs): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const key of ["traits", "motivation", "voice", "relationships"] as const) {
    const value = characterString(args, key)
    if (value) attributes[key] = value
  }
  return attributes
}

export function findCharacter(list: Character[], ref: string): Character | undefined {
  const normalized = ref.toLocaleLowerCase()
  return list.find(
    (character) =>
      character.id === ref || character.name.toLocaleLowerCase() === normalized,
  )
}

export function formatCharacter(character: Character): string {
  const details = [
    `Name: ${character.name}`,
    `ID: ${character.id}`,
    character.role && `Role: ${character.role}`,
    character.description && `Description: ${character.description}`,
    character.attributes.traits && `Traits: ${character.attributes.traits}`,
    character.attributes.motivation && `Motivation: ${character.attributes.motivation}`,
    character.attributes.voice && `Voice: ${character.attributes.voice}`,
    character.attributes.relationships && `Relationships: ${character.attributes.relationships}`,
  ].filter(Boolean)
  return details.join("\n")
}
