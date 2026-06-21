/**
 * Parses Markdown / plain text into a prose {@link ParsedProject} — the inverse
 * of `lib/export/text-export.ts` (Markdown). Plain `.txt` works too: with no
 * headings it lands as a single chapter of paragraphs.
 *
 * Mapping (prose / memoir vocabulary):
 *   `# H1`        → new chapter (the scene heading)
 *   `## H2`       → heading_2 element
 *   `### H3`      → heading_3 element
 *   `* * *` / `---` / `***`  → scene_break element
 *   blank-line-separated text → paragraph element
 *
 * Soft-wrapped lines within a paragraph are joined with a space (Markdown
 * convention). The first chapter falls back to `fallbackTitle` when content
 * appears before any `#` heading.
 */

import type { ParsedElement, ParsedProject, ParsedScene } from "./types"

const SCENE_BREAK = /^(\* \* \*|\*\*\*|---|___)\s*$/

export function parseMarkdownToProse(text: string, fallbackTitle: string): ParsedProject {
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
    if (content) ensureScene().elements.push({ type: "paragraph", content })
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

    const h2 = /^##\s+(.*)$/.exec(line)
    if (h2) {
      pushElement({ type: "heading_2", content: h2[1].trim() })
      continue
    }

    const h3 = /^###\s+(.*)$/.exec(line)
    if (h3) {
      pushElement({ type: "heading_3", content: h3[1].trim() })
      continue
    }

    if (SCENE_BREAK.test(line.trim())) {
      pushElement({ type: "scene_break", content: "* * *" })
      continue
    }

    paragraph.push(line.trim())
  }
  flushParagraph()

  // A heading with no following body still deserves to exist; an empty file
  // yields a single empty chapter so the editor isn't left with nothing.
  if (scenes.length === 0) scenes.push({ heading: fallbackTitle, elements: [] })

  return { title: fallbackTitle, scenes }
}
