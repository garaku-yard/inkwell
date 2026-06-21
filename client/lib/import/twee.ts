/**
 * Parses Twee 3 source into an Interactive Fiction {@link ParsedProject} — the
 * inverse of `lib/export/if-twee.ts`. Each `:: Name [tags]` header starts a
 * passage; its body (until the next header) splits on blank lines into elements.
 *
 * The export flattens every element's type away (it joins contents with blank
 * lines), so on the way back a chunk that is purely `[[…]]` link(s) is restored
 * as a `choice`; everything else becomes `body`. The special `StoryTitle`
 * passage supplies the project title; `StoryData` (JSON metadata) is skipped.
 *
 * Reference: https://github.com/iftechfoundation/twine-specs
 */

import type { ParsedElement, ParsedProject, ParsedScene } from "./types"

/** Undo the header escapes the exporter applies (`\:` `\[` `\]` `\{` `\}` `\\`). */
function unescapeName(s: string): string {
  return s.replace(/\\([\\:[\]{}])/g, "$1")
}

const ONLY_LINKS = /^(\[\[[^\]]*\]\]\s*)+$/

function chunkToElement(chunk: string): ParsedElement {
  const trimmed = chunk.trim()
  return { type: ONLY_LINKS.test(trimmed) ? "choice" : "body", content: chunk.replace(/\s+$/, "") }
}

export function parseTweeToIF(text: string, fallbackTitle: string): ParsedProject {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")

  let title = fallbackTitle
  const scenes: ParsedScene[] = []
  let currentName: string | null = null
  let bodyLines: string[] = []
  let isStoryTitle = false
  let isStoryData = false

  const flush = () => {
    if (currentName === null) {
      bodyLines = []
      return
    }
    if (isStoryTitle) {
      const t = bodyLines.join("\n").trim()
      if (t) title = t
    } else if (!isStoryData) {
      const chunks = bodyLines.join("\n").split(/\n\s*\n/).filter((c) => c.trim().length > 0)
      scenes.push({ heading: currentName, elements: chunks.map(chunkToElement) })
    }
    bodyLines = []
  }

  for (const line of lines) {
    const header = /^::\s+(.*)$/.exec(line)
    if (header) {
      flush()
      // Strip trailing [tags] and {metadata} the exporter / Twine may append.
      const name = unescapeName(
        header[1].replace(/\s*\[[^\]]*\]\s*$/, "").replace(/\s*\{[^}]*\}\s*$/, "").trim(),
      )
      currentName = name
      isStoryTitle = name === "StoryTitle"
      isStoryData = name === "StoryData"
      continue
    }
    if (currentName !== null) bodyLines.push(line)
  }
  flush()

  if (scenes.length === 0) scenes.push({ heading: fallbackTitle, elements: [] })
  return { title, scenes }
}
