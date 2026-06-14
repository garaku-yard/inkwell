package export

import (
	"bytes"
	"strings"

	"github.com/jung-kurt/gofpdf"
)

// PDFExporter renders a project as a screenplay-formatted PDF using the
// industry-standard layout: US Letter, Courier 12pt, 1" margins, with
// element-specific indentation (action flush left, character names centred,
// dialogue indented, parentheticals tightly indented).
//
// This is not pixel-perfect against Final Draft output but is close enough for
// read-throughs and submissions. For tier-gated watermarking the exporter can
// be extended with an Options argument without changing the Exporter interface.
type PDFExporter struct{}

// ContentType is the MIME type for PDF documents.
func (PDFExporter) ContentType() string { return "application/pdf" }

// FileExtension returns "pdf".
func (PDFExporter) FileExtension() string { return "pdf" }

// Screenplay formatting constants (inches converted to mm by gofpdf's unit).
// Values match Writer Duet / Final Draft defaults.
const (
	pdfMarginLeft   = 38.1 // 1.5" — wider left for binding
	pdfMarginTop    = 25.4 // 1"
	pdfMarginRight  = 25.4 // 1"
	pdfMarginBottom = 25.4 // 1"
	pdfCourierPt    = 12.0
	pdfLineHeight   = 4.8 // mm — roughly one line at 12pt Courier

	// Per-element indents (from left margin, in mm). These offsets position
	// dialogue / character / parenthetical blocks at their conventional columns.
	pdfIndentAction        = 0
	pdfIndentCharacter     = 55
	pdfIndentDialogue      = 25
	pdfIndentParenthetical = 40
	pdfIndentTransition    = 105 // right-aligned-ish
)

// Render produces a PDF document for the project.
func (PDFExporter) Render(project *ExportProject) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "Letter", "")
	pdf.SetMargins(pdfMarginLeft, pdfMarginTop, pdfMarginRight)
	pdf.SetAutoPageBreak(true, pdfMarginBottom)
	pdf.SetFont("Courier", "", pdfCourierPt)

	// Title page
	pdf.AddPage()
	pdf.Ln(60)
	pdf.SetFont("Courier", "B", 18)
	pdf.CellFormat(0, 10, strings.ToUpper(project.Title), "", 1, "C", false, 0, "")
	if project.Author != "" {
		pdf.Ln(20)
		pdf.SetFont("Courier", "", pdfCourierPt)
		pdf.CellFormat(0, 8, "by", "", 1, "C", false, 0, "")
		pdf.Ln(2)
		pdf.CellFormat(0, 8, project.Author, "", 1, "C", false, 0, "")
	}

	// Body
	pdf.AddPage()
	pdf.SetFont("Courier", "", pdfCourierPt)

	for _, scene := range project.Scenes {
		writeBlock(pdf, pdfIndentAction, strings.ToUpper(strings.TrimSpace(scene.Heading)), true)
		pdf.Ln(pdfLineHeight / 2)

		for _, el := range scene.Elements {
			content := strings.TrimSpace(el.Content)
			if content == "" {
				continue
			}

			switch el.Type {
			case "ACTION", "TEXT":
				writeBlock(pdf, pdfIndentAction, content, false)
			case "CHARACTER":
				writeBlock(pdf, pdfIndentCharacter, strings.ToUpper(content), false)
			case "DIALOG", "DIALOGUE":
				writeBlock(pdf, pdfIndentDialogue, content, false)
			case "PARENTHETICAL":
				writeBlock(pdf, pdfIndentParenthetical, "("+strings.Trim(content, "()")+")", false)
			case "TRANSITION":
				writeBlock(pdf, pdfIndentTransition, strings.ToUpper(content), false)
			case "SHOT":
				writeBlock(pdf, pdfIndentAction, strings.ToUpper(content), true)
			case "NOTE", "OUTLINE":
				// Skip editorial-only element types in exports.
				continue
			default:
				writeBlock(pdf, pdfIndentAction, content, false)
			}
			pdf.Ln(pdfLineHeight / 3)
		}
		pdf.Ln(pdfLineHeight / 2)
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// writeBlock writes text at a given indent from the left margin. bold=true
// renders the block in a bold Courier face; caller restores after if needed.
func writeBlock(pdf *gofpdf.Fpdf, indent float64, text string, bold bool) {
	if bold {
		pdf.SetFont("Courier", "B", pdfCourierPt)
	} else {
		pdf.SetFont("Courier", "", pdfCourierPt)
	}

	pageW, _ := pdf.GetPageSize()
	rightMargin := pdfMarginRight
	available := pageW - pdfMarginLeft - rightMargin - indent

	// Save cursor and shift right by `indent`, then use MultiCell to wrap at
	// the available width. MultiCell resets X to the left margin automatically.
	pdf.SetX(pdfMarginLeft + indent)
	pdf.MultiCell(available, pdfLineHeight, text, "", "L", false)
}
