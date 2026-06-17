package scripts

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"strings"

	"inkwell/server/internal/gateway/handlers"
	scriptspb "inkwell/server/pkg/grpc/scripts"
)

// FDX represents the top-level structure of a Final Draft (.fdx) XML document.
type FDX struct {
	XMLName xml.Name `xml:"FinalDraft"`
	Content Content  `xml:"Content"`
}

// Content holds the ordered list of paragraphs parsed from an FDX document.
type Content struct {
	Paragraphs []Paragraph `xml:"Paragraph"`
}

// Paragraph represents a single typed paragraph element within an FDX document.
// The Type attribute maps to screenplay element types such as "Action" or "Character".
type Paragraph struct {
	Type string `xml:"Type,attr"`
	Text string `xml:"Text"`
}

// ImportFDX parses an uploaded Final Draft (.fdx) file and imports it as a new
// project. Accepts a multipart/form-data POST with a "file" field (max 10 MB),
// a required "projectName" field, and an optional "projectType" field. Scene headings
// (paragraphs whose text starts with "INT." or "EXT.", or whose type is SCENE_HEADING)
// create new scenes; all other paragraphs become script elements within the current
// scene. Requires a userID from the request context.
func (h *ScriptsHandler) ImportFDX(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		handlers.WriteError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := handlers.GetUserIDFromContext(r)
	if userID == "" {
		handlers.WriteError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse multipart form (10 MB limit — prevents unbounded memory use on malicious uploads).
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		slog.Warn("ImportFDX: error parsing form", "error", err)
		handlers.WriteError(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		slog.Warn("ImportFDX: error getting file", "error", err)
		handlers.WriteError(w, "No file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Extension allowlist — only genuine Final Draft files should reach the XML
	// parser. Without this, an attacker can submit arbitrary XML (or deeply
	// nested documents engineered to balloon memory) to an endpoint named
	// "import-fdx". Content-Type alone is client-controlled, so we check the
	// filename extension too.
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".fdx" && ext != ".xml" {
		handlers.WriteError(w, "Only .fdx files are supported", http.StatusBadRequest)
		return
	}

	slog.Info("ImportFDX: processing file", "filename", header.Filename, "user_id", userID)

	projectName := r.FormValue("projectName")
	projectType := r.FormValue("projectType")

	if projectName == "" {
		handlers.WriteError(w, "Project name is required", http.StatusBadRequest)
		return
	}

	fdxData, err := io.ReadAll(file)
	if err != nil {
		slog.Error("ImportFDX: error reading file", "error", err)
		handlers.WriteError(w, "Failed to read file", http.StatusInternalServerError)
		return
	}

	var fdx FDX
	decoder := xml.NewDecoder(strings.NewReader(string(fdxData)))
	decoder.Strict = true
	if err := decoder.Decode(&fdx); err != nil {
		slog.Warn("ImportFDX: error parsing FDX", "error", err)
		handlers.WriteError(w, "Invalid FDX file format", http.StatusBadRequest)
		return
	}

	slog.Info("ImportFDX: parsed paragraphs", "count", len(fdx.Content.Paragraphs))

	createProjectResp, err := h.scriptsClient.CreateProject(r.Context(), &scriptspb.CreateProjectRequest{
		OwnerId:     userID,
		Title:       projectName,
		Description: fmt.Sprintf("Imported from %s (%s)", header.Filename, projectType),
	})

	if err != nil {
		slog.Error("ImportFDX: error creating project", "error", err)
		handlers.HandleGRPCError(w, err)
		return
	}

	projectID := createProjectResp.Project.Id
	slog.Info("ImportFDX: created project", "project_id", projectID, "paragraphs", len(fdx.Content.Paragraphs))

	// Process FDX paragraphs into scenes and elements
	var currentScene *scriptspb.Scene
	var sceneElements []*scriptspb.ProjectElement
	lineNumber := int32(1)

	for _, para := range fdx.Content.Paragraphs {
		paraType := mapFDXTypeToScriptElement(para.Type)

		// Scene headings create new scenes
		if paraType == "SCENE_HEADING" || strings.HasPrefix(strings.ToUpper(para.Text), "INT.") || strings.HasPrefix(strings.ToUpper(para.Text), "EXT.") {
			// Save previous scene elements if any
			if currentScene != nil && len(sceneElements) > 0 {
				_, err := h.scriptsClient.BatchCreateElements(r.Context(), &scriptspb.BatchCreateElementsRequest{
					ProjectId: projectID,
					UserId:    userID,
					Elements:  sceneElements,
				})
				if err != nil {
					slog.Warn("ImportFDX: error creating elements for scene", "scene_id", currentScene.Id, "error", err)
				}
				sceneElements = nil
			}

			// Create new scene
			sceneResp, err := h.scriptsClient.CreateScene(r.Context(), &scriptspb.CreateSceneRequest{
				ProjectId:    projectID,
				UserId:       userID,
				SceneHeading: para.Text,
				Content:      "",
				OrderIndex:   0,
			})
			if err != nil {
				slog.Error("ImportFDX: error creating scene", "error", err)
				handlers.WriteError(w, "Failed to import scenes", http.StatusInternalServerError)
				return
			}
			currentScene = sceneResp.Scene
			slog.Info("ImportFDX: created scene", "scene_id", currentScene.Id)
		} else if currentScene != nil {
			// Add element to current scene
			sceneElements = append(sceneElements, &scriptspb.ProjectElement{
				ProjectId:  projectID,
				SceneId:    currentScene.Id,
				Type:       paraType,
				Content:    para.Text,
				LineNumber: lineNumber,
			})
			lineNumber++
		}
	}

	// Save final scene elements if any
	if currentScene != nil && len(sceneElements) > 0 {
		_, err := h.scriptsClient.BatchCreateElements(r.Context(), &scriptspb.BatchCreateElementsRequest{
			ProjectId: projectID,
			UserId:    userID,
			Elements:  sceneElements,
		})
		if err != nil {
			slog.Warn("ImportFDX: error creating final elements", "error", err)
		}
	}

	slog.Info("ImportFDX: import complete", "project_id", projectID)

	// Return created project
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":                projectID,
		"projectName":       projectName,
		"userId":            userID,
		"description":       fmt.Sprintf("Imported from %s", header.Filename),
		"collaboratorCount": 0,
		"isStarred":         false,
		"createdAt":         createProjectResp.Project.CreatedAt,
		"updatedAt":         createProjectResp.Project.UpdatedAt,
	})
}

// mapFDXTypeToScriptElement converts a Final Draft paragraph type string to the
// corresponding internal script element type. Unknown types default to ACTION.
func mapFDXTypeToScriptElement(fdxType string) string {
	switch strings.ToLower(fdxType) {
	case "scene heading", "scene_heading":
		return "SCENE_HEADING"
	case "action":
		return "ACTION"
	case "character":
		return "CHARACTER"
	case "dialogue":
		return "DIALOG"
	case "parenthetical":
		return "PARENTHETICAL"
	case "transition":
		return "TRANSITION"
	case "shot":
		return "SHOT"
	default:
		return "ACTION" // Default to action for unknown types
	}
}
