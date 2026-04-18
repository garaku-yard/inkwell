package handlers

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	scriptspb "scriptlith/server/pkg/grpc/scripts"
)

// FDX XML structure (simplified)
type FDX struct {
	XMLName xml.Name `xml:"FinalDraft"`
	Content Content  `xml:"Content"`
}

type Content struct {
	Paragraphs []Paragraph `xml:"Paragraph"`
}

type Paragraph struct {
	Type string `xml:"Type,attr"`
	Text string `xml:"Text"`
}

// ImportFDX handles POST /projects/import-fdx
func (h *ScriptsHandler) ImportFDX(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := getUserIDFromContext(r)

	// Parse multipart form (10MB limit)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		log.Printf("ImportFDX: Error parsing form: %v", err)
		writeError(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	// Get uploaded file
	file, header, err := r.FormFile("file")
	if err != nil {
		log.Printf("ImportFDX: Error getting file: %v", err)
		writeError(w, "No file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	log.Printf("ImportFDX: Processing file: %s", header.Filename)

	// Get project metadata
	projectName := r.FormValue("projectName")
	projectType := r.FormValue("projectType")

	if projectName == "" {
		writeError(w, "Project name is required", http.StatusBadRequest)
		return
	}

	// Read FDX file
	fdxData, err := io.ReadAll(file)
	if err != nil {
		log.Printf("ImportFDX: Error reading file: %v", err)
		writeError(w, "Failed to read file", http.StatusInternalServerError)
		return
	}

	// Parse FDX XML
	var fdx FDX
	if err := xml.Unmarshal(fdxData, &fdx); err != nil {
		log.Printf("ImportFDX: Error parsing FDX: %v", err)
		writeError(w, "Invalid FDX file format", http.StatusBadRequest)
		return
	}

	log.Printf("ImportFDX: Parsed %d paragraphs", len(fdx.Content.Paragraphs))

	// Create project
	createProjectResp, err := h.scriptsClient.CreateProject(r.Context(), &scriptspb.CreateProjectRequest{
		OwnerId:     userID,
		Title:       projectName,
		Description: fmt.Sprintf("Imported from %s (%s)", header.Filename, projectType),
	})

	if err != nil {
		log.Printf("ImportFDX: Error creating project: %v", err)
		handleGRPCError(w, err)
		return
	}

	projectID := createProjectResp.Project.Id
	log.Printf("ImportFDX: Created project %s with %d paragraphs to import", projectID, len(fdx.Content.Paragraphs))

	// Process FDX paragraphs into scenes and elements
	var currentScene *scriptspb.Scene
	var sceneElements []*scriptspb.ScriptElement
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
					log.Printf("ImportFDX: Error creating elements for scene %s: %v", currentScene.Id, err)
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
				log.Printf("ImportFDX: Error creating scene: %v", err)
				writeError(w, "Failed to import scenes", http.StatusInternalServerError)
				return
			}
			currentScene = sceneResp.Scene
			log.Printf("ImportFDX: Created scene %s: %s", currentScene.Id, currentScene.SceneHeading)
		} else if currentScene != nil {
			// Add element to current scene
			sceneElements = append(sceneElements, &scriptspb.ScriptElement{
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
			log.Printf("ImportFDX: Error creating final elements: %v", err)
		}
	}

	log.Printf("ImportFDX: Successfully imported project with elements")

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

// mapFDXTypeToScriptElement maps Final Draft paragraph types to screenplay elements
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
