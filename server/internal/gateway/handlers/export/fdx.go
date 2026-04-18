package export

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"strings"
)

// fdxTypeMap translates our internal element type tags to the Paragraph Type
// values Final Draft expects. Types not in the map are skipped during export.
var fdxTypeMap = map[string]string{
	"ACTION":        "Action",
	"TEXT":          "Action",
	"CHARACTER":     "Character",
	"PARENTHETICAL": "Parenthetical",
	"DIALOG":        "Dialogue",
	"DIALOGUE":      "Dialogue",
	"TRANSITION":    "Transition",
	"SHOT":          "Shot",
	"NEW_ACT":       "Act Break",
	"END_ACT":       "Act Break",
}

// FDXExporter renders a project as a Final Draft (.fdx) XML document.
// The output mirrors the client-side exporter at client/lib/export/screenplay-fdx.ts
// so files produced by either path are interchangeable for downstream tools.
type FDXExporter struct{}

// ContentType is the MIME type for Final Draft documents.
func (FDXExporter) ContentType() string { return "application/xml" }

// FileExtension returns ".fdx".
func (FDXExporter) FileExtension() string { return "fdx" }

// Render emits the full FDX XML. Scenes and elements are rendered in the
// order they appear in project (the caller is responsible for sorting).
func (FDXExporter) Render(project *ExportProject) ([]byte, error) {
	var buf bytes.Buffer
	fmt.Fprintln(&buf, `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>`)
	fmt.Fprintln(&buf, `<FinalDraft DocumentType="Script" Template="No" Version="5">`)
	fmt.Fprintln(&buf, `  <Content>`)

	for _, scene := range project.Scenes {
		heading := scene.Heading
		if heading == "" {
			heading = "SCENE"
		}
		writeParagraph(&buf, "Scene Heading", heading)

		for _, el := range scene.Elements {
			content := strings.TrimSpace(el.Content)
			if content == "" {
				continue
			}
			if el.Type == "NOTE" || el.Type == "OUTLINE" {
				continue
			}
			fdxType, ok := fdxTypeMap[el.Type]
			if !ok {
				continue
			}
			text := content
			if el.Type == "PARENTHETICAL" {
				text = "(" + strings.Trim(content, "()") + ")"
			}
			writeParagraph(&buf, fdxType, text)
		}
	}

	fmt.Fprintln(&buf, `  </Content>`)
	fmt.Fprintln(&buf, `  <TitlePage>`)
	fmt.Fprintln(&buf, `    <Content>`)
	fmt.Fprintln(&buf, `      <Paragraph>`)
	fmt.Fprintf(&buf, "        <Text>%s</Text>\n", xmlEscape(project.Title))
	fmt.Fprintln(&buf, `      </Paragraph>`)
	fmt.Fprintln(&buf, `    </Content>`)
	fmt.Fprintln(&buf, `  </TitlePage>`)
	fmt.Fprintln(&buf, `  <Header FooterFirstPageNumber="2" HeaderAndFooterVisibility="0" StartingPageNumber="1">`)
	fmt.Fprintln(&buf, `  </Header>`)
	fmt.Fprintln(&buf, `  <Footer>`)
	fmt.Fprintln(&buf, `  </Footer>`)
	fmt.Fprintln(&buf, `</FinalDraft>`)
	return buf.Bytes(), nil
}

// writeParagraph emits a single <Paragraph Type="..."><Text>..</Text></Paragraph> block.
func writeParagraph(w *bytes.Buffer, fdxType, text string) {
	fmt.Fprintf(w, "    <Paragraph Type=%q>\n", fdxType)
	fmt.Fprintf(w, "      <Text>%s</Text>\n", xmlEscape(text))
	fmt.Fprintln(w, `    </Paragraph>`)
}

// xmlEscape escapes the five characters that matter in XML text nodes.
func xmlEscape(s string) string {
	var buf bytes.Buffer
	_ = xml.EscapeText(&buf, []byte(s))
	return buf.String()
}
