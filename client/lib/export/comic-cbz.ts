/**
 * CBZ (Comic Book Zip) exporter for comic script projects.
 *
 * CBZ is a plain ZIP archive whose entries are read in lexical order
 * by readers like CDisplay, ComicRack, Tachiyomi, and Mihon. The format
 * doesn't mandate images — readers happily render text files when no
 * images are present — so until Inkwell stores per-panel artwork we
 * emit one `.txt` file per page (zero-padded so the order stays right
 * past page 9 / 99).
 *
 * Once panel artwork is in scope this module's job becomes "render the
 * page composition to a PNG and add it to the same archive." The rest
 * of the orchestration (filename slug, MIME type, download) is reused.
 */

import { strToU8, zipSync } from "fflate"
import type { FullProject, ProjectElement } from "@/services/project"

/** Width of the zero-padded page number in the entry filename. Three
 *  digits is plenty for any practical comic script (longest published
 *  ongoing series clock in around 800 issues; per-issue page counts are
 *  measured in tens) and keeps the same pad-width regardless of how
 *  long the script grows. */
const PAGE_NUMBER_PAD = 3

/** Format a single page as plain text. Mirrors the on-screen layout
 *  (Page header → panels → character/balloon/caption/sfx/transition
 *  blocks) so an exported CBZ still reads like a script. */
function pageToText(pageIndex: number, heading: string, elements: ProjectElement[]): string {
  const lines: string[] = []
  lines.push(`PAGE ${pageIndex + 1}${heading ? ` — ${heading}` : ""}`)
  lines.push("=".repeat(40))
  lines.push("")

  let panelNumber = 0
  for (const el of elements) {
    const content = el.content?.trim() ?? ""
    if (!content) continue
    switch (el.element_type) {
      case "panel":
        panelNumber += 1
        lines.push(`Panel ${panelNumber}`)
        lines.push(content)
        lines.push("")
        break
      case "character":
        lines.push(content.toUpperCase())
        break
      case "balloon":
        lines.push(`    ${content}`)
        lines.push("")
        break
      case "caption":
        lines.push(`CAPTION: ${content}`)
        lines.push("")
        break
      case "sfx":
        lines.push(`SFX: ${content}`)
        lines.push("")
        break
      case "transition":
        lines.push(content.toUpperCase())
        lines.push("")
        break
      default:
        lines.push(content)
    }
  }
  return lines.join("\n")
}

/**
 * Triggers a browser download of the project's CBZ archive. One entry
 * per page, named `page-001.txt`, plus an `info.txt` cover at the top
 * of the archive that summarises the script (title + page count).
 */
export function exportComicToCBZ(project: FullProject): void {
  const pages = [...(project.scenes ?? [])].sort(
    (a, b) => a.order_index - b.order_index,
  )

  const archive: Record<string, Uint8Array> = {}

  // Lead with a friendly cover so readers that look for an `info.txt`
  // or `ComicInfo.xml` find something useful. We're not emitting full
  // ComicInfo metadata yet — that's a follow-up once we capture
  // authorship + cover art.
  const cover = [
    project.title || "Untitled",
    "=".repeat(40),
    `${pages.length} page${pages.length === 1 ? "" : "s"}`,
    project.description ?? "",
  ]
    .filter(Boolean)
    .join("\n")
  archive["info.txt"] = strToU8(cover)

  pages.forEach((page, idx) => {
    const elements = [...(page.elements ?? [])].sort(
      (a, b) => a.line_number - b.line_number,
    )
    const text = pageToText(idx, page.scene_heading ?? "", elements)
    const padded = String(idx + 1).padStart(PAGE_NUMBER_PAD, "0")
    archive[`page-${padded}.txt`] = strToU8(text)
  })

  const zipped = zipSync(archive, { level: 6 })
  const blob = new Blob([zipped as BlobPart], { type: "application/vnd.comicbook+zip" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${project.title.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "comic"}.cbz`
  a.click()
  URL.revokeObjectURL(url)
}
