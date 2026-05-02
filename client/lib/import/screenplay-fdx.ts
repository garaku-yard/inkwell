/**
 * Minimal Final Draft (`.fdx`) importer. The format is plain XML with a
 * `<FinalDraft><Content>` wrapper holding one `<Paragraph Type="X">` per
 * line of the script; scenes are denoted by `<Paragraph Type="Scene Heading">`
 * markers, not by structural nesting. We stream that flat list into a
 * grouped shape that maps cleanly onto Inkwell's scene + element schema.
 *
 * The supported subset mirrors what `lib/export/screenplay-fdx.ts` writes,
 * so a round trip (export → reimport) preserves the content. Unknown
 * paragraph types are dropped rather than guessed at — downstream code
 * only knows the canonical element_type vocabulary, and silently
 * coercing "Singing" or "General" into ACTION risks misformatting.
 */

/** Element-type strings that match Inkwell's canonical ScriptElement
 *  vocabulary. Mapping comes from FDX_TYPE in screenplay-fdx.ts in
 *  reverse — DIALOG (not DIALOGUE) is the preferred internal name. */
const FDX_TO_INTERNAL: Record<string, string> = {
  "Action": "ACTION",
  "Character": "CHARACTER",
  "Parenthetical": "PARENTHETICAL",
  "Dialogue": "DIALOG",
  "Transition": "TRANSITION",
  "Shot": "SHOT",
}

export interface ParsedFdxElement {
  /** Internal element_type string (`ACTION`, `CHARACTER`, etc.). */
  type: string
  /** Text body, with parenthetical brackets normalised. */
  content: string
}

export interface ParsedFdxScene {
  heading: string
  elements: ParsedFdxElement[]
}

export interface ParsedFdx {
  title: string
  scenes: ParsedFdxScene[]
}

/** Pulls the body text out of a `<Paragraph>` node. FDX nests `<Text>`
 *  children that may carry style attributes; we concatenate their
 *  textContent so bold/italic runs flatten into a single string (we
 *  don't preserve inline formatting yet — that's a TODO for a richer
 *  importer once the editor surfaces those styles). */
function paragraphText(p: Element): string {
  const texts = p.getElementsByTagName("Text")
  let out = ""
  for (let i = 0; i < texts.length; i++) {
    out += texts[i].textContent ?? ""
  }
  return out.trim()
}

/** Reads the title-page block. Final Draft puts the title in the first
 *  `<Paragraph>` under `<TitlePage><Content>`; some exporters spread
 *  multiple lines (title, author, etc.) so we take the first non-empty
 *  paragraph as the title and ignore the rest. */
function readTitle(doc: Document): string {
  const titlePages = doc.getElementsByTagName("TitlePage")
  if (titlePages.length === 0) return ""
  const content = titlePages[0].getElementsByTagName("Content")[0]
  if (!content) return ""
  const paragraphs = content.getElementsByTagName("Paragraph")
  for (let i = 0; i < paragraphs.length; i++) {
    const t = paragraphText(paragraphs[i])
    if (t) return t
  }
  return ""
}

/**
 * Parses a Final Draft `.fdx` payload. Throws when the document isn't
 * well-formed XML or doesn't carry the `<FinalDraft>` root — callers
 * surface those as "this file isn't a Final Draft script".
 */
export function parseFdx(xml: string): ParsedFdx {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, "application/xml")
  const parseError = doc.getElementsByTagName("parsererror")[0]
  if (parseError) {
    throw new Error("Could not parse FDX file: malformed XML.")
  }
  const root = doc.documentElement
  if (!root || root.tagName !== "FinalDraft") {
    throw new Error("File doesn't look like a Final Draft script (missing <FinalDraft> root).")
  }

  const contentNodes = root.getElementsByTagName("Content")
  // The first <Content> is the script body; <TitlePage><Content> may
  // come second. We walk the whole document and skip paragraphs that
  // descend from a <TitlePage> ancestor.
  const allParagraphs = root.getElementsByTagName("Paragraph")

  const scenes: ParsedFdxScene[] = []
  let current: ParsedFdxScene | null = null

  for (let i = 0; i < allParagraphs.length; i++) {
    const p = allParagraphs[i]
    if (p.closest("TitlePage")) continue
    const type = p.getAttribute("Type") ?? "Action"
    const text = paragraphText(p)
    if (!text) continue

    if (type === "Scene Heading") {
      current = { heading: text, elements: [] }
      scenes.push(current)
      continue
    }

    if (!current) {
      // Pages with no leading scene heading get a synthetic blank
      // scene so the elements have somewhere to land.
      current = { heading: "", elements: [] }
      scenes.push(current)
    }

    const internal = FDX_TO_INTERNAL[type]
    if (!internal) continue

    const content = type === "Parenthetical"
      ? `(${text.replace(/^\(|\)$/g, "")})`
      : text

    current.elements.push({ type: internal, content })
  }

  // contentNodes is referenced once for shape-checking — empty body is
  // OK as long as we found a TitlePage with a useful title; an empty
  // both is worth telling the user about.
  if (scenes.length === 0 && contentNodes.length === 0) {
    throw new Error("FDX file is empty.")
  }

  const title = readTitle(doc) || "Imported screenplay"
  return { title, scenes }
}
