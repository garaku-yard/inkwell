import { jsPDF } from "jspdf"
import type { FullProject } from "@/services/project"
import { editorHtmlToInline, plainInlineText } from "@/lib/editor/inline-content"

// US Letter in points (72pt = 1 inch)
const PAGE_W = 612
const PAGE_H = 792
const MARGIN_LEFT = 108  // 1.5"
const MARGIN_RIGHT = 72  // 1"
const MARGIN_TOP = 72    // 1"
const MARGIN_BOTTOM = 72 // 1"
const TEXT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT // 432pt = 6"
const FONT_SIZE = 12
const LINE_H = 14 // ~1 line in Courier 12pt

// Horizontal offsets from MARGIN_LEFT (in points)
const COL = {
  scene:         0,
  action:        0,
  character:     156, // ~2.1" from text block start → 3.6" from page left
  parenthetical: 120, // ~1.67"
  dialogue:      72,  // 1"
  transition:    TEXT_W, // right-aligned
}

// Max widths (in points)
const MAX_W = {
  scene:         TEXT_W,
  action:        TEXT_W,
  character:     TEXT_W - COL.character,
  parenthetical: 192, // 2.67"
  dialogue:      252, // 3.5"
  transition:    TEXT_W,
}

const screenplayText = (content: string) => plainInlineText(editorHtmlToInline(content))

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  // jsPDF splitTextToSize handles word-wrap
  return doc.splitTextToSize(text, maxWidth)
}

function pageNumber(doc: jsPDF, n: number) {
  doc.setFontSize(FONT_SIZE)
  doc.setFont("Courier", "normal")
  const label = `${n}.`
  doc.text(label, PAGE_W - MARGIN_RIGHT, MARGIN_TOP - LINE_H, { align: "right" })
}

export interface ScreenplaySubmissionOptions {
  byline?: string
  contact?: string
  anonymous?: boolean
}

function buildScreenplayPDF(project: FullProject, options: ScreenplaySubmissionOptions = {}): jsPDF {
  const doc = new jsPDF({
    unit: "pt",
    format: "letter",
    orientation: "portrait",
  })

  doc.setFont("Courier", "normal")
  doc.setFontSize(FONT_SIZE)

  let y = MARGIN_TOP
  let page = 1
  let characterCue = ""

  function ensureSpace(needed: number) {
    if (y + needed > PAGE_H - MARGIN_BOTTOM) {
      doc.addPage()
      page++
      pageNumber(doc, page)
      y = MARGIN_TOP
    }
  }

  function writeBlock(
    lines: string[],
    x: number,
    bold = false,
    uppercase = false,
    rightAlign = false,
  ) {
    doc.setFont("Courier", bold ? "bold" : "normal")
    for (const line of lines) {
      const out = uppercase ? line.toUpperCase() : line
      ensureSpace(LINE_H)
      if (rightAlign) {
        doc.text(out, MARGIN_LEFT + TEXT_W, y, { align: "right" })
      } else {
        doc.text(out, MARGIN_LEFT + x, y)
      }
      y += LINE_H
    }
    doc.setFont("Courier", "normal")
  }

  // Title page
  doc.setFont("Courier", "bold")
  doc.setFontSize(18)
  doc.text(project.title.toUpperCase(), PAGE_W / 2, PAGE_H / 2 - 30, { align: "center" })
  doc.setFontSize(FONT_SIZE)
  doc.setFont("Courier", "normal")
  if (!options.anonymous && options.byline?.trim()) {
    doc.text(`Written by ${options.byline.trim()}`, PAGE_W / 2, PAGE_H / 2 + 12, { align: "center", maxWidth: TEXT_W })
  }
  if (!options.anonymous && options.contact?.trim()) {
    doc.text(options.contact.trim().split(/\r?\n/), MARGIN_LEFT, PAGE_H - MARGIN_BOTTOM - 48)
  }

  doc.addPage()
  page = 1
  pageNumber(doc, page)
  y = MARGIN_TOP

  // Scenes sorted by order_index
  const scenes = [...(project.scenes ?? [])].sort((a, b) => a.order_index - b.order_index)

  for (const scene of scenes) {
    const elements = [...(scene.elements ?? [])].sort(
      (a, b) => a.line_number - b.line_number,
    )

    // Scene heading
    ensureSpace(LINE_H * 2)
    y += LINE_H // blank line before scene heading
    writeBlock(
      wrapText(doc, screenplayText(scene.scene_heading || "SCENE"), MAX_W.scene),
      COL.scene,
      true,
      true,
    )

    for (const el of elements) {
      const content = screenplayText(el.content?.trim() || "")
      if (!content) continue

      switch (el.element_type) {
        case "ACTION":
        case "TEXT": {
          y += Math.round(LINE_H * 0.5) // half-line gap
          const lines = wrapText(doc, content, MAX_W.action)
          ensureSpace(lines.length * LINE_H)
          writeBlock(lines, COL.action)
          break
        }
        case "CHARACTER": {
          y += LINE_H // blank line before character cue
          characterCue = content.toUpperCase()
          // Keep the cue with at least the first line of its dialogue.
          ensureSpace(LINE_H * 3)
          writeBlock(
            wrapText(doc, content, MAX_W.character),
            COL.character,
            false,
            true,
          )
          break
        }
        case "PARENTHETICAL": {
          const wrapped = `(${content.replace(/^\(|\)$/g, "")})`
          ensureSpace(LINE_H)
          writeBlock(wrapText(doc, wrapped, MAX_W.parenthetical), COL.parenthetical)
          break
        }
        case "DIALOG":
        case "DIALOGUE": {
          const lines = wrapText(doc, content, MAX_W.dialogue)
          for (let index = 0; index < lines.length; index++) {
            const hasMore = index < lines.length - 1
            if (y + LINE_H * (hasMore ? 2 : 1) > PAGE_H - MARGIN_BOTTOM) {
              if (index > 0) {
                doc.text("(MORE)", MARGIN_LEFT + COL.dialogue + MAX_W.dialogue, y, { align: "right" })
                doc.addPage()
                page++
                pageNumber(doc, page)
                y = MARGIN_TOP
                if (characterCue) writeBlock([`${characterCue} (CONT'D)`], COL.character)
              } else ensureSpace(LINE_H * 2)
            }
            writeBlock([lines[index]], COL.dialogue)
          }
          break
        }
        case "TRANSITION": {
          y += LINE_H
          ensureSpace(LINE_H)
          writeBlock(
            wrapText(doc, content, MAX_W.transition),
            COL.transition,
            false,
            true,
            true,
          )
          y += LINE_H
          break
        }
        case "SHOT": {
          ensureSpace(LINE_H)
          writeBlock(wrapText(doc, content, MAX_W.action), COL.action, false, true)
          break
        }
        case "NEW_ACT":
        case "END_ACT": {
          y += LINE_H
          ensureSpace(LINE_H)
          doc.setFont("Courier", "bold")
          doc.text(content.toUpperCase(), PAGE_W / 2, y, { align: "center" })
          y += LINE_H * 2
          doc.setFont("Courier", "normal")
          break
        }
        case "NOTE":
        case "OUTLINE":
          // Skip production notes and outline markers
          break
        default:
          break
      }
    }
  }

  return doc
}

/** Produces PDF bytes without opening a save dialog (Drive backup path). */
export function renderScreenplayPdfBytes(project: FullProject, options: ScreenplaySubmissionOptions = {}): Uint8Array {
  return new Uint8Array(buildScreenplayPDF(project, options).output("arraybuffer"))
}

export function exportScreenplayToPDF(project: FullProject, options: ScreenplaySubmissionOptions = {}): void {
  const filename = `${project.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.pdf`
  buildScreenplayPDF(project, options).save(filename)
}
