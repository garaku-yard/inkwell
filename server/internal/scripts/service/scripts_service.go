package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"scriptlith/server/internal/scripts/config"
	"scriptlith/server/internal/scripts/domain"
	"scriptlith/server/internal/scripts/repository"
)

// ScriptsService defines the business logic interface for the Scripts service
type ScriptsService interface {
	// Project operations
	CreateProject(ctx context.Context, title, description, category string, ownerID uuid.UUID) (*domain.Project, error)
	GetProject(ctx context.Context, projectID, userID uuid.UUID) (*domain.Project, error)
	UpdateProject(ctx context.Context, projectID, userID uuid.UUID, title, description, status *string) (*domain.Project, error)
	ToggleProjectStar(ctx context.Context, projectID, userID uuid.UUID) (*domain.Project, error)
	DeleteProject(ctx context.Context, projectID, userID uuid.UUID) error
	GetUserProjects(ctx context.Context, userID uuid.UUID, offset, limit int) ([]*domain.Project, int64, error)

	// Script element operations
	CreateScriptElement(ctx context.Context, projectID, userID uuid.UUID, element *domain.ScriptElement) (*domain.ScriptElement, error)
	GetProjectScriptElements(ctx context.Context, projectID, userID uuid.UUID, startLine, endLine int32) ([]*domain.ScriptElement, error)
	UpdateScriptElement(ctx context.Context, elementID, userID uuid.UUID, updates *domain.ScriptElement) (*domain.ScriptElement, error)
	DeleteScriptElement(ctx context.Context, elementID, userID uuid.UUID) error
	BulkUpdateScriptElements(ctx context.Context, projectID, userID uuid.UUID, elements []*domain.ScriptElement) ([]*domain.ScriptElement, error)

	// Scene operations
	CreateScene(ctx context.Context, projectID, userID uuid.UUID, scene *domain.Scene) (*domain.Scene, error)
	GetProjectScenes(ctx context.Context, projectID, userID uuid.UUID) ([]*domain.Scene, error)
	UpdateScene(ctx context.Context, sceneID, userID uuid.UUID, updates *domain.Scene) (*domain.Scene, error)
	DeleteScene(ctx context.Context, sceneID, userID uuid.UUID) error

	// Character operations
	CreateCharacter(ctx context.Context, projectID, userID uuid.UUID, character *domain.Character) (*domain.Character, error)
	GetProjectCharacters(ctx context.Context, projectID, userID uuid.UUID) ([]*domain.Character, error)
	UpdateCharacter(ctx context.Context, characterID, userID uuid.UUID, updates *domain.Character) (*domain.Character, error)

	// Location operations
	CreateLocation(ctx context.Context, projectID, userID uuid.UUID, location *domain.Location) (*domain.Location, error)
	GetProjectLocations(ctx context.Context, projectID, userID uuid.UUID) ([]*domain.Location, error)

	// Outline operations
	CreateOutlineUnit(ctx context.Context, projectID, userID uuid.UUID, unit *domain.OutlineUnit) (*domain.OutlineUnit, error)
	GetProjectOutline(ctx context.Context, projectID, userID uuid.UUID, typeFilter string) ([]*domain.OutlineUnit, error)
	UpdateOutlineUnit(ctx context.Context, unitID, userID uuid.UUID, updates *domain.OutlineUnit) (*domain.OutlineUnit, error)
	DeleteOutlineUnit(ctx context.Context, unitID, userID uuid.UUID) error

	// Simplified element operations for gateway
	CreateElement(ctx context.Context, userID uuid.UUID, element *domain.ScriptElement) (*domain.ScriptElement, error)
	UpdateElementContent(ctx context.Context, userID, elementID uuid.UUID, content string) (*domain.ScriptElement, error)
	GetSceneElements(ctx context.Context, userID, sceneID uuid.UUID) ([]*domain.ScriptElement, error)
	BatchCreateElements(ctx context.Context, userID, projectID uuid.UUID, elements []*domain.ScriptElement) ([]*domain.ScriptElement, error)
}

// scriptsService implements the ScriptsService interface
type scriptsService struct {
	repo   *repository.Repository
	config *config.Config
}

// NewScriptsService creates a new ScriptsService instance
func NewScriptsService(repo *repository.Repository, cfg *config.Config) ScriptsService {
	return &scriptsService{
		repo:   repo,
		config: cfg,
	}
}

// CreateProject creates a new project
func (s *scriptsService) CreateProject(ctx context.Context, title, description, category string, ownerID uuid.UUID) (*domain.Project, error) {
	if category == "" {
		category = "screenplay"
	}
	project := &domain.Project{
		ID:          uuid.New(),
		Title:       title,
		Description: description,
		Category:    category,
		OwnerID:     ownerID,
		Status:      "draft",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := s.repo.Project.CreateProject(ctx, project); err != nil {
		return nil, err
	}

	return project, nil
}

// GetProject retrieves a project by ID with authorization check
func (s *scriptsService) GetProject(ctx context.Context, projectID, userID uuid.UUID) (*domain.Project, error) {
	// Check if user has access to the project
	isOwner, err := s.repo.Project.IsProjectOwner(ctx, projectID, userID)
	if err != nil {
		return nil, err
	}
	if !isOwner {
		return nil, domain.ErrUnauthorizedAccess
	}

	return s.repo.Project.GetProjectByID(ctx, projectID)
}

// UpdateProject updates an existing project
func (s *scriptsService) UpdateProject(ctx context.Context, projectID, userID uuid.UUID, title, description, status *string) (*domain.Project, error) {
	// Check authorization
	isOwner, err := s.repo.Project.IsProjectOwner(ctx, projectID, userID)
	if err != nil {
		return nil, err
	}
	if !isOwner {
		return nil, domain.ErrUnauthorizedAccess
	}

	// Get existing project
	project, err := s.repo.Project.GetProjectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}

	// Apply updates
	if title != nil {
		project.Title = *title
	}
	if description != nil {
		project.Description = *description
	}
	if status != nil {
		project.Status = *status
	}
	project.UpdatedAt = time.Now()

	// Save changes
	if err := s.repo.Project.UpdateProject(ctx, project); err != nil {
		return nil, err
	}

	return project, nil
}

// ToggleProjectStar toggles the starred status of a project
func (s *scriptsService) ToggleProjectStar(ctx context.Context, projectID, userID uuid.UUID) (*domain.Project, error) {
	// Check authorization
	isOwner, err := s.repo.Project.IsProjectOwner(ctx, projectID, userID)
	if err != nil {
		return nil, err
	}
	if !isOwner {
		return nil, domain.ErrUnauthorizedAccess
	}

	// Get existing project
	project, err := s.repo.Project.GetProjectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}

	// Toggle star status
	project.IsStarred = !project.IsStarred
	project.UpdatedAt = time.Now()

	// Save changes
	if err := s.repo.Project.UpdateProject(ctx, project); err != nil {
		return nil, err
	}

	return project, nil
}

// DeleteProject soft deletes a project
func (s *scriptsService) DeleteProject(ctx context.Context, projectID, userID uuid.UUID) error {
	// Check authorization
	isOwner, err := s.repo.Project.IsProjectOwner(ctx, projectID, userID)
	if err != nil {
		return err
	}
	if !isOwner {
		return domain.ErrUnauthorizedAccess
	}

	return s.repo.Project.SoftDeleteProject(ctx, projectID)
}

// GetUserProjects retrieves projects for a user with pagination
func (s *scriptsService) GetUserProjects(ctx context.Context, userID uuid.UUID, offset, limit int) ([]*domain.Project, int64, error) {
	return s.repo.Project.GetProjectsByOwner(ctx, userID, offset, limit)
}

// Helper method to verify project access
func (s *scriptsService) verifyProjectAccess(ctx context.Context, projectID, userID uuid.UUID) error {
	isOwner, err := s.repo.Project.IsProjectOwner(ctx, projectID, userID)
	if err != nil {
		return err
	}
	if !isOwner {
		return domain.ErrUnauthorizedAccess
	}
	return nil
}

// Script element operations
func (s *scriptsService) CreateScriptElement(ctx context.Context, projectID, userID uuid.UUID, element *domain.ScriptElement) (*domain.ScriptElement, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	element.ID = uuid.New()
	element.ProjectID = projectID
	element.CreatedAt = time.Now()
	element.UpdatedAt = time.Now()

	if err := s.repo.ScriptElement.CreateScriptElement(ctx, element); err != nil {
		return nil, err
	}

	return element, nil
}

func (s *scriptsService) GetProjectScriptElements(ctx context.Context, projectID, userID uuid.UUID, startLine, endLine int32) ([]*domain.ScriptElement, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	return s.repo.ScriptElement.GetProjectScriptElements(ctx, projectID, startLine, endLine)
}

func (s *scriptsService) UpdateScriptElement(ctx context.Context, elementID, userID uuid.UUID, updates *domain.ScriptElement) (*domain.ScriptElement, error) {
	// Get existing element to check project ownership
	element, err := s.repo.ScriptElement.GetScriptElement(ctx, elementID)
	if err != nil {
		return nil, err
	}

	if err := s.verifyProjectAccess(ctx, element.ProjectID, userID); err != nil {
		return nil, err
	}

	// Apply updates
	element.UpdatedAt = time.Now()
	if updates.Type != "" {
		element.Type = updates.Type
	}
	if updates.Content != "" {
		element.Content = updates.Content
	}
	if updates.CharacterID != nil {
		element.CharacterID = updates.CharacterID
	}
	if updates.LineNumber != 0 {
		element.LineNumber = updates.LineNumber
	}
	if updates.Formatting != nil {
		element.Formatting = updates.Formatting
	}

	if err := s.repo.ScriptElement.UpdateScriptElement(ctx, element); err != nil {
		return nil, err
	}

	return element, nil
}

func (s *scriptsService) DeleteScriptElement(ctx context.Context, elementID, userID uuid.UUID) error {
	// Get existing element to check project ownership
	element, err := s.repo.ScriptElement.GetScriptElement(ctx, elementID)
	if err != nil {
		return err
	}

	if err := s.verifyProjectAccess(ctx, element.ProjectID, userID); err != nil {
		return err
	}

	return s.repo.ScriptElement.DeleteScriptElement(ctx, elementID)
}

func (s *scriptsService) BulkUpdateScriptElements(ctx context.Context, projectID, userID uuid.UUID, elements []*domain.ScriptElement) ([]*domain.ScriptElement, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	// Ensure all elements belong to the project and set timestamps
	now := time.Now()
	for _, element := range elements {
		element.ProjectID = projectID
		element.UpdatedAt = now
		if element.ID == uuid.Nil {
			element.ID = uuid.New()
			element.CreatedAt = now
		}
	}

	if err := s.repo.ScriptElement.BulkUpdateScriptElements(ctx, elements); err != nil {
		return nil, err
	}

	return elements, nil
}

// Scene operations
func (s *scriptsService) CreateScene(ctx context.Context, projectID, userID uuid.UUID, scene *domain.Scene) (*domain.Scene, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	scene.ID = uuid.New()
	scene.ProjectID = projectID
	scene.CreatedAt = time.Now()
	scene.UpdatedAt = time.Now()

	if err := s.repo.Scene.CreateScene(ctx, scene); err != nil {
		return nil, err
	}

	return scene, nil
}

func (s *scriptsService) GetProjectScenes(ctx context.Context, projectID, userID uuid.UUID) ([]*domain.Scene, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	return s.repo.Scene.GetProjectScenes(ctx, projectID)
}

func (s *scriptsService) UpdateScene(ctx context.Context, sceneID, userID uuid.UUID, updates *domain.Scene) (*domain.Scene, error) {
	scene, err := s.repo.Scene.GetScene(ctx, sceneID)
	if err != nil {
		return nil, err
	}

	if err := s.verifyProjectAccess(ctx, scene.ProjectID, userID); err != nil {
		return nil, err
	}

	// Apply updates
	scene.UpdatedAt = time.Now()
	if updates.SceneHeading != "" {
		scene.SceneHeading = updates.SceneHeading
	}
	if updates.Content != "" {
		scene.Content = updates.Content
	}
	if updates.OrderIndex != 0 {
		scene.OrderIndex = updates.OrderIndex
	}

	if err := s.repo.Scene.UpdateScene(ctx, scene); err != nil {
		return nil, err
	}

	return scene, nil
}

func (s *scriptsService) DeleteScene(ctx context.Context, sceneID, userID uuid.UUID) error {
	scene, err := s.repo.Scene.GetScene(ctx, sceneID)
	if err != nil {
		return err
	}

	if err := s.verifyProjectAccess(ctx, scene.ProjectID, userID); err != nil {
		return err
	}

	return s.repo.Scene.DeleteScene(ctx, sceneID)
}

// Character operations
func (s *scriptsService) CreateCharacter(ctx context.Context, projectID, userID uuid.UUID, character *domain.Character) (*domain.Character, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	character.ID = uuid.New()
	character.ProjectID = projectID
	character.CreatedAt = time.Now()
	character.UpdatedAt = time.Now()

	if err := s.repo.Character.CreateCharacter(ctx, character); err != nil {
		return nil, err
	}

	return character, nil
}

func (s *scriptsService) GetProjectCharacters(ctx context.Context, projectID, userID uuid.UUID) ([]*domain.Character, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	return s.repo.Character.GetProjectCharacters(ctx, projectID)
}

func (s *scriptsService) UpdateCharacter(ctx context.Context, characterID, userID uuid.UUID, updates *domain.Character) (*domain.Character, error) {
	character, err := s.repo.Character.GetCharacter(ctx, characterID)
	if err != nil {
		return nil, err
	}

	if err := s.verifyProjectAccess(ctx, character.ProjectID, userID); err != nil {
		return nil, err
	}

	character.UpdatedAt = time.Now()
	if updates.Name != "" {
		character.Name = updates.Name
	}
	if updates.Description != "" {
		character.Description = updates.Description
	}
	if updates.Role != "" {
		character.Role = updates.Role
	}
	if updates.Attributes != nil {
		character.Attributes = updates.Attributes
	}

	if err := s.repo.Character.UpdateCharacter(ctx, character); err != nil {
		return nil, err
	}

	return character, nil
}

// Location operations
func (s *scriptsService) CreateLocation(ctx context.Context, projectID, userID uuid.UUID, location *domain.Location) (*domain.Location, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	location.ID = uuid.New()
	location.ProjectID = projectID
	location.CreatedAt = time.Now()
	location.UpdatedAt = time.Now()

	if err := s.repo.Location.CreateLocation(ctx, location); err != nil {
		return nil, err
	}

	return location, nil
}

func (s *scriptsService) GetProjectLocations(ctx context.Context, projectID, userID uuid.UUID) ([]*domain.Location, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	return s.repo.Location.GetProjectLocations(ctx, projectID)
}

// Outline operations
func (s *scriptsService) CreateOutlineUnit(ctx context.Context, projectID, userID uuid.UUID, unit *domain.OutlineUnit) (*domain.OutlineUnit, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	unit.ID = uuid.New()
	unit.ProjectID = projectID
	unit.CreatedAt = time.Now()
	unit.UpdatedAt = time.Now()

	if err := s.repo.Outline.CreateOutlineUnit(ctx, unit); err != nil {
		return nil, err
	}

	return unit, nil
}

func (s *scriptsService) GetProjectOutline(ctx context.Context, projectID, userID uuid.UUID, typeFilter string) ([]*domain.OutlineUnit, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	return s.repo.Outline.GetProjectOutline(ctx, projectID, typeFilter)
}

func (s *scriptsService) UpdateOutlineUnit(ctx context.Context, unitID, userID uuid.UUID, updates *domain.OutlineUnit) (*domain.OutlineUnit, error) {
	unit, err := s.repo.Outline.GetOutlineUnit(ctx, unitID)
	if err != nil {
		return nil, err
	}

	if err := s.verifyProjectAccess(ctx, unit.ProjectID, userID); err != nil {
		return nil, err
	}

	unit.UpdatedAt = time.Now()
	if updates.Title != "" {
		unit.Title = updates.Title
	}
	if updates.Description != "" {
		unit.Description = updates.Description
	}
	if updates.Color != "" {
		unit.Color = updates.Color
	}
	if updates.Tags != nil {
		unit.Tags = updates.Tags
	}
	if updates.Icon != "" {
		unit.Icon = updates.Icon
	}
	if updates.OrderIndex != 0 {
		unit.OrderIndex = updates.OrderIndex
	}

	if err := s.repo.Outline.UpdateOutlineUnit(ctx, unit); err != nil {
		return nil, err
	}

	return unit, nil
}

func (s *scriptsService) DeleteOutlineUnit(ctx context.Context, unitID, userID uuid.UUID) error {
	unit, err := s.repo.Outline.GetOutlineUnit(ctx, unitID)
	if err != nil {
		return err
	}

	if err := s.verifyProjectAccess(ctx, unit.ProjectID, userID); err != nil {
		return err
	}

	return s.repo.Outline.DeleteOutlineUnit(ctx, unitID)
}

// CreateElement creates a new script element (simplified version)
func (s *scriptsService) CreateElement(ctx context.Context, userID uuid.UUID, element *domain.ScriptElement) (*domain.ScriptElement, error) {
	// Validate required fields
	if element.SceneID == nil {
		return nil, errors.New("scene_id is required - script elements must belong to a scene")
	}

	// Verify project access
	if err := s.verifyProjectAccess(ctx, element.ProjectID, userID); err != nil {
		return nil, err
	}

	// Set ID and timestamps
	element.ID = uuid.New()
	element.CreatedAt = time.Now()
	element.UpdatedAt = time.Now()

	// Create through repository
	err := s.repo.ScriptElement.CreateScriptElement(ctx, element)
	if err != nil {
		return nil, err
	}

	return element, nil
}

// UpdateElementContent updates the content of a script element (simplified version)
func (s *scriptsService) UpdateElementContent(ctx context.Context, userID, elementID uuid.UUID, content string) (*domain.ScriptElement, error) {
	// Get existing element
	element, err := s.repo.ScriptElement.GetScriptElement(ctx, elementID)
	if err != nil {
		return nil, err
	}

	// Verify project access
	if err := s.verifyProjectAccess(ctx, element.ProjectID, userID); err != nil {
		return nil, err
	}

	// Update content and timestamp
	element.Content = content
	element.UpdatedAt = time.Now()

	// Update through repository
	err = s.repo.ScriptElement.UpdateScriptElement(ctx, element)
	if err != nil {
		return nil, err
	}

	return element, nil
}

// GetSceneElements gets all script elements for a scene (simplified version)
func (s *scriptsService) GetSceneElements(ctx context.Context, userID, sceneID uuid.UUID) ([]*domain.ScriptElement, error) {
	// Get scene first to verify project access
	scene, err := s.repo.Scene.GetScene(ctx, sceneID)
	if err != nil {
		return nil, err
	}

	// Verify project access
	if err := s.verifyProjectAccess(ctx, scene.ProjectID, userID); err != nil {
		return nil, err
	}

	// Get elements for the scene
	return s.repo.ScriptElement.GetSceneElements(ctx, sceneID)
}

// BatchCreateElements creates multiple script elements in a single transaction
func (s *scriptsService) BatchCreateElements(ctx context.Context, userID, projectID uuid.UUID, elements []*domain.ScriptElement) ([]*domain.ScriptElement, error) {
	// Verify project access
	if err := s.verifyProjectAccess(ctx, projectID, userID); err != nil {
		return nil, err
	}

	// Validate and prepare elements
	createdElements := make([]*domain.ScriptElement, len(elements))
	for i, element := range elements {
		if element.SceneID == nil {
			return nil, errors.New("all elements must have a scene_id")
		}

		// Set ID and timestamps
		element.ID = uuid.New()
		element.ProjectID = projectID
		element.CreatedAt = time.Now()
		element.UpdatedAt = time.Now()

		// Create through repository
		err := s.repo.ScriptElement.CreateScriptElement(ctx, element)
		if err != nil {
			return nil, fmt.Errorf("failed to create element at index %d: %w", i, err)
		}

		createdElements[i] = element
	}

	return createdElements, nil
}
