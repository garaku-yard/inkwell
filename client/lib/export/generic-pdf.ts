import { jsPDF } from "jspdf"

import type { FullProject } from "@/services/project"
import type { IwFile } from "@/lib/iw/format"

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 64
const BODY_W = PAGE_W - MARGIN * 2
const BOTTOM = PAGE_H - MARGIN

/** Readable, format-neutral PDF used for non-screenplay Drive backups. */
export function renderGenericPdfBytes(project: FullProject, portable?: IwFile): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" })
  let y = MARGIN
  let page = 1

  const footer = () => {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(110)
    doc.text(`Inkwell backup - ${page}`, PAGE_W / 2, PAGE_H - 28, { align: "center" })
    doc.setTextColor(0)
  }
  const nextPage = () => {
    footer()
    doc.addPage()
    page++
    y = MARGIN
  }
  const ensure = (height: number) => {
    if (y + height > BOTTOM) nextPage()
  }
  const paragraph = (text: string, size = 11, bold = false) => {
    if (!text.trim()) return
    doc.setFont("helvetica", bold ? "bold" : "normal")
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(text, BODY_W) as string[]
    const lineHeight = size * 1.45
    for (const line of lines) {
      ensure(lineHeight)
      doc.text(line, MARGIN, y)
      y += lineHeight
    }
    y += size * 0.7
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(24)
  const titleLines = doc.splitTextToSize(project.title || "Untitled project", BODY_W) as string[]
  doc.text(titleLines, MARGIN, y)
  y += titleLines.length * 30 + 12
  if (project.description) paragraph(project.description, 11)
  y += 12

  const scenes = [...(project.scenes ?? [])].sort((a, b) => a.order_index - b.order_index)
  for (const scene of scenes) {
    const heading = scene.scene_heading || "Section"
    // Keep the section heading with at least a few opening body lines.
    ensure(86)
    paragraph(heading, 15, true)
    if (scene.content) paragraph(scene.content)
    const elements = [...(scene.elements ?? [])].sort((a, b) => a.line_number - b.line_number)
    for (const element of elements) {
      const content = element.content?.trim()
      if (!content) continue
      const isHeading = /heading|chapter|title/i.test(element.element_type)
      paragraph(content, isHeading ? 13 : 11, isHeading)
    }
    y += 8
  }
  if (scenes.length === 0 && !(portable?.beats.length)) {
    paragraph("This project does not contain document pages.", 11)
  }
  if (portable?.beats.length) {
    ensure(86)
    paragraph("Beat board", 17, true)
    for (const beat of [...portable.beats].sort((a, b) => a.order - b.order)) {
      paragraph(beat.title || "Untitled beat", 13, true)
      if (beat.description) paragraph(beat.description)
    }
  }
  if (portable?.characters.length) {
    ensure(86)
    paragraph("Characters", 17, true)
    for (const character of portable.characters) {
      paragraph(character.name, 13, true)
      if (character.description) paragraph(character.description)
    }
  }
  if (portable?.locations.length) {
    ensure(86)
    paragraph("Locations", 17, true)
    for (const location of portable.locations) {
      paragraph(location.name, 13, true)
      if (location.description) paragraph(location.description)
    }
  }
  footer()
  return new Uint8Array(doc.output("arraybuffer"))
}
