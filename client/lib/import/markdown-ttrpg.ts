/**
 * Parses Markdown / plain text into a TTRPG {@link ParsedProject} — the inverse
 * of the Markdown export, mapped to the tabletop vocabulary:
 *   `# H1`              → new section (the scene heading)
 *   `## H2` … `###### `  → h2 (subsection) element
 *   blank-line text     → body element
 *
 * Plain `.txt` (no headings) lands as a single section of body paragraphs.
 *
 * (Intentionally a separate parser from `markdown-prose.ts` rather than a shared
 * tokenizer — only two consumers, so per the project's rule-of-three the small
 * duplication stays until a third format needs it.)
 */

import type { ParsedElement, ParsedProject, ParsedScene } from "./types"

export function parseMarkdownToTtrpg(text: string, fallbackTitle: string): ParsedProject {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")

  const scenes: ParsedScene[] = []
  let current: ParsedScene | null = null
  let paragraph: string[] = []

  const ensureScene = () => {
    if (!current) {
      current = { heading: fallbackTitle, elements: [] }
      scenes.push(current)
    }
    return current
  }

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    const content = paragraph.join(" ").trim()
    paragraph = []
    if (content) ensureScene().elements.push({ type: "body", content })
  }

  const pushElement = (el: ParsedElement) => {
    flushParagraph()
    ensureScene().elements.push(el)
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (line.trim() === "") {
      flushParagraph()
      continue
    }

    const h1 = /^#\s+(.*)$/.exec(line)
    if (h1) {
      flushParagraph()
      current = { heading: h1[1].trim(), elements: [] }
      scenes.push(current)
      continue
    }

    // TTRPG has a single subheading level (h2); map ## through ###### onto it.
    const sub = /^#{2,6}\s+(.*)$/.exec(line)
    if (sub) {
      pushElement({ type: "h2", content: sub[1].trim() })
      continue
    }

    paragraph.push(line.trim())
  }
  flushParagraph()

  if (scenes.length === 0) scenes.push({ heading: fallbackTitle, elements: [] })
  return { title: fallbackTitle, scenes }
}
