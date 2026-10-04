/**
 * Minimal Final Draft (`.fdx`) importer. The format is plain XML with a
 * `<FinalDraft><Content>` wrapper holding one `<Paragraph Type="X">` per
 * line of the script; scenes are denoted by `<Paragraph Type="Scene Heading">`
 * markers, not by structural nesting. We stream that flat list into a
 * grouped shape that maps cleanly onto Inkwell's scene + element schema.
 *
 * The supported subset mirrors what `lib/export/screenplay-fdx.ts` writes.
 * Unsupported paragraph types retain their words as Action and are reported
 * to the caller so an import cannot silently discard authored text.
 */

/** Element-type strings that match Inkwell's canonical ProjectElement
 *  vocabulary. Mapping comes from FDX_TYPE in screenplay-fdx.ts in
 *  reverse — DIALOG (not DIALOGUE) is the preferred internal name. */
const FDX_TO_INTERNAL: Record<string, string> = {
  "Action": "ACTION",
  "Character": "CHARACTER",
  "Parenthetical": "PARENTHETICAL",
  "Dialogue": "DIALOG",
  "Transition": "TRANSITION",
  "Shot": "SHOT",
  "Act Break": "NEW_ACT",
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
  warnings: string[]
  unsupportedStyles: string[]
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

const escapeHtml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

function paragraphHtml(p: Element, unsupportedStyles: string[]): string {
  return [...p.getElementsByTagName("Text")].map(node => {
    const style = node.getAttribute("Style") ?? ""
    for (const name of style.split(/[+,\s]+/).filter(Boolean)) {
      if (!["Bold", "Italic", "Underline"].includes(name) && !unsupportedStyles.includes(name)) unsupportedStyles.push(name)
    }
    let html = escapeHtml(node.textContent ?? "").replaceAll("\n", "<br>")
    if (/(?:^|\W)Underline(?:$|\W)/i.test(style)) html = `<u>${html}</u>`
    if (/(?:^|\W)Italic(?:$|\W)/i.test(style)) html = `<em>${html}</em>`
    if (/(?:^|\W)Bold(?:$|\W)/i.test(style)) html = `<strong>${html}</strong>`
    return html
  }).join("")
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

  // Only the root Content is script body. Header, Footer, and TitlePage
  // contain Paragraph nodes too, but are never screenplay elements.
  const bodyContent = [...root.children].find(node => node.tagName === "Content")
  const allParagraphs = bodyContent?.getElementsByTagName("Paragraph") ?? []

  const scenes: ParsedFdxScene[] = []
  const warnings: string[] = []
  const unsupportedStyles: string[] = []
  let current: ParsedFdxScene | null = null

  for (let i = 0; i < allParagraphs.length; i++) {
    const p = allParagraphs[i]
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

    const internal = type === "Act Break" && p.getAttribute("InkwellType") === "END_ACT" ? "END_ACT" : FDX_TO_INTERNAL[type] ?? "ACTION"
    if (!FDX_TO_INTERNAL[type] && !warnings.includes(type)) warnings.push(type)

    const content = type === "Parenthetical"
      ? `(${paragraphHtml(p, unsupportedStyles).replace(/^\(|\)$/g, "")})`
      : paragraphHtml(p, unsupportedStyles)

    current.elements.push({ type: internal, content })
  }

  // An empty script body is valid when the file still has a title page.
  if (scenes.length === 0 && !bodyContent && !readTitle(doc)) {
    throw new Error("FDX file is empty.")
  }

  const title = readTitle(doc) || "Imported screenplay"
  return { title, scenes, warnings, unsupportedStyles }
}
