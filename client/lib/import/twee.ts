/**
 * Parses Twee 3 source into an Interactive Fiction {@link ParsedProject} — the
 * inverse of `lib/export/if-twee.ts`. Each `:: Name [tags]` header starts a
 * passage; its body (until the next header) splits on blank lines into elements.
 *
 * Plain chunks containing only `[[…]]` links become choices. Inkwell's
 * SugarCube `<<set>>`, `<<if>>`, `StoryInit`, passage tags, and color metadata
 * are restored to their native editor forms. `StoryTitle` supplies the project
 * title; `StoryData` is compiler metadata and is skipped.
 *
 * Reference: https://github.com/iftechfoundation/twine-specs
 */

import type { ParsedElement, ParsedProject, ParsedScene } from "./types"
import { parsePassageMetadata, serializePassageMetadata, valueType, type IFVariableDefinition } from "@/lib/interactive-fiction/runtime"

/** Undo the header escapes the exporter applies (`\:` `\[` `\]` `\{` `\}` `\\`). */
function unescapeName(s: string): string {
  return s.replace(/\\([\\:[\]{}])/g, "$1")
}

const ONLY_LINKS = /^(\[\[[^\]]*\]\]\s*)+$/

function chunkToElement(chunk: string): ParsedElement {
  const trimmed = chunk.trim()
  const set = /^<<set\s+\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+?)>>$/.exec(trimmed)
  if (set) {
    let declared = ""
    try { declared = `:${valueType(JSON.parse(set[2]))}` } catch { /* expression, not a literal */ }
    return { type: "set", content: `{set $${set[1]}${declared} to ${fromSugarCubeExpression(set[2])}}` }
  }
  const conditional = /^<<if\s+([\s\S]+?)>>([\s\S]*?)(?:<<else>>([\s\S]*?))?<<\/if>>$/.exec(trimmed)
  if (conditional) return {
    type: "conditional",
    content: `{if ${fromSugarCubeExpression(conditional[1])}: ${conditional[2].trim()}${conditional[3] !== undefined ? ` else: ${conditional[3].trim()}` : ""}}`,
  }
  return { type: ONLY_LINKS.test(trimmed) ? "choice" : "body", content: chunk.replace(/\s+$/, "") }
}

function fromSugarCubeExpression(expression: string): string {
  let converted = ""
  let plain = ""
  let quote = ""
  let escaped = false
  const flushPlain = () => {
    converted += plain
      .replace(/!==/g, "!=")
      .replace(/===/g, "==")
      .replace(/&&/g, "and")
      .replace(/\|\|/g, "or")
      .replace(/!\s*(?!=)/g, "not ")
    plain = ""
  }
  for (const character of expression) {
    if (quote) {
      converted += character
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === quote) quote = ""
    } else if (character === '"' || character === "'") {
      flushPlain()
      quote = character
      converted += character
    } else {
      plain += character
    }
  }
  flushPlain()
  return converted
}

function parseTags(source: string): string[] {
  return [...source.matchAll(/"([^"]+)"|([^\s]+)/g)].map((match) => match[1] ?? match[2]).filter(Boolean)
}

export function parseTweeToIF(text: string, fallbackTitle: string): ParsedProject {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")

  let title = fallbackTitle
  const scenes: ParsedScene[] = []
  let currentName: string | null = null
  let bodyLines: string[] = []
  let isStoryTitle = false
  let isStoryData = false
  let isStoryInit = false
  let currentTags: string[] = []
  let currentColor = ""
  const initialVariables: IFVariableDefinition[] = []
  let startSceneIndex = -1

  const flush = () => {
    if (currentName === null) {
      bodyLines = []
      return
    }
    if (isStoryTitle) {
      const t = bodyLines.join("\n").trim()
      if (t) title = t
    } else if (isStoryInit) {
      const chunks = [...bodyLines.join("\n").matchAll(/<<set\s+[\s\S]*?>>/g)].map((match) => match[0])
      for (const chunk of chunks) {
        const element = chunkToElement(chunk)
        if (element.type !== "set") continue
        const match = /^\{set\s+\$([A-Za-z_][A-Za-z0-9_]*):?(string|number|boolean)?\s+to\s+([\s\S]+)\}$/.exec(element.content)
        if (!match) continue
        try {
          const initialValue = JSON.parse(match[3])
          initialVariables.push({ name: match[1], type: valueType(initialValue), initialValue })
        } catch { /* non-literal StoryInit values remain unsupported metadata */ }
      }
    } else if (!isStoryData) {
      const chunks = bodyLines.join("\n").split(/\n\s*\n/).filter((c) => c.trim().length > 0)
      scenes.push({
        heading: currentName,
        content: serializePassageMetadata({ tags: currentTags.filter((tag) => tag !== "Start"), color: currentColor }),
        elements: chunks.map(chunkToElement),
      })
      if (currentTags.includes("Start")) startSceneIndex = scenes.length - 1
    }
    bodyLines = []
  }

  for (const line of lines) {
    const header = /^::\s+(.*)$/.exec(line)
    if (header) {
      flush()
      let descriptor = header[1].trim()
      currentColor = ""
      const metadataMatch = /\s+(\{.*\})\s*$/.exec(descriptor)
      if (metadataMatch) {
        try { const metadata = JSON.parse(metadataMatch[1]); if (typeof metadata["inkwell-color"] === "string") currentColor = metadata["inkwell-color"] } catch { /* ignore foreign metadata */ }
        descriptor = descriptor.slice(0, metadataMatch.index).trim()
      }
      const tagsMatch = /\s*\[([^\]]*)\]\s*$/.exec(descriptor)
      currentTags = tagsMatch ? parseTags(tagsMatch[1]) : []
      if (tagsMatch) descriptor = descriptor.slice(0, tagsMatch.index).trim()
      const name = unescapeName(descriptor)
      currentName = name
      isStoryTitle = name === "StoryTitle"
      isStoryData = name === "StoryData"
      isStoryInit = name === "StoryInit"
      continue
    }
    if (currentName !== null) bodyLines.push(line)
  }
  flush()

  if (startSceneIndex > 0) scenes.unshift(scenes.splice(startSceneIndex, 1)[0])

  if (scenes[0] && initialVariables.length > 0) {
    const passageMetadata = parsePassageMetadata(scenes[0].content)
    const metadata = serializePassageMetadata({
      ...passageMetadata,
      story: { variables: initialVariables, testStates: [] },
    })
    scenes[0].content = metadata
  }

  if (scenes.length === 0) scenes.push({ heading: fallbackTitle, elements: [] })
  return { title, scenes }
}
