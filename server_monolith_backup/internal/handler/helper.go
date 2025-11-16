package handler

import (
	"database/sql"
	"net/http"

	"github.com/l1roii/screenwriter/server/internal/repository"
)

type HttpError struct {
	Message string `json:"error"`
	Code    int
}

func (e *HttpError) Error() string { return e.Message }

func HandleError(w http.ResponseWriter, err error) {
	if httpErr, ok := err.(*HttpError); ok {
		http.Error(w, httpErr.Message, httpErr.Code)
	} else {
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
	}
}

func CheckOwnership(projectRepo repository.ProjectRepository, projectID, userID string) error {
	project, err := projectRepo.GetByID(projectID)
	if err != nil {
		if err == sql.ErrNoRows {
			return &HttpError{Message: `{"error": "Project not found"}`, Code: http.StatusNotFound}
		}
		return &HttpError{Message: `{"error": "Server error"}`, Code: http.StatusInternalServerError}
	}

	if project.UserID == userID {
		return nil
	}

	isCollab, err := projectRepo.IsCollaborator(projectID, userID)
	if err != nil {
		return &HttpError{Message: `{"error": "Server error"}`, Code: http.StatusInternalServerError}
	}

	if isCollab {
		return nil
	}

	return &HttpError{Message: `{"error": "Forbidden"}`, Code: http.StatusForbidden}
}
