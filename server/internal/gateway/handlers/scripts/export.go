package scripts

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"inkwell/server/internal/gateway/apierror"
	"inkwell/server/internal/gateway/handlers"
	"inkwell/server/internal/gateway/handlers/export"
	scriptspb "inkwell/server/pkg/grpc/scripts"
)

// ExportHandler serves GET /projects/{projectId}/export?format=pdf|fdx.
//
// It delegates rendering to an Exporter chosen by the format query parameter
// (Strategy pattern). The handler is responsible for assembling the flat
// ExportProject the exporters consume: it fans out GetProjectScenes +
// GetSceneElements in parallel to avoid sequential round-trips.
//
// Access control: the caller must be the project owner or an active
// collaborator, enforced via the same handlers.ResolveProjectAccess helper used by
// GetProject. Authorization happens before any export work is attempted.
func (h *ScriptsHandler) ExportProject(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		apierror.WriteStatus(w, http.StatusMethodNotAllowed, apierror.CodeInvalidArgument, "method not allowed")
		return
	}

	// Read the path param via chi rather than trimming a hardcoded
	// "/projects/" prefix — the handler is mounted under both /projects and
	// /api/v1/projects, and manual prefix math breaks (and 403s) on the
	// versioned mount.
	projectID := chi.URLParam(r, "projectId")
	if projectID == "" {
		apierror.WriteStatus(w, http.StatusBadRequest, apierror.CodeInvalidArgument, "project ID is required")
		return
	}

	userID := handlers.GetUserIDFromContext(r)
	if userID == "" {
		apierror.WriteStatus(w, http.StatusUnauthorized, apierror.CodeUnauthenticated, "unauthorized")
		return
	}

	format := strings.ToLower(r.URL.Query().Get("format"))
	if format == "" {
		format = "pdf"
	}
	exporter, err := export.ByFormat(format)
	if err != nil {
		apierror.WriteStatus(w, http.StatusBadRequest, apierror.CodeInvalidArgument, err.Error())
		return
	}

	resolvedID, authErr := handlers.ResolveProjectAccess(r.Context(), userID, projectID, h.scriptsClient, h.collabClient)
	if authErr != nil {
		apierror.WriteStatus(w, http.StatusForbidden, apierror.CodePermissionDenied, "forbidden")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	// Fetch project + scenes in parallel.
	var (
		projResp   *scriptspb.GetProjectResponse
		scenesResp *scriptspb.GetProjectScenesResponse
		projErr    error
		scenesErr  error
		wg         sync.WaitGroup
	)
	wg.Add(2)
	go func() {
		defer wg.Done()
		projResp, projErr = h.scriptsClient.GetProject(ctx, &scriptspb.GetProjectRequest{
			ProjectId: projectID, UserId: resolvedID,
		})
	}()
	go func() {
		defer wg.Done()
		scenesResp, scenesErr = h.scriptsClient.GetProjectScenes(ctx, &scriptspb.GetProjectScenesRequest{
			ProjectId: projectID, UserId: resolvedID,
		})
	}()
	wg.Wait()

	if projErr != nil {
		handlers.HandleGRPCError(w, projErr)
		return
	}
	if scenesErr != nil {
		handlers.HandleGRPCError(w, scenesErr)
		return
	}

	scenes := scenesResp.GetScenes()
	sort.SliceStable(scenes, func(i, j int) bool {
		return scenes[i].GetOrderIndex() < scenes[j].GetOrderIndex()
	})

	// Fan out element fetches per scene in parallel.
	elementsByScene := fetchSceneElements(ctx, h.scriptsClient, scenes, resolvedID)

	project := export.FromProto(projResp.GetProject(), scenes, elementsByScene, "")
	body, err := exporter.Render(project)
	if err != nil {
		slog.Error("export render failed", "format", format, "project_id", projectID, "error", err)
		apierror.WriteStatus(w, http.StatusInternalServerError, apierror.CodeInternal, "failed to render export")
		return
	}

	filename := sanitizeFilename(projResp.GetProject().GetTitle()) + "." + exporter.FileExtension()
	w.Header().Set("Content-Type", exporter.ContentType())
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(body)))
	_, _ = w.Write(body)
}

// fetchSceneElements issues one GetSceneElements call per scene in parallel
// and returns a map keyed by scene ID. Sort order is preserved by line_number
// within each scene. Failed fetches for individual scenes are logged and the
// scene is emitted with an empty element list rather than aborting the export.
func fetchSceneElements(ctx context.Context, client scriptspb.ScriptsServiceClient, scenes []*scriptspb.Scene, userID string) map[string][]*scriptspb.ProjectElement {
	out := make(map[string][]*scriptspb.ProjectElement, len(scenes))
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, s := range scenes {
		wg.Add(1)
		go func(sceneID string) {
			defer wg.Done()
			resp, err := client.GetSceneElements(ctx, &scriptspb.GetSceneElementsRequest{
				SceneId: sceneID,
				UserId:  userID,
			})
			if err != nil {
				slog.Warn("export: failed to fetch scene elements", "scene_id", sceneID, "error", err)
				mu.Lock()
				out[sceneID] = nil
				mu.Unlock()
				return
			}
			elements := resp.GetElements()
			sort.SliceStable(elements, func(i, j int) bool {
				return elements[i].GetLineNumber() < elements[j].GetLineNumber()
			})
			mu.Lock()
			out[sceneID] = elements
			mu.Unlock()
		}(s.GetId())
	}
	wg.Wait()
	return out
}

// sanitizeFilename replaces characters that would be awkward in a download
// filename (whitespace, slashes, quotes) with underscores.
func sanitizeFilename(title string) string {
	if title == "" {
		return "screenplay"
	}
	var b strings.Builder
	for _, r := range strings.ToLower(title) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_':
			b.WriteRune(r)
		default:
			b.WriteRune('_')
		}
	}
	out := b.String()
	out = strings.Trim(out, "_")
	if out == "" {
		return "screenplay"
	}
	return out
}
