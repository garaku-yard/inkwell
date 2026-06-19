package export

import (
	"bytes"
	"testing"
)

// sampleProject is a small but representative screenplay covering every element
// branch the renderer switches on.
func sampleProject() *ExportProject {
	return &ExportProject{
		Title:  "The Long Goodbye",
		Author: "Jane Writer",
		Scenes: []ExportScene{
			{
				Heading: "INT. COFFEE SHOP - DAY",
				Elements: []ExportElement{
					{Type: "ACTION", Content: "Rain streaks the window."},
					{Type: "CHARACTER", Content: "Marlowe"},
					{Type: "PARENTHETICAL", Content: "(weary)"},
					{Type: "DIALOG", Content: "I need a refill and a reason."},
					{Type: "TRANSITION", Content: "CUT TO:"},
					{Type: "NOTE", Content: "editorial only — must be skipped"},
				},
			},
		},
	}
}

// Render must produce a structurally valid PDF with the go-pdf/fpdf backend
// (the maintained replacement for the archived jung-kurt/gofpdf).
func TestPDFExporter_RendersValidPDF(t *testing.T) {
	out, err := PDFExporter{}.Render(sampleProject())
	if err != nil {
		t.Fatalf("Render returned error: %v", err)
	}
	if len(out) == 0 {
		t.Fatal("Render returned empty output")
	}
	if !bytes.HasPrefix(out, []byte("%PDF-")) {
		t.Errorf("output is not a PDF — missing %%PDF- header (got %q)", firstBytes(out, 8))
	}
	// A complete PDF ends with the literal "%%EOF" trailer.
	if !bytes.Contains(out, []byte("%%EOF")) {
		t.Error("output missing the PDF end-of-file trailer — truncated/invalid")
	}
}

// The exporter advertises the correct MIME type and extension.
func TestPDFExporter_ContentTypeAndExtension(t *testing.T) {
	if ct := (PDFExporter{}).ContentType(); ct != "application/pdf" {
		t.Errorf("ContentType = %q, want application/pdf", ct)
	}
	if ext := (PDFExporter{}).FileExtension(); ext != "pdf" {
		t.Errorf("FileExtension = %q, want pdf", ext)
	}
}

// An empty project still renders a valid (title-page-only) PDF rather than erroring.
func TestPDFExporter_EmptyProject(t *testing.T) {
	out, err := PDFExporter{}.Render(&ExportProject{Title: "Untitled"})
	if err != nil {
		t.Fatalf("Render of empty project errored: %v", err)
	}
	if !bytes.HasPrefix(out, []byte("%PDF-")) {
		t.Error("empty project did not produce a PDF")
	}
}

func firstBytes(b []byte, n int) []byte {
	if len(b) < n {
		return b
	}
	return b[:n]
}
