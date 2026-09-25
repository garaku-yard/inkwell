import { strToU8, zipSync, type Zippable } from "fflate"
import { jsPDF } from "jspdf"

import { readDocumentMetadata } from "@/lib/editor/document-metadata"
import { plainInlineText, readInlineRuns } from "@/lib/editor/inline-content"
import type { FullProject, ProjectElement } from "@/services/project"

export type ManuscriptProfile = "prose" | "poetry"

const sortedScenes = (project: FullProject) => [...(project.scenes ?? [])].sort((a, b) => a.order_index - b.order_index)
const sortedElements = (elements: ProjectElement[] | undefined) => [...(elements ?? [])].sort((a, b) => a.line_number - b.line_number)
const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

function pageBlocks(project: FullProject, profile: ManuscriptProfile) {
  return sortedScenes(project).map((scene) => ({
    title: scene.scene_heading || (profile === "poetry" ? "Untitled poem" : "Untitled chapter"),
    subtitle: readDocumentMetadata(scene.content).subtitle ?? "",
    dedication: readDocumentMetadata(scene.content).dedication ?? "",
    elements: sortedElements(scene.elements),
  }))
}

/** US-letter submission layout: one-inch margins, page numbers, and separate
 * prose/poetry spacing rules. A new chapter or poem starts on a fresh page. */
export function renderManuscriptPdfBytes(project: FullProject, profile: ManuscriptProfile): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" })
  const margin = 72
  const width = 612 - margin * 2
  const bottom = 792 - margin
  let page = 1
  let y = margin
  const footer = () => {
    doc.setFont("times", "normal")
    doc.setFontSize(10)
    doc.text(String(page), 612 - margin, 792 - 36, { align: "right" })
  }
  const newPage = () => { footer(); doc.addPage(); page++; y = margin }
  const line = (text: string, options: { center?: boolean; bold?: boolean; indent?: number; spacing?: number } = {}) => {
    const size = 12
    const x = options.center ? 306 : margin + (options.indent ?? 0)
    const usable = options.center ? width : width - (options.indent ?? 0)
    doc.setFont("times", options.bold ? "bold" : "normal")
    doc.setFontSize(size)
    const rows = doc.splitTextToSize(text || " ", usable) as string[]
    const spacing = options.spacing ?? (profile === "prose" ? 24 : 18)
    for (const row of rows) {
      if (y + spacing > bottom) newPage()
      doc.text(row, x, y, options.center ? { align: "center" } : undefined)
      y += spacing
    }
  }

  const blocks = pageBlocks(project, profile)
  blocks.forEach((block, index) => {
    if (index > 0) newPage()
    line(block.title, { center: true, bold: true })
    if (block.subtitle) line(block.subtitle, { center: true })
    if (block.dedication) { y += 12; line(block.dedication, { center: true }) }
    y += profile === "prose" ? 48 : 30
    for (const element of block.elements) {
      const text = plainInlineText(element.content)
      if (element.element_type === "stanza_break" || element.element_type === "scene_break") {
        if (element.element_type === "scene_break") line("* * *", { center: true })
        else y += 18
        continue
      }
      if (!text.trim()) { y += profile === "poetry" ? 18 : 24; continue }
      if (element.element_type === "section_label" || /heading|stinger/.test(element.element_type)) {
        y += 12
        line(text, { bold: true, spacing: profile === "prose" ? 24 : 18 })
      } else if (element.element_type === "dialogue") {
        line(text, { indent: 36 })
      } else {
        line(text, { indent: profile === "prose" ? 36 : 0 })
      }
    }
  })
  if (blocks.length === 0) line("This project has no pages yet.")
  footer()
  return new Uint8Array(doc.output("arraybuffer"))
}

function wordRuns(content: string): string {
  return readInlineRuns(content).map((run) => {
    const properties = [
      run.strong ? "<w:b/>" : "", run.emphasis ? "<w:i/>" : "",
      run.underline ? '<w:u w:val="single"/>' : "", run.smallCaps ? "<w:smallCaps/>" : "",
    ].join("")
    return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(run.text)}</w:t></w:r>`
  }).join("")
}

function wordParagraph(content: string, style: string, breakBefore = false): string {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${breakBefore ? "<w:pageBreakBefore/>" : ""}</w:pPr>${wordRuns(content)}</w:p>`
}

/** Editable DOCX with separate paragraph styles for manuscript prose and
 * poetry; strong/emphasis/underline/small-caps runs remain actual Word runs. */
export function renderManuscriptDocxBytes(project: FullProject, profile: ManuscriptProfile): Uint8Array {
  const paragraphs: string[] = []
  pageBlocks(project, profile).forEach((block, index) => {
    paragraphs.push(wordParagraph(block.title, "DocumentTitle", index > 0))
    if (block.subtitle) paragraphs.push(wordParagraph(block.subtitle, "Subtitle"))
    if (block.dedication) paragraphs.push(wordParagraph(block.dedication, "Dedication"))
    for (const element of block.elements) {
      if (element.element_type === "stanza_break") { paragraphs.push(wordParagraph("", "StanzaBreak")); continue }
      if (element.element_type === "scene_break") { paragraphs.push(wordParagraph("* * *", "SceneBreak")); continue }
      const style = element.element_type === "dialogue" ? "Dialogue" :
        element.element_type === "section_label" || /heading|stinger/.test(element.element_type) ? "SectionHeading" :
          profile === "poetry" ? "PoetryLine" : "ProseBody"
      paragraphs.push(wordParagraph(element.content, style))
    }
  })
  if (paragraphs.length === 0) paragraphs.push(wordParagraph("This project has no pages yet.", "ProseBody"))
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`
  const proseSpacing = '<w:spacing w:line="480" w:lineRule="auto"/>'
  const poetrySpacing = '<w:spacing w:line="360" w:lineRule="auto"/>'
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
    <w:style w:type="paragraph" w:styleId="DocumentTitle"><w:name w:val="Document Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="480"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style>
    <w:style w:type="paragraph" w:styleId="Dedication"><w:name w:val="Dedication"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="240"/></w:pPr></w:style>
    <w:style w:type="paragraph" w:styleId="ProseBody"><w:name w:val="Prose Body"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:firstLine="720"/>${proseSpacing}</w:pPr></w:style>
    <w:style w:type="paragraph" w:styleId="PoetryLine"><w:name w:val="Poetry Line"/><w:basedOn w:val="Normal"/><w:pPr>${poetrySpacing}</w:pPr></w:style>
    <w:style w:type="paragraph" w:styleId="StanzaBreak"><w:name w:val="Stanza Break"/><w:basedOn w:val="PoetryLine"/><w:pPr><w:spacing w:after="240"/></w:pPr></w:style>
    <w:style w:type="paragraph" w:styleId="SceneBreak"><w:name w:val="Scene Break"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/>${proseSpacing}</w:pPr></w:style>
    <w:style w:type="paragraph" w:styleId="SectionHeading"><w:name w:val="Section Heading"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/>${profile === "poetry" ? poetrySpacing : proseSpacing}</w:pPr><w:rPr><w:b/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Dialogue"><w:name w:val="Dialogue"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720" w:right="720"/>${proseSpacing}</w:pPr></w:style>
  </w:styles>`
  const archive: Zippable = {
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml": strToU8(documentXml),
    "word/styles.xml": strToU8(styles),
    "word/_rels/document.xml.rels": strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
  }
  return zipSync(archive, { level: 6 })
}

export function downloadManuscript(project: FullProject, profile: ManuscriptProfile, format: "pdf" | "docx"): void {
  const bytes = format === "pdf" ? renderManuscriptPdfBytes(project, profile) : renderManuscriptDocxBytes(project, profile)
  const mime = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  const filename = `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "manuscript"}.${format}`
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
