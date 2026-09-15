import { jsPDF } from "jspdf"
import type { FullProject } from "@/services/project"

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

function buildScreenplayPDF(project: FullProject): jsPDF {
  const doc = new jsPDF({
    unit: "pt",
    format: "letter",
    orientation: "portrait",
  })

  doc.setFont("Courier", "normal")
  doc.setFontSize(FONT_SIZE)

  let y = MARGIN_TOP
  let page = 1

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
  doc.text("Written with Inkwell", PAGE_W / 2, PAGE_H / 2, { align: "center" })

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
      wrapText(doc, scene.scene_heading || "SCENE", MAX_W.scene),
      COL.scene,
      true,
      true,
    )

    for (const el of elements) {
      const content = el.content?.trim() || ""
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
          ensureSpace(LINE_H)
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
          ensureSpace(lines.length * LINE_H)
          writeBlock(lines, COL.dialogue)
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

  // "FADE OUT." at the end
  y += LINE_H * 2
  ensureSpace(LINE_H)
  doc.setFont("Courier", "bold")
  doc.text("FADE OUT.", MARGIN_LEFT + TEXT_W, y, { align: "right" })

  return doc
}

/** Produces PDF bytes without opening a save dialog (Drive backup path). */
export function renderScreenplayPdfBytes(project: FullProject): Uint8Array {
  return new Uint8Array(buildScreenplayPDF(project).output("arraybuffer"))
}

export function exportScreenplayToPDF(project: FullProject): void {
  const filename = `${project.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.pdf`
  buildScreenplayPDF(project).save(filename)
}
