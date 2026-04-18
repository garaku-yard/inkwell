// Package export generates downloadable documents from a project's scenes and
// script elements using the Strategy pattern: one Exporter interface, one
// implementation per output format. New formats (e.g. Fountain, InDesign) plug
// in without touching the HTTP handler.
package export

import (
	"fmt"

	scriptspb "inkwell/server/pkg/grpc/scripts"
)

// Exporter renders a project into a downloadable byte stream. Implementations
// must be safe for concurrent use — the gateway serves many requests in parallel.
type Exporter interface {
	// Render produces the document bytes for the given project.
	Render(project *ExportProject) ([]byte, error)
	// ContentType is the MIME type the gateway sets on the HTTP response.
	ContentType() string
	// FileExtension is the suffix used to build the download filename.
	FileExtension() string
}

// ExportProject is the flattened, format-agnostic representation of a project
// that every Exporter consumes. The gateway handler assembles it from multiple
// gRPC calls (GetProject + GetProjectScenes + GetSceneElements fan-out) so
// Exporter implementations stay pure — no network access, easy to test.
type ExportProject struct {
	// Title is the project name shown on the title page / document header.
	Title string
	// Author is the display name of the project owner (if known).
	Author string
	// Scenes are ordered by their OrderIndex and each carries its own ordered element list.
	Scenes []ExportScene
}

// ExportScene is a single scene plus its elements, flattened for rendering.
type ExportScene struct {
	// Heading is the slug line (e.g. "INT. COFFEE SHOP - DAY").
	Heading string
	// Elements is the scene's content, ordered by LineNumber.
	Elements []ExportElement
}

// ExportElement is one typed line of the script (action, dialogue, cue, etc.).
type ExportElement struct {
	// Type is the uppercase element tag (ACTION, CHARACTER, DIALOG, PARENTHETICAL, …).
	Type string
	// Content is the element's text, already trimmed.
	Content string
}

// FromProto flattens the gRPC-wire types into an ExportProject that the
// Exporter implementations consume. Callers pass a pre-assembled map of
// sceneID → elements so this helper stays synchronous and trivially testable.
func FromProto(project *scriptspb.Project, scenes []*scriptspb.Scene, elementsByScene map[string][]*scriptspb.ScriptElement, author string) *ExportProject {
	out := &ExportProject{
		Title:  project.GetTitle(),
		Author: author,
	}
	for _, s := range scenes {
		scene := ExportScene{Heading: s.GetSceneHeading()}
		for _, e := range elementsByScene[s.GetId()] {
			scene.Elements = append(scene.Elements, ExportElement{
				Type:    e.GetType(),
				Content: e.GetContent(),
			})
		}
		out.Scenes = append(out.Scenes, scene)
	}
	return out
}

// ByFormat returns the Exporter registered for the given format string
// (case-insensitive). Unsupported formats return an error listing the
// available options so API callers can surface a useful message.
func ByFormat(format string) (Exporter, error) {
	switch format {
	case "fdx":
		return &FDXExporter{}, nil
	case "pdf":
		return &PDFExporter{}, nil
	default:
		return nil, fmt.Errorf("unsupported export format %q (supported: fdx, pdf)", format)
	}
}
