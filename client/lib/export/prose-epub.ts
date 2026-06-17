/**
 * Minimal EPUB 3 exporter for Prose / Memoir projects.
 *
 * EPUB is a ZIP archive with a strict layout: the first entry MUST be
 * an uncompressed `mimetype` file with the literal value
 * `application/epub+zip`. After that, a `META-INF/container.xml` points
 * readers at the OPF package document, which in turn declares the
 * spine, the manifest of resources, and the navigation document.
 *
 * Reference: https://www.w3.org/TR/epub-33/
 *
 * The output is intentionally minimalist — Calibre, Apple Books, and
 * Adobe Digital Editions all open the file, but it carries no cover
 * art, fonts, or stylesheets beyond a tiny baseline. Adding a cover or
 * a custom CSS file is a follow-up; the structure here is the
 * scaffolding everything else slots into.
 */

import { strToU8, zipSync, type Zippable } from "fflate"
import type { FullProject, Scene, ProjectElement } from "@/services/project"

// ─── XML helpers ────────────────────────────────────────────────────

/** Escape text for inclusion in an XML text node. */
function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/** Escape text for inclusion in an XML attribute value. */
function escapeXmlAttr(s: string): string {
  return escapeXmlText(s).replace(/"/g, "&quot;")
}

/** Slugify the project title into a filename-safe stem. */
function slugify(s: string): string {
  return (s || "book").replace(/[^a-z0-9]/gi, "_").toLowerCase()
}

// ─── Per-chapter XHTML ──────────────────────────────────────────────

/** Render one prose element as a paragraph- or heading-shaped XHTML
 *  fragment. Element types we don't have a mapping for fall back to
 *  a plain `<p>` so the writer's words still surface in the export. */
function elementToXhtml(el: ProjectElement): string {
  const content = escapeXmlText((el.content ?? "").trim())
  if (!content) return ""
  switch (el.element_type) {
    case "scene_break":
      return `      <p class="scene-break">* * *</p>`
    case "chapter_heading":
      return `      <h2>${content}</h2>`
    case "scene_heading_stinger":
      return `      <p class="stinger"><em>${content}</em></p>`
    case "dialogue":
      return `      <p class="dialogue">${content}</p>`
    case "paragraph":
    default:
      return `      <p>${content}</p>`
  }
}

/** Render one chapter (scene) as a complete XHTML 1.1 document so it
 *  can stand alone inside the EPUB spine. */
function chapterToXhtml(idx: number, scene: Scene): string {
  const title = scene.scene_heading || `Chapter ${idx + 1}`
  const elements = [...(scene.elements ?? [])].sort(
    (a, b) => a.line_number - b.line_number,
  )
  const body = elements.map(elementToXhtml).filter(Boolean).join("\n")
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeXmlText(title)}</title>
    <link rel="stylesheet" type="text/css" href="style.css" />
  </head>
  <body>
    <section epub:type="chapter" id="chapter-${idx + 1}">
      <h1>${escapeXmlText(title)}</h1>
${body}
    </section>
  </body>
</html>
`
}

// ─── Package document + nav + container ─────────────────────────────

function buildContainerXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>
`
}

function buildOpf(project: FullProject, chapters: { id: string; href: string; title: string }[]): string {
  const bookId = `urn:uuid:${(globalThis.crypto as Crypto).randomUUID()}`
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
  const manifestItems = chapters
    .map(c => `    <item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml" />`)
    .join("\n")
  const spineItems = chapters
    .map(c => `    <itemref idref="${c.id}" />`)
    .join("\n")

  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXmlText(bookId)}</dc:identifier>
    <dc:title>${escapeXmlText(project.title || "Untitled")}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${escapeXmlText(now)}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="style" href="style.css" media-type="text/css" />
${manifestItems}
  </manifest>
  <spine>
${spineItems}
  </spine>
</package>
`
}

function buildNav(project: FullProject, chapters: { id: string; href: string; title: string }[]): string {
  const items = chapters
    .map(c => `        <li><a href="${escapeXmlAttr(c.href)}">${escapeXmlText(c.title)}</a></li>`)
    .join("\n")
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeXmlText(project.title || "Untitled")}</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      <ol>
${items}
      </ol>
    </nav>
  </body>
</html>
`
}

/** Tiny baseline stylesheet so chapter headings, dialogue, and
 *  scene breaks don't all render at body-text weight in readers
 *  with no defaults of their own. */
const BASELINE_CSS = `body { font-family: Georgia, "Times New Roman", serif; line-height: 1.55; padding: 0 1em; }
h1 { font-size: 1.6em; margin: 1.5em 0 1em; text-align: center; }
h2 { font-size: 1.3em; margin: 1.5em 0 0.6em; }
p { margin: 0 0 0.8em; text-indent: 1.5em; }
p.dialogue { text-indent: 0; padding-left: 1em; }
p.stinger { text-align: center; font-size: 0.9em; letter-spacing: 0.08em; text-transform: uppercase; }
p.scene-break { text-align: center; letter-spacing: 0.6em; margin: 2em 0; }
`

// ─── Top-level builder ──────────────────────────────────────────────

/**
 * Builds the EPUB archive bytes for `project`. Returns a Uint8Array
 * suitable for handing to a Blob + download anchor. Exported separately
 * so a future export-via-Tauri flow can reuse the same byte builder.
 */
export function buildEpub(project: FullProject): Uint8Array {
  const scenes = [...(project.scenes ?? [])].sort(
    (a, b) => a.order_index - b.order_index,
  )

  const archive: Zippable = {}

  // The mimetype entry is special: it MUST be the first entry in the
  // archive AND uncompressed (level: 0). fflate honours per-entry
  // options and emits the central directory in insertion order, so as
  // long as we add this key first the spec is satisfied.
  archive["mimetype"] = [strToU8("application/epub+zip"), { level: 0 }]

  archive["META-INF/container.xml"] = [strToU8(buildContainerXml()), { level: 6 }]

  const chapters = scenes.map((scene, idx) => ({
    id: `chap-${idx + 1}`,
    href: `chapter-${String(idx + 1).padStart(3, "0")}.xhtml`,
    title: scene.scene_heading || `Chapter ${idx + 1}`,
  }))

  archive["OEBPS/content.opf"] = [strToU8(buildOpf(project, chapters)), { level: 6 }]
  archive["OEBPS/nav.xhtml"] = [strToU8(buildNav(project, chapters)), { level: 6 }]
  archive["OEBPS/style.css"] = [strToU8(BASELINE_CSS), { level: 6 }]

  scenes.forEach((scene, idx) => {
    archive[`OEBPS/${chapters[idx].href}`] = [
      strToU8(chapterToXhtml(idx, scene)),
      { level: 6 },
    ]
  })

  return zipSync(archive)
}

/**
 * Triggers a browser download of the project's EPUB. Filename slug
 * mirrors the other prose exporters so multiple formats sit next to
 * each other on disk.
 */
export function exportProseToEpub(project: FullProject): void {
  const bytes = buildEpub(project)
  const blob = new Blob([bytes as BlobPart], { type: "application/epub+zip" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${slugify(project.title)}.epub`
  a.click()
  URL.revokeObjectURL(url)
}
