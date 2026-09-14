package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"inkwell/server/internal/scripts/config"
	"inkwell/server/internal/scripts/domain"
	"inkwell/server/internal/scripts/repository"
	"inkwell/server/pkg/events"
	"inkwell/server/pkg/outbox"
	"inkwell/server/pkg/quota"
)

// ScriptsService defines the business logic interface for the Scripts service
type ScriptsService interface {
	// Project operations
	CreateProject(ctx context.Context, title, description, category string, ownerID uuid.UUID, orgID *uuid.UUID) (*domain.Project, error)
	GetProject(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole) (*domain.Project, error)
	UpdateProject(ctx context.Context, projectID, userID uuid.UUID, title, description, status *string) (*domain.Project, error)
	ToggleProjectStar(ctx context.Context, projectID, userID uuid.UUID) (*domain.Project, error)
	DeleteProject(ctx context.Context, projectID, userID uuid.UUID) error
	GetUserProjects(ctx context.Context, userID uuid.UUID, offset, limit int) ([]*domain.Project, int64, error)
	// GetOrgProjects lists the projects owned by an organization.
	GetOrgProjects(ctx context.Context, orgID uuid.UUID) ([]*domain.Project, error)
	// GetProjectAccessMetadata resolves the ownership fields needed by the
	// gateway before it has an already-resolved caller role.
	GetProjectAccessMetadata(ctx context.Context, projectID uuid.UUID) (ownerID uuid.UUID, orgID *uuid.UUID, err error)

	// Script element operations
	DeleteScriptElement(ctx context.Context, elementID, userID uuid.UUID, callerRole domain.CallerRole) error

	// GetResourceProject resolves which project owns a sub-resource. It is an
	// internal lookup with no access check — the gateway authorizes the caller
	// against the returned project before performing the mutation.
	GetResourceProject(ctx context.Context, kind domain.ResourceKind, resourceID uuid.UUID) (uuid.UUID, error)

	// SyncProject reconciles one project bidirectionally: applies the caller's
	// pushed changes and returns rows changed since cursor. See SYNC_DESIGN.md.
	SyncProject(ctx context.Context, projectID, ownerID uuid.UUID, cursor time.Time, in *domain.SyncChanges) (*domain.SyncChanges, time.Time, error)

	// SyncVault reconciles a vault project's files bidirectionally by path
	// (last-sync-wins) and returns one page of files changed since cursor,
	// excluding the just-pushed paths. hasMore signals more pages remain. The
	// optional project row is upserted (create-if-absent). See SYNC_DESIGN.md.
	SyncVault(ctx context.Context, projectID, ownerID uuid.UUID, project *domain.Project, cursor domain.VaultCursor, files []*domain.VaultFile, maxFiles, maxBytes int) ([]*domain.VaultFile, domain.VaultCursor, bool, error)

	// Scene operations
	CreateScene(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole, scene *domain.Scene) (*domain.Scene, error)
	GetProjectScenes(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole) ([]*domain.Scene, error)
	UpdateScene(ctx context.Context, sceneID, userID uuid.UUID, callerRole domain.CallerRole, updates *domain.ScenePatch) (*domain.Scene, error)
	DeleteScene(ctx context.Context, sceneID, userID uuid.UUID, callerRole domain.CallerRole) error

	// Character operations — unimplemented at the gRPC handler layer today;
	// callerRole is threaded through anyway for signature consistency.
	CreateCharacter(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole, character *domain.Character) (*domain.Character, error)
	GetProjectCharacters(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole) ([]*domain.Character, error)
	UpdateCharacter(ctx context.Context, characterID, userID uuid.UUID, callerRole domain.CallerRole, updates *domain.CharacterPatch) (*domain.Character, error)

	// Location operations — unimplemented at the gRPC handler layer today.
	CreateLocation(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole, location *domain.Location) (*domain.Location, error)
	GetProjectLocations(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole) ([]*domain.Location, error)

	// Outline operations — unimplemented at the gRPC handler layer today.
	CreateOutlineUnit(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole, unit *domain.OutlineUnit) (*domain.OutlineUnit, error)
	GetProjectOutline(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole, typeFilter string) ([]*domain.OutlineUnit, error)
	UpdateOutlineUnit(ctx context.Context, unitID, userID uuid.UUID, callerRole domain.CallerRole, updates *domain.OutlineUnitPatch) (*domain.OutlineUnit, error)
	DeleteOutlineUnit(ctx context.Context, unitID, userID uuid.UUID, callerRole domain.CallerRole) error

	// Simplified element operations for gateway
	CreateElement(ctx context.Context, userID uuid.UUID, callerRole domain.CallerRole, element *domain.ProjectElement) (*domain.ProjectElement, error)
	UpdateElementContent(ctx context.Context, userID, elementID uuid.UUID, callerRole domain.CallerRole, patch *domain.ElementPatch) (*domain.ProjectElement, error)
	GetSceneElements(ctx context.Context, userID, sceneID uuid.UUID, callerRole domain.CallerRole) ([]*domain.ProjectElement, error)
	// BatchCreateElements is only ever called for a project the caller just
	// created (ImportFDX) — no callerRole parameter; see the implementation's
	// doc comment.
	BatchCreateElements(ctx context.Context, userID, projectID uuid.UUID, elements []*domain.ProjectElement) ([]*domain.ProjectElement, error)
}

// scriptsService implements the ScriptsService interface
type scriptsService struct {
	db        *sql.DB
	repo      *repository.Repository
	sync      *repository.SyncRepository
	outbox    outbox.Store
	config    *config.Config
	publisher events.Publisher
	quota     quota.Client
}

// NewScriptsService creates a new ScriptsService.
//
// The service commits every project mutation together with a matching outbox
// event in a single database transaction so no event can be lost if the
// process crashes. db opens transactions; outbox is the event store (typically
// outbox.NewPostgresStore(db, "scripts_outbox")); publisher is the best-effort
// Kafka emitter that the background poller falls back to for reliability;
// quotaClient enforces per-tier limits (nil disables enforcement for local
// dev without a running billing service).
// In tests, pass &events.NoopPublisher{} and an in-memory Store.
func NewScriptsService(db *sql.DB, repo *repository.Repository, store outbox.Store, cfg *config.Config, publisher events.Publisher, quotaClient quota.Client) ScriptsService {
	return &scriptsService{
		db:        db,
		repo:      repo,
		sync:      repository.NewSyncRepository(db),
		outbox:    store,
		config:    cfg,
		publisher: publisher,
		quota:     quotaClient,
	}
}

// CreateProject creates a new project and durably enqueues a project.created
// event in the same database transaction. The inline Publish call below is a
// best-effort fast path; the background outbox poller handles reliability.
//
// Before creating the project the service enforces the user's projects quota
// via the billing service. Quota enforcement is skipped when the service was
// constructed with a nil quota client (local dev without billing running).
func (s *scriptsService) CreateProject(ctx context.Context, title, description, category string, ownerID uuid.UUID, orgID *uuid.UUID) (*domain.Project, error) {
	if s.quota != nil {
		if err := quota.Require(ctx, s.quota, ownerID.String(), quota.MetricProjects, 1); err != nil {
			return nil, err
		}
	}

	if category == "" {
		category = "screenplay"
	}
	project := &domain.Project{
		ID:          uuid.New(),
		Title:       title,
		Description: description,
		Category:    category,
		OwnerID:     ownerID,
		OrgID:       orgID,
		Status:      "draft",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	payload, err := json.Marshal(map[string]string{
		"project_id": project.ID.String(),
		"owner_id":   ownerID.String(),
		"category":   category,
	})
	if err != nil {
		return nil, err
	}
	event := events.Event{ID: uuid.NewString(), Type: events.EventTypeProjectCreated, OccurredAt: time.Now().UTC(), Payload: payload}

	err = outbox.RunInTx(ctx, s.db, func(tx *sql.Tx) error {
		if err := s.repo.Project.CreateProjectTx(ctx, tx, project); err != nil {
			return err
		}
		return s.outbox.EnqueueTx(ctx, tx, outbox.Event{
			ID:      uuid.MustParse(event.ID),
			Type:    event.Type,
			Payload: payload,
		})
	})
	if err != nil {
		return nil, err
	}

	_ = events.PublishEvent(ctx, s.publisher, event)

	// Record usage so the user's projects quota reflects the new project. Track
	// failures are logged but do not fail the request — the project already exists
	// and the usage total can be reconciled out of band if needed.
	if s.quota != nil {
		if err := s.quota.Track(ctx, ownerID.String(), quota.MetricProjects, 1); err != nil {
			slog.Warn("quota: track projects failed", "user_id", ownerID, "error", err)
		}
	}

	return project, nil
}

// GetProject retrieves a project by ID with authorization check.
// userID must always be a real actor now (Orbit #360) — the old empty-userID
// "skip the check" bypass is gone. Non-owner callers are trusted per
// callerRole, same reasoning as verifyProjectAccess (see its doc comment);
// the previous unauthenticated read for the gateway's own org-lookup
// bootstrap step moved to the dedicated GetProjectAccessMetadata RPC, which performs
// no ownership check by design rather than overloading this one.
func (s *scriptsService) GetProject(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole) (*domain.Project, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID, callerRole, domain.CallerRoleViewer); err != nil {
		return nil, err
	}
	return s.repo.Project.GetProjectByID(ctx, projectID)
}

// GetProjectAccessMetadata resolves only the ownership fields needed by the
// gateway's authorization and quota decisions. It deliberately performs no
// access check; callers must not treat the lookup itself as a grant.
func (s *scriptsService) GetProjectAccessMetadata(ctx context.Context, projectID uuid.UUID) (uuid.UUID, *uuid.UUID, error) {
	project, err := s.repo.Project.GetProjectByID(ctx, projectID)
	if err != nil {
		return uuid.Nil, nil, err
	}
	return project.OwnerID, project.OrgID, nil
}

// UpdateProject updates an existing project. userID must always be a real
// actor (Orbit #360) — ownership is, and has always been, checked
// unconditionally here with no bypass; the only change is an explicit
// missing-actor error instead of "not owner" for an absent id.
func (s *scriptsService) UpdateProject(ctx context.Context, projectID, userID uuid.UUID, title, description, status *string) (*domain.Project, error) {
	if userID == uuid.Nil {
		return nil, domain.ErrMissingActor
	}
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
		if *title == "" {
			return nil, fmt.Errorf("%w: project title cannot be empty", domain.ErrInvalidProjectData)
		}
		project.Title = *title
	}
	if description != nil {
		project.Description = *description
	}
	if status != nil {
		switch *status {
		case "draft", "active", "completed", "archived":
		default:
			return nil, fmt.Errorf("%w: invalid project status", domain.ErrInvalidProjectData)
		}
		project.Status = *status
	}
	project.UpdatedAt = time.Now()

	// Save changes
	if err := s.repo.Project.UpdateProject(ctx, project); err != nil {
		return nil, err
	}

	return project, nil
}

// ToggleProjectStar toggles the starred status of a project. userID must
// always be a real actor (Orbit #360); ownership is, and has always been,
// checked unconditionally with no bypass.
func (s *scriptsService) ToggleProjectStar(ctx context.Context, projectID, userID uuid.UUID) (*domain.Project, error) {
	if userID == uuid.Nil {
		return nil, domain.ErrMissingActor
	}
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

// DeleteProject soft-deletes a project and durably enqueues a project.deleted
// event in the same transaction. The inline publish is best-effort; the
// outbox poller guarantees the event eventually reaches Kafka.
func (s *scriptsService) DeleteProject(ctx context.Context, projectID, userID uuid.UUID) error {
	if userID == uuid.Nil {
		return domain.ErrMissingActor
	}
	isOwner, err := s.repo.Project.IsProjectOwner(ctx, projectID, userID)
	if err != nil {
		return err
	}
	if !isOwner {
		return domain.ErrUnauthorizedAccess
	}

	payload, err := json.Marshal(map[string]string{
		"project_id": projectID.String(),
		"user_id":    userID.String(),
	})
	if err != nil {
		return err
	}
	event := events.Event{ID: uuid.NewString(), Type: events.EventTypeProjectDeleted, OccurredAt: time.Now().UTC(), Payload: payload}

	err = outbox.RunInTx(ctx, s.db, func(tx *sql.Tx) error {
		if err := s.repo.Project.SoftDeleteProjectTx(ctx, tx, projectID); err != nil {
			return err
		}
		return s.outbox.EnqueueTx(ctx, tx, outbox.Event{
			ID:      uuid.MustParse(event.ID),
			Type:    event.Type,
			Payload: payload,
		})
	})
	if err != nil {
		return err
	}

	_ = events.PublishEvent(ctx, s.publisher, event)

	// Release the projects quota slot. This is the mirror of the +1 in
	// CreateProject; without it the running total only ever climbs and a user
	// who deletes projects stays locked out at their tier limit. Like the
	// create-side Track, a failure here is logged but does not fail the delete —
	// the project is already gone and the total can be reconciled out of band.
	if s.quota != nil {
		if err := s.quota.Track(ctx, userID.String(), quota.MetricProjects, -1); err != nil {
			slog.Warn("quota: release projects failed", "user_id", userID, "error", err)
		}
	}

	return nil
}

// GetOrgProjects lists the projects owned by an organization. Access control
// (org membership) is enforced by the gateway before this is reached.
func (s *scriptsService) GetOrgProjects(ctx context.Context, orgID uuid.UUID) ([]*domain.Project, error) {
	return s.repo.Project.GetProjectsByOrg(ctx, orgID)
}

// GetUserProjects retrieves projects for a user with pagination
func (s *scriptsService) GetUserProjects(ctx context.Context, userID uuid.UUID, offset, limit int) ([]*domain.Project, int64, error) {
	return s.repo.Project.GetProjectsByOwner(ctx, userID, offset, limit)
}

// verifyProjectAccess checks whether userID, asserted by the gateway to hold
// callerRole, may act on projectID. Orbit #360: userID must always be a real
// actor now — a missing one is a malformed request (ErrMissingActor), never
// a bypass. Literal ownership is always re-verified independently against
// projects.owner_id regardless of what callerRole claims: this is the
// defense-in-depth #360 asks for, since a misapplied gateway policy (a stale
// or mistaken CallerRoleOwner) must not be able to grant owner-level access
// just because it says so — see CallerRole's doc comment. For a non-owner,
// scripts has no independent way to verify org or collaborator membership —
// that stays the gateway's job (0029) — so any resolved role beyond
// "unspecified" is trusted once identity is confirmed real.
func (s *scriptsService) verifyProjectAccess(ctx context.Context, projectID, userID uuid.UUID, callerRole, requiredRole domain.CallerRole) error {
	if userID == uuid.Nil {
		return domain.ErrMissingActor
	}
	isOwner, err := s.repo.Project.IsProjectOwner(ctx, projectID, userID)
	if err != nil {
		return err
	}
	if isOwner {
		return nil
	}
	if !callerRole.Allows(requiredRole) {
		return domain.ErrUnauthorizedAccess
	}
	return nil
}

// Script element operations
func (s *scriptsService) DeleteScriptElement(ctx context.Context, elementID, userID uuid.UUID, callerRole domain.CallerRole) error {
	// Get existing element to check project ownership
	element, err := s.repo.ProjectElement.GetScriptElement(ctx, elementID)
	if err != nil {
		return err
	}

	if err := s.verifyProjectAccess(ctx, element.ProjectID, userID, callerRole, domain.CallerRoleEditor); err != nil {
		return err
	}

	return s.repo.ProjectElement.DeleteScriptElement(ctx, elementID)
}

// GetResourceProject resolves which project owns a sub-resource by id. It is a
// pure lookup with no ownership check; callers (the gateway) must authorize the
// returned project before mutating. An unknown kind or a missing resource
// returns an error.
func (s *scriptsService) GetResourceProject(ctx context.Context, kind domain.ResourceKind, resourceID uuid.UUID) (uuid.UUID, error) {
	switch kind {
	case domain.ResourceKindBeat:
		beat, err := s.repo.Beat.GetBeat(ctx, resourceID)
		if err != nil {
			return uuid.Nil, err
		}
		return beat.ProjectID, nil
	case domain.ResourceKindConnection:
		conn, err := s.repo.Connection.GetConnection(ctx, resourceID)
		if err != nil {
			return uuid.Nil, err
		}
		return conn.ProjectID, nil
	case domain.ResourceKindLane:
		lane, err := s.repo.Lane.GetLane(ctx, resourceID)
		if err != nil {
			return uuid.Nil, err
		}
		return lane.ProjectID, nil
	case domain.ResourceKindOutlineItem:
		item, err := s.repo.OutlineItem.GetOutlineItem(ctx, resourceID)
		if err != nil {
			return uuid.Nil, err
		}
		return item.ProjectID, nil
	case domain.ResourceKindElement:
		element, err := s.repo.ProjectElement.GetScriptElement(ctx, resourceID)
		if err != nil {
			return uuid.Nil, err
		}
		return element.ProjectID, nil
	case domain.ResourceKindDrawing:
		drawing, err := s.repo.Drawing.GetDrawing(ctx, resourceID)
		if err != nil {
			return uuid.Nil, err
		}
		return drawing.ProjectID, nil
	case domain.ResourceKindScene:
		scene, err := s.repo.Scene.GetScene(ctx, resourceID)
		if err != nil {
			return uuid.Nil, err
		}
		return scene.ProjectID, nil
	default:
		return uuid.Nil, fmt.Errorf("unknown resource kind: %d", kind)
	}
}

// SyncProject reconciles one project bidirectionally in a single transaction:
// it applies the caller's pushed changes (upsert-by-id, server-stamped
// updated_at, last-sync-wins) and returns every row changed since cursor,
// excluding the ids just pushed so the pusher never diverges from the server.
// See SYNC_DESIGN.md.
//
// Authorization: a project already on the server must be owned by ownerID; a
// project not yet on the server is created from the push (owner forced to
// ownerID). A caller cannot sync a project owned by someone else.
func (s *scriptsService) SyncProject(ctx context.Context, projectID, ownerID uuid.UUID, cursor time.Time, in *domain.SyncChanges) (*domain.SyncChanges, time.Time, error) {
	if in == nil {
		in = &domain.SyncChanges{}
	}
	var (
		out       *domain.SyncChanges
		newCursor time.Time
	)
	err := outbox.RunInTx(ctx, s.db, func(tx *sql.Tx) error {
		owner, oerr := s.sync.ProjectOwner(ctx, tx, projectID)
		switch {
		case oerr == sql.ErrNoRows:
			// Not on the server yet. The push must carry the project row to
			// create it; otherwise there's nothing to sync.
			if in.Project == nil {
				out = &domain.SyncChanges{}
				var nerr error
				newCursor, nerr = s.sync.ServerNow(ctx, tx)
				return nerr
			}
		case oerr != nil:
			return oerr
		case owner != ownerID:
			return domain.ErrUnauthorizedAccess
		}

		// Apply the push first, then pull the delta excluding the just-pushed
		// ids — apply-then-pull keeps the pusher convergent with the server.
		if err := s.sync.ApplyChanges(ctx, tx, projectID, ownerID, in); err != nil {
			return err
		}
		var perr error
		if out, perr = s.sync.PullChanges(ctx, tx, projectID, cursor, in); perr != nil {
			return perr
		}
		newCursor, perr = s.sync.ServerNow(ctx, tx)
		return perr
	})
	if err != nil {
		return nil, time.Time{}, err
	}
	return out, newCursor, nil
}

// SyncVault reconciles a vault project's files bidirectionally (apply-then-pull,
// last-sync-wins) in one transaction. Authorization mirrors SyncProject: an
// existing project must be owned by ownerID; a project not yet on the server is
// created from the pushed project row (owner forced to ownerID). The pull is
// keyset-paginated — when hasMore is true the caller syncs again with the
// returned cursor. See SYNC_DESIGN.md.
func (s *scriptsService) SyncVault(ctx context.Context, projectID, ownerID uuid.UUID, project *domain.Project, cursor domain.VaultCursor, files []*domain.VaultFile, maxFiles, maxBytes int) ([]*domain.VaultFile, domain.VaultCursor, bool, error) {
	var (
		out        []*domain.VaultFile
		nextCursor domain.VaultCursor
		hasMore    bool
	)
	err := outbox.RunInTx(ctx, s.db, func(tx *sql.Tx) error {
		owner, oerr := s.sync.ProjectOwner(ctx, tx, projectID)
		switch {
		case oerr == sql.ErrNoRows:
			// Not on the server yet. The push must carry the project row to
			// create it; otherwise there's nothing to sync.
			if project == nil {
				now, nerr := s.sync.ServerNow(ctx, tx)
				nextCursor = domain.VaultCursor{UpdatedAt: now}
				return nerr
			}
		case oerr != nil:
			return oerr
		case owner != ownerID:
			return domain.ErrUnauthorizedAccess
		}

		if project != nil {
			if err := s.sync.UpsertProjectForVault(ctx, tx, ownerID, project); err != nil {
				return err
			}
		}
		if err := s.sync.ApplyVaultFiles(ctx, tx, projectID, files); err != nil {
			return err
		}
		pushed := make([]string, 0, len(files))
		for _, f := range files {
			pushed = append(pushed, f.Path)
		}
		var perr error
		out, hasMore, nextCursor, perr = s.sync.PullVaultFiles(ctx, tx, projectID, cursor, maxFiles, maxBytes, pushed)
		return perr
	})
	if err != nil {
		return nil, domain.VaultCursor{}, false, err
	}
	return out, nextCursor, hasMore, nil
}

// Scene operations
func (s *scriptsService) CreateScene(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole, scene *domain.Scene) (*domain.Scene, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID, callerRole, domain.CallerRoleEditor); err != nil {
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

func (s *scriptsService) GetProjectScenes(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole) ([]*domain.Scene, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID, callerRole, domain.CallerRoleViewer); err != nil {
		return nil, err
	}

	return s.repo.Scene.GetProjectScenes(ctx, projectID)
}

func (s *scriptsService) UpdateScene(ctx context.Context, sceneID, userID uuid.UUID, callerRole domain.CallerRole, updates *domain.ScenePatch) (*domain.Scene, error) {
	scene, err := s.repo.Scene.GetScene(ctx, sceneID)
	if err != nil {
		return nil, err
	}

	if err := s.verifyProjectAccess(ctx, scene.ProjectID, userID, callerRole, domain.CallerRoleEditor); err != nil {
		return nil, err
	}

	// Apply updates
	scene.UpdatedAt = time.Now()
	if updates.OutlineUnitID != nil {
		scene.OutlineUnitID = *updates.OutlineUnitID
	}
	if updates.SceneHeading != nil {
		scene.SceneHeading = *updates.SceneHeading
	}
	if updates.Content != nil {
		scene.Content = *updates.Content
	}
	if updates.OrderIndex != nil {
		scene.OrderIndex = *updates.OrderIndex
	}

	if err := s.repo.Scene.UpdateScene(ctx, scene); err != nil {
		return nil, err
	}

	return scene, nil
}

func (s *scriptsService) DeleteScene(ctx context.Context, sceneID, userID uuid.UUID, callerRole domain.CallerRole) error {
	scene, err := s.repo.Scene.GetScene(ctx, sceneID)
	if err != nil {
		return err
	}

	if err := s.verifyProjectAccess(ctx, scene.ProjectID, userID, callerRole, domain.CallerRoleEditor); err != nil {
		return err
	}

	return s.repo.Scene.DeleteScene(ctx, sceneID)
}

// Character operations
// callerRole is threaded through for signature consistency with every other
// verifyProjectAccess caller; unreached today (the gRPC handler returns
// Unimplemented before calling this), but kept in step so reactivating it
// later doesn't require rediscovering the #360 contract from scratch.
func (s *scriptsService) CreateCharacter(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole, character *domain.Character) (*domain.Character, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID, callerRole, domain.CallerRoleEditor); err != nil {
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

func (s *scriptsService) GetProjectCharacters(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole) ([]*domain.Character, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID, callerRole, domain.CallerRoleViewer); err != nil {
		return nil, err
	}

	return s.repo.Character.GetProjectCharacters(ctx, projectID)
}

func (s *scriptsService) UpdateCharacter(ctx context.Context, characterID, userID uuid.UUID, callerRole domain.CallerRole, updates *domain.CharacterPatch) (*domain.Character, error) {
	character, err := s.repo.Character.GetCharacter(ctx, characterID)
	if err != nil {
		return nil, err
	}

	if err := s.verifyProjectAccess(ctx, character.ProjectID, userID, callerRole, domain.CallerRoleEditor); err != nil {
		return nil, err
	}

	character.UpdatedAt = time.Now()
	if updates.Name != nil {
		if *updates.Name == "" {
			return nil, fmt.Errorf("%w: character name cannot be empty", domain.ErrInvalidProjectData)
		}
		character.Name = *updates.Name
	}
	if updates.Description != nil {
		character.Description = *updates.Description
	}
	if updates.Role != nil {
		character.Role = *updates.Role
	}
	if updates.Attributes != nil {
		character.Attributes = *updates.Attributes
	}

	if err := s.repo.Character.UpdateCharacter(ctx, character); err != nil {
		return nil, err
	}

	return character, nil
}

// Location operations
func (s *scriptsService) CreateLocation(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole, location *domain.Location) (*domain.Location, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID, callerRole, domain.CallerRoleEditor); err != nil {
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

func (s *scriptsService) GetProjectLocations(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole) ([]*domain.Location, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID, callerRole, domain.CallerRoleViewer); err != nil {
		return nil, err
	}

	return s.repo.Location.GetProjectLocations(ctx, projectID)
}

// Outline operations
func (s *scriptsService) CreateOutlineUnit(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole, unit *domain.OutlineUnit) (*domain.OutlineUnit, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID, callerRole, domain.CallerRoleEditor); err != nil {
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

func (s *scriptsService) GetProjectOutline(ctx context.Context, projectID, userID uuid.UUID, callerRole domain.CallerRole, typeFilter string) ([]*domain.OutlineUnit, error) {
	if err := s.verifyProjectAccess(ctx, projectID, userID, callerRole, domain.CallerRoleViewer); err != nil {
		return nil, err
	}

	return s.repo.Outline.GetProjectOutline(ctx, projectID, typeFilter)
}

func (s *scriptsService) UpdateOutlineUnit(ctx context.Context, unitID, userID uuid.UUID, callerRole domain.CallerRole, updates *domain.OutlineUnitPatch) (*domain.OutlineUnit, error) {
	unit, err := s.repo.Outline.GetOutlineUnit(ctx, unitID)
	if err != nil {
		return nil, err
	}

	if err := s.verifyProjectAccess(ctx, unit.ProjectID, userID, callerRole, domain.CallerRoleEditor); err != nil {
		return nil, err
	}

	unit.UpdatedAt = time.Now()
	if updates.Title != nil {
		if *updates.Title == "" {
			return nil, fmt.Errorf("%w: outline title cannot be empty", domain.ErrInvalidProjectData)
		}
		unit.Title = *updates.Title
	}
	if updates.Description != nil {
		unit.Description = *updates.Description
	}
	if updates.Color != nil {
		unit.Color = *updates.Color
	}
	if updates.Tags != nil {
		unit.Tags = *updates.Tags
	}
	if updates.Icon != nil {
		unit.Icon = *updates.Icon
	}
	if updates.OrderIndex != nil {
		unit.OrderIndex = *updates.OrderIndex
	}

	if err := s.repo.Outline.UpdateOutlineUnit(ctx, unit); err != nil {
		return nil, err
	}

	return unit, nil
}

func (s *scriptsService) DeleteOutlineUnit(ctx context.Context, unitID, userID uuid.UUID, callerRole domain.CallerRole) error {
	unit, err := s.repo.Outline.GetOutlineUnit(ctx, unitID)
	if err != nil {
		return err
	}

	if err := s.verifyProjectAccess(ctx, unit.ProjectID, userID, callerRole, domain.CallerRoleEditor); err != nil {
		return err
	}

	return s.repo.Outline.DeleteOutlineUnit(ctx, unitID)
}

// CreateElement creates a new script element (simplified version)
func (s *scriptsService) CreateElement(ctx context.Context, userID uuid.UUID, callerRole domain.CallerRole, element *domain.ProjectElement) (*domain.ProjectElement, error) {
	// Validate required fields
	if element.SceneID == nil {
		return nil, errors.New("scene_id is required - script elements must belong to a scene")
	}

	// Verify project access
	if err := s.verifyProjectAccess(ctx, element.ProjectID, userID, callerRole, domain.CallerRoleEditor); err != nil {
		return nil, err
	}

	// Set ID and timestamps
	element.ID = uuid.New()
	element.CreatedAt = time.Now()
	element.UpdatedAt = time.Now()

	// Create through repository
	err := s.repo.ProjectElement.CreateScriptElement(ctx, element)
	if err != nil {
		return nil, err
	}

	return element, nil
}

// UpdateElementContent updates the content of a script element (simplified version)
func (s *scriptsService) UpdateElementContent(ctx context.Context, userID, elementID uuid.UUID, callerRole domain.CallerRole, patch *domain.ElementPatch) (*domain.ProjectElement, error) {
	// Get existing element
	element, err := s.repo.ProjectElement.GetScriptElement(ctx, elementID)
	if err != nil {
		return nil, err
	}

	// Verify project access
	if err := s.verifyProjectAccess(ctx, element.ProjectID, userID, callerRole, domain.CallerRoleEditor); err != nil {
		return nil, err
	}

	// Update content and timestamp
	if patch.Content != nil {
		element.Content = *patch.Content
	}
	if patch.Type != nil {
		if *patch.Type == "" {
			return nil, fmt.Errorf("%w: element type cannot be empty", domain.ErrInvalidProjectData)
		}
		element.Type = *patch.Type
	}
	element.UpdatedAt = time.Now()

	// Update through repository
	err = s.repo.ProjectElement.UpdateScriptElement(ctx, element)
	if err != nil {
		return nil, err
	}

	return element, nil
}

// GetSceneElements gets all script elements for a scene (simplified version)
func (s *scriptsService) GetSceneElements(ctx context.Context, userID, sceneID uuid.UUID, callerRole domain.CallerRole) ([]*domain.ProjectElement, error) {
	// Get scene first to verify project access
	scene, err := s.repo.Scene.GetScene(ctx, sceneID)
	if err != nil {
		return nil, err
	}

	// Verify project access
	if err := s.verifyProjectAccess(ctx, scene.ProjectID, userID, callerRole, domain.CallerRoleViewer); err != nil {
		return nil, err
	}

	// Get elements for the scene
	return s.repo.ProjectElement.GetSceneElements(ctx, sceneID)
}

// BatchCreateElements creates multiple script elements in a single transaction
// BatchCreateElements' only caller (ImportFDX) always passes the id of the
// project it just created, making userID its literal owner by construction —
// so it hardcodes CallerRoleOwner rather than carrying a proto field solely
// for a role verifyProjectAccess's owner branch never actually consults.
func (s *scriptsService) BatchCreateElements(ctx context.Context, userID, projectID uuid.UUID, elements []*domain.ProjectElement) ([]*domain.ProjectElement, error) {
	// Verify project access
	if err := s.verifyProjectAccess(ctx, projectID, userID, domain.CallerRoleOwner, domain.CallerRoleEditor); err != nil {
		return nil, err
	}

	// Validate and prepare elements
	createdElements := make([]*domain.ProjectElement, len(elements))
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
		err := s.repo.ProjectElement.CreateScriptElement(ctx, element)
		if err != nil {
			return nil, fmt.Errorf("failed to create element at index %d: %w", i, err)
		}

		createdElements[i] = element
	}

	return createdElements, nil
}
