import { strToU8, zipSync, type Zippable } from "fflate"
import { jsPDF } from "jspdf"

import type { FullProject, ProjectElement } from "@/services/project"

const PDF_WIDTH = 612
const PDF_HEIGHT = 792
const PDF_MARGIN = 72
const PDF_BODY_WIDTH = PDF_WIDTH - PDF_MARGIN * 2
const PDF_BOTTOM = PDF_HEIGHT - PDF_MARGIN

function orderedPages(project: FullProject) {
  return [...(project.scenes ?? [])].sort((a, b) => a.order_index - b.order_index)
}

function orderedElements(elements: ProjectElement[] | undefined) {
  return [...(elements ?? [])].sort((a, b) => a.line_number - b.line_number)
}

function filenameStem(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "comic-script"
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function downloadBytes(filename: string, bytes: Uint8Array, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function buildComicScriptPdf(project: FullProject): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" })
  let y = PDF_MARGIN
  // The title sheet is unnumbered. Script-sheet numbering starts at one.
  let manuscriptPage = 0

  const footer = () => {
    if (manuscriptPage === 0) return
    doc.setFont("courier", "normal")
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(String(manuscriptPage), PDF_WIDTH - PDF_MARGIN, PDF_HEIGHT - 34, { align: "right" })
    doc.setTextColor(0)
  }
  const newSheet = () => {
    footer()
    doc.addPage()
    manuscriptPage += 1
    y = PDF_MARGIN
  }
  const ensure = (height: number) => {
    if (y + height > PDF_BOTTOM) newSheet()
  }
  const paragraph = (
    text: string,
    options: { bold?: boolean; size?: number; indent?: number; align?: "left" | "right" | "center"; uppercase?: boolean; after?: number } = {},
  ) => {
    const content = (options.uppercase ? text.toUpperCase() : text).trim()
    if (!content) return
    const size = options.size ?? 11
    const indent = options.indent ?? 0
    const align = options.align ?? "left"
    const width = PDF_BODY_WIDTH - indent * (align === "left" ? 1 : 0)
    doc.setFont("courier", options.bold ? "bold" : "normal")
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(content, width) as string[]
    const lineHeight = size * 1.35
    ensure(lines.length * lineHeight + (options.after ?? 5))
    const x = align === "center"
      ? PDF_WIDTH / 2
      : align === "right"
        ? PDF_WIDTH - PDF_MARGIN
        : PDF_MARGIN + indent
    doc.text(lines, x, y, { align })
    y += lines.length * lineHeight + (options.after ?? 5)
  }

  doc.setFont("courier", "bold")
  doc.setFontSize(24)
  const title = project.title || "Untitled Comic"
  doc.text(doc.splitTextToSize(title.toUpperCase(), PDF_BODY_WIDTH), PDF_WIDTH / 2, 300, { align: "center" })
  doc.setFont("courier", "normal")
  doc.setFontSize(12)
  doc.text("COMIC SCRIPT", PDF_WIDTH / 2, 360, { align: "center" })
  if (project.description?.trim()) {
    doc.setFontSize(10)
    doc.text(doc.splitTextToSize(project.description.trim(), PDF_BODY_WIDTH), PDF_WIDTH / 2, 410, { align: "center" })
  }

  const pages = orderedPages(project)
  pages.forEach((page, pageIndex) => {
    newSheet()
    const suffix = page.scene_heading?.trim()
    paragraph(`PAGE ${pageIndex + 1}${suffix ? ` - ${suffix}` : ""}`, { bold: true, size: 13, after: 14 })

    let panelNumber = 0
    for (const element of orderedElements(page.elements)) {
      const content = element.content?.trim() ?? ""
      if (!content) continue
      switch (element.element_type) {
        case "panel":
          panelNumber += 1
          paragraph(`PANEL ${panelNumber}`, { bold: true, uppercase: true, after: 2 })
          paragraph(content, { after: 10 })
          break
        case "character":
          paragraph(content, { bold: true, uppercase: true, indent: 72, after: 1 })
          break
        case "balloon":
          paragraph(content, { indent: 90, after: 7 })
          break
        case "caption":
          paragraph(`CAPTION: ${content}`, { after: 8 })
          break
        case "sfx":
          paragraph(`SFX: ${content}`, { bold: true, uppercase: true, after: 8 })
          break
        case "transition":
          paragraph(content, { bold: true, uppercase: true, align: "right", after: 10 })
          break
        default:
          paragraph(content)
      }
    }
  })

  if (pages.length === 0) {
    newSheet()
    paragraph("This comic script does not contain any pages yet.")
  }
  footer()
  return doc
}

/** Produces a print-ready comic-script PDF without opening a download dialog. */
export function renderComicScriptPdfBytes(project: FullProject): Uint8Array {
  return new Uint8Array(buildComicScriptPdf(project).output("arraybuffer"))
}

function wordParagraph(
  text: string,
  options: { style?: string; pageBreakBefore?: boolean; keepNext?: boolean } = {},
): string {
  const properties = [
    options.style ? `<w:pStyle w:val="${options.style}"/>` : "",
    options.pageBreakBefore ? "<w:pageBreakBefore/>" : "",
    options.keepNext ? "<w:keepNext/>" : "",
  ].join("")
  return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

function comicDocumentXml(project: FullProject): string {
  const paragraphs: string[] = [
    wordParagraph((project.title || "Untitled Comic").toUpperCase(), { style: "Title" }),
    wordParagraph("COMIC SCRIPT", { style: "Subtitle" }),
  ]
  if (project.description?.trim()) paragraphs.push(wordParagraph(project.description.trim(), { style: "Description" }))

  const pages = orderedPages(project)
  pages.forEach((page, pageIndex) => {
    const suffix = page.scene_heading?.trim()
    paragraphs.push(wordParagraph(`PAGE ${pageIndex + 1}${suffix ? ` - ${suffix}` : ""}`, {
      style: "PageHeading",
      pageBreakBefore: true,
      keepNext: true,
    }))
    let panelNumber = 0
    for (const element of orderedElements(page.elements)) {
      const content = element.content?.trim() ?? ""
      if (!content) continue
      switch (element.element_type) {
        case "panel":
          panelNumber += 1
          paragraphs.push(wordParagraph(`PANEL ${panelNumber}`, { style: "PanelHeading", keepNext: true }))
          paragraphs.push(wordParagraph(content, { style: "PanelDescription" }))
          break
        case "character":
          paragraphs.push(wordParagraph(content.toUpperCase(), { style: "Character", keepNext: true }))
          break
        case "balloon":
          paragraphs.push(wordParagraph(content, { style: "Dialogue" }))
          break
        case "caption":
          paragraphs.push(wordParagraph(`CAPTION: ${content}`, { style: "Caption" }))
          break
        case "sfx":
          paragraphs.push(wordParagraph(`SFX: ${content.toUpperCase()}`, { style: "Sfx" }))
          break
        case "transition":
          paragraphs.push(wordParagraph(content.toUpperCase(), { style: "Transition" }))
          break
        default:
          paragraphs.push(wordParagraph(content))
      }
    }
  })
  if (pages.length === 0) paragraphs.push(wordParagraph("This comic script does not contain any pages yet.", { pageBreakBefore: true }))

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`
}

const WORD_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="4200" w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Description"><w:name w:val="Description"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="480"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="PageHeading"><w:name w:val="Page Heading"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="PanelHeading"><w:name w:val="Panel Heading"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="180" w:after="40"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="PanelDescription"><w:name w:val="Panel Description"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Character"><w:name w:val="Character"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="1440"/><w:spacing w:before="120" w:after="20"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Dialogue"><w:name w:val="Dialogue"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="1800" w:right="900"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:basedOn w:val="Normal"/><w:rPr><w:i/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Sfx"><w:name w:val="SFX"/><w:basedOn w:val="Normal"/><w:rPr><w:b/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Transition"><w:name w:val="Transition"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="right"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
</w:styles>`

/** Produces a minimal standards-based Word document for artist/letterer handoff. */
export function renderComicScriptDocxBytes(project: FullProject): Uint8Array {
  const archive: Zippable = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/document.xml": strToU8(comicDocumentXml(project)),
    "word/styles.xml": strToU8(WORD_STYLES),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
  }
  return zipSync(archive, { level: 6 })
}

export function exportComicScriptToPDF(project: FullProject): void {
  downloadBytes(`${filenameStem(project.title)}.pdf`, renderComicScriptPdfBytes(project), "application/pdf")
}

export function exportComicScriptToDOCX(project: FullProject): void {
  downloadBytes(
    `${filenameStem(project.title)}.docx`,
    renderComicScriptDocxBytes(project),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  )
}
