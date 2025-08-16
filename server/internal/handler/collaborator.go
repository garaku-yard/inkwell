package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/l1roii/screenwriter/server/internal/entity"
	"github.com/l1roii/screenwriter/server/internal/middleware"
	"github.com/l1roii/screenwriter/server/internal/repository"
)

type CollaboratorHandler struct {
	collabRepo  repository.CollaboratorRepository
	projectRepo repository.ProjectRepository
	userRepo    repository.UserRepository
}

func NewCollaboratorHandler(collabRepo repository.CollaboratorRepository, projectRepo repository.ProjectRepository, userRepo repository.UserRepository) *CollaboratorHandler {
	return &CollaboratorHandler{collabRepo: collabRepo, projectRepo: projectRepo, userRepo: userRepo}
}

func (h *CollaboratorHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok {
		http.Error(w, `{"error": "Not authorized"}`, http.StatusUnauthorized)
		return
	}

	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

	if len(pathParts) == 1 && pathParts[0] == "invitations" && r.Method == http.MethodGet {
		h.handleListInvitations(w, r, userID)
		return
	}

	if len(pathParts) == 2 && pathParts[0] == "invitations" && r.Method == http.MethodPatch {
		projectID := pathParts[1]
		h.handleRespondToInvite(w, r, projectID, userID)
		return
	}

	if len(pathParts) >= 3 && pathParts[0] == "projects" && pathParts[2] == "collaborators" {
		projectID := pathParts[1]

		if len(pathParts) == 3 && r.Method == http.MethodGet {
			h.handleListCollaborators(w, r, projectID, userID)
			return
		}
		if len(pathParts) == 3 && r.Method == http.MethodPost {
			h.handleInviteCollaborator(w, r, projectID, userID)
			return
		}
		if len(pathParts) == 4 && r.Method == http.MethodDelete {
			collaboratorID := pathParts[3]
			h.handleRemoveCollaborator(w, r, projectID, collaboratorID, userID)
			return
		}
	}

	http.NotFound(w, r)
}

func (h *CollaboratorHandler) handleListInvitations(w http.ResponseWriter, r *http.Request, userID string) {
	invitations, err := h.collabRepo.ListPendingInvitesForUser(userID)
	if err != nil {
		log.Printf("DB ERROR: Failed to list invitations for user %s: %v", userID, err)
		http.Error(w, `{"error": "Could not retrieve invitations"}`, http.StatusInternalServerError)
		return
	}
	if invitations == nil {
		invitations = []*entity.Invitation{}
	}
	json.NewEncoder(w).Encode(invitations)
}

func (h *CollaboratorHandler) handleRespondToInvite(w http.ResponseWriter, r *http.Request, projectID, userID string) {
	var payload struct {
		Accepted bool `json:"accepted"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	if err := h.collabRepo.RespondToInvite(projectID, userID, payload.Accepted); err != nil {
		log.Printf("DB ERROR: Failed to respond to invite for user %s on project %s: %v", userID, projectID, err)
		http.Error(w, `{"error": "Could not respond to invitation"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Response recorded"})
}

func (h *CollaboratorHandler) handleListCollaborators(w http.ResponseWriter, r *http.Request, projectID, userID string) {
	// Security: Only owners and other collaborators can see the list.
	if err := h.checkCollaborationAccess(projectID, userID); err != nil {
		h.handleError(w, err)
		return
	}

	collaborators, err := h.collabRepo.ListByProjectID(projectID)
	if err != nil {
		log.Printf("DB ERROR: Failed to list collaborators for project %s: %v", projectID, err)
		http.Error(w, `{"error": "Could not retrieve collaborators"}`, http.StatusInternalServerError)
		return
	}
	if collaborators == nil {
		collaborators = []*entity.ProjectCollaborator{}
	}
	json.NewEncoder(w).Encode(collaborators)
}

func (h *CollaboratorHandler) handleInviteCollaborator(w http.ResponseWriter, r *http.Request, projectID, ownerUserID string) {
	// Security: Only the project owner can invite people.
	if err := h.checkOwnership(projectID, ownerUserID); err != nil {
		h.handleError(w, err)
		return
	}

	var reqBody struct {
		UsernameWithTag string `json:"usernameWithTag"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	parts := strings.Split(reqBody.UsernameWithTag, "#")
	if len(parts) != 2 {
		http.Error(w, `{"error": "Invalid username format. Expected 'username#tag'"}`, http.StatusBadRequest)
		return
	}
	username, tag := parts[0], parts[1]

	userToInvite, err := h.userRepo.GetByUsernameAndTag(username, tag)
	if err != nil || userToInvite == nil {
		http.Error(w, `{"error": "User not found"}`, http.StatusNotFound)
		return
	}

	if userToInvite.ID == ownerUserID {
		http.Error(w, `{"error": "You cannot invite yourself to a project"}`, http.StatusBadRequest)
		return
	}

	if err := h.collabRepo.Add(projectID, userToInvite.ID, "EDITOR"); err != nil {
		log.Printf("DB ERROR: Failed to invite user %s to project %s: %v", userToInvite.ID, projectID, err)
		http.Error(w, `{"error": "Failed to send invitation"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"message": "Invitation sent"})
}

func (h *CollaboratorHandler) handleRemoveCollaborator(w http.ResponseWriter, r *http.Request, projectID, collaboratorID, ownerUserID string) {
	// Security: Only the project owner can remove collaborators.
	if err := h.checkOwnership(projectID, ownerUserID); err != nil {
		h.handleError(w, err)
		return
	}

	if err := h.collabRepo.Remove(projectID, collaboratorID); err != nil {
		log.Printf("DB ERROR: Failed to remove collaborator %s from project %s: %v", collaboratorID, projectID, err)
		http.Error(w, `{"error": "Failed to remove collaborator"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (h *CollaboratorHandler) handleError(w http.ResponseWriter, err error) {
	if httpErr, ok := err.(*httpError); ok {
		http.Error(w, httpErr.message, httpErr.code)
	} else {
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
	}
}

func (h *CollaboratorHandler) checkOwnership(projectID, userID string) error {
	project, err := h.projectRepo.GetByID(projectID)
	if err != nil {
		return &httpError{message: `{"error": "Server error"}`, code: http.StatusInternalServerError}
	}
	if project == nil {
		return &httpError{message: `{"error": "Project not found"}`, code: http.StatusNotFound}
	}
	if project.UserID != userID {
		return &httpError{message: `{"error": "Forbidden"}`, code: http.StatusForbidden}
	}
	return nil
}

// checkCollaborationAccess confirms if a user is either the owner or an accepted collaborator.
func (h *CollaboratorHandler) checkCollaborationAccess(projectID, userID string) error {
	project, err := h.projectRepo.GetFullProjectByIDForUser(projectID, userID)
	if err != nil {
		return &httpError{message: `{"error": "Server error"}`, code: http.StatusInternalServerError}
	}
	if project == nil {
		return &httpError{message: `{"error": "Project not found or access denied"}`, code: http.StatusNotFound}
	}
	return nil
}
