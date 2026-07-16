package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"

	"inkwell/server/internal/scripts/domain"
)

// queryer is satisfied by both *sql.DB and *sql.Tx, so the sync apply/pull
// helpers can run inside the service's transaction.
type queryer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// SyncRepository holds the bidirectional sync primitives (client-id upsert +
// per-project delta read). The transaction is owned by the service; these
// methods take a queryer so they compose inside it.
type SyncRepository struct{ db *sql.DB }

// NewSyncRepository returns a SyncRepository backed by db.
func NewSyncRepository(db *sql.DB) *SyncRepository { return &SyncRepository{db: db} }

// DB exposes the pool so the service can open the sync transaction.
func (r *SyncRepository) DB() *sql.DB { return r.db }

// ProjectOwner returns the owner of a project, or sql.ErrNoRows if it does not
// exist (a tombstoned project still returns its owner). Used to authorize a sync
// before applying any changes.
func (r *SyncRepository) ProjectOwner(ctx context.Context, q queryer, projectID uuid.UUID) (uuid.UUID, error) {
	var owner uuid.UUID
	err := q.QueryRowContext(ctx, `SELECT owner_id FROM projects WHERE project_id = $1`, projectID).Scan(&owner)
	return owner, err
}

// ServerNow returns the database clock — the single authoritative time used to
// stamp updated_at and as the new sync cursor.
func (r *SyncRepository) ServerNow(ctx context.Context, q queryer) (time.Time, error) {
	var now time.Time
	err := q.QueryRowContext(ctx, `SELECT NOW()`).Scan(&now)
	return now, err
}

// nullableCreated returns a *time.Time for COALESCE($n, NOW()) — nil when the
// client omitted created_at (the beat-board tables don't track it client-side).
func nullableCreated(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	return &t
}

// idArray binds a uuid slice as a non-null Postgres array. A nil slice through
// pq.Array becomes SQL NULL, and `x <> ALL(NULL)` is NULL (not TRUE) — which
// would filter out every row when the exclusion set is empty. Coercing to a
// non-nil empty slice yields `<> ALL('{}')` ⇒ TRUE.
func idArray(ids []uuid.UUID) any {
	if ids == nil {
		ids = []uuid.UUID{}
	}
	return pq.Array(ids)
}

// jsonOrEmpty marshals a string map to a JSON object string, never "null".
func jsonOrEmpty(m map[string]string) string {
	if len(m) == 0 {
		return "{}"
	}
	b, err := json.Marshal(m)
	if err != nil {
		return "{}"
	}
	return string(b)
}

// ─── Apply (client-id upsert, last-sync-wins) ────────────────────────────────
//
// Every upsert stamps updated_at = NOW() (server clock) and writes the client's
// deleted_at verbatim (so a tombstone push deletes, and re-creating a tombstoned
// id revives it). created_at uses the client value when present, else NOW(), and
// is never overwritten on conflict. Child rows force project_id to the
// authorized project, so a caller can't inject rows into someone else's project.

// ApplyChanges upserts every row in c for the authorized project. ownerID owns
// the project (enforced on the project row); children inherit it transitively.
func (r *SyncRepository) ApplyChanges(ctx context.Context, q queryer, projectID, ownerID uuid.UUID, c *domain.SyncChanges) error {
	if c == nil {
		return nil
	}
	if c.Project != nil {
		if err := r.upsertProject(ctx, q, ownerID, c.Project); err != nil {
			return err
		}
	}
	for _, s := range c.Scenes {
		if err := r.upsertScene(ctx, q, projectID, s); err != nil {
			return err
		}
	}
	for _, e := range c.Elements {
		if err := r.upsertElement(ctx, q, projectID, e); err != nil {
			return err
		}
	}
	for _, ch := range c.Characters {
		if err := r.upsertCharacter(ctx, q, projectID, ch); err != nil {
			return err
		}
	}
	for _, l := range c.Locations {
		if err := r.upsertLocation(ctx, q, projectID, l); err != nil {
			return err
		}
	}
	for _, b := range c.Beats {
		if err := r.upsertBeat(ctx, q, projectID, b); err != nil {
			return err
		}
	}
	for _, cn := range c.Connections {
		if err := r.upsertConnection(ctx, q, projectID, cn); err != nil {
			return err
		}
	}
	for _, l := range c.Lanes {
		if err := r.upsertLane(ctx, q, projectID, l); err != nil {
			return err
		}
	}
	for _, d := range c.Drawings {
		if err := r.upsertDrawing(ctx, q, projectID, d); err != nil {
			return err
		}
	}
	for _, oi := range c.OutlineItems {
		if err := r.upsertOutlineItem(ctx, q, projectID, oi); err != nil {
			return err
		}
	}
	return nil
}

func (r *SyncRepository) upsertProject(ctx context.Context, q queryer, ownerID uuid.UUID, p *domain.Project) error {
	_, err := q.ExecContext(ctx, `
		INSERT INTO projects (project_id, title, description, owner_id, category, status, is_starred, created_at, updated_at, deleted_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()), NOW(), $9)
		ON CONFLICT (project_id) DO UPDATE SET
			title = EXCLUDED.title, description = EXCLUDED.description,
			category = EXCLUDED.category, status = EXCLUDED.status,
			is_starred = EXCLUDED.is_starred, updated_at = NOW(),
			deleted_at = EXCLUDED.deleted_at
		WHERE projects.owner_id = $4`,
		p.ID, p.Title, p.Description, ownerID, p.Category, p.Status, p.IsStarred,
		nullableCreated(p.CreatedAt), p.DeletedAt)
	return err
}

func (r *SyncRepository) upsertScene(ctx context.Context, q queryer, projectID uuid.UUID, s *domain.Scene) error {
	_, err := q.ExecContext(ctx, `
		INSERT INTO scenes (scene_id, project_id, outline_unit_id, scene_heading, content, order_index, created_at, updated_at, deleted_at)
		VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), NOW(), $8)
		ON CONFLICT (scene_id) DO UPDATE SET
			scene_heading = EXCLUDED.scene_heading, content = EXCLUDED.content,
			order_index = EXCLUDED.order_index, updated_at = NOW(),
			deleted_at = EXCLUDED.deleted_at
		WHERE scenes.project_id = $2`,
		s.ID, projectID, s.OutlineUnitID, s.SceneHeading, s.Content, s.OrderIndex,
		nullableCreated(s.CreatedAt), s.DeletedAt)
	return err
}

func (r *SyncRepository) upsertElement(ctx context.Context, q queryer, projectID uuid.UUID, e *domain.ProjectElement) error {
	_, err := q.ExecContext(ctx, `
		INSERT INTO script_elements (element_id, project_id, scene_id, element_type, content, line_number, formatting, created_at, updated_at, deleted_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()), NOW(), $9)
		ON CONFLICT (element_id) DO UPDATE SET
			scene_id = EXCLUDED.scene_id, element_type = EXCLUDED.element_type,
			content = EXCLUDED.content, line_number = EXCLUDED.line_number,
			formatting = EXCLUDED.formatting, updated_at = NOW(),
			deleted_at = EXCLUDED.deleted_at
		WHERE script_elements.project_id = $2`,
		e.ID, projectID, e.SceneID, e.Type, e.Content, e.LineNumber,
		jsonOrEmpty(e.Formatting), nullableCreated(e.CreatedAt), e.DeletedAt)
	return err
}

func (r *SyncRepository) upsertCharacter(ctx context.Context, q queryer, projectID uuid.UUID, c *domain.Character) error {
	_, err := q.ExecContext(ctx, `
		INSERT INTO characters (character_id, project_id, name, description, role, attributes, created_at, updated_at, deleted_at)
		VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), NOW(), $8)
		ON CONFLICT (character_id) DO UPDATE SET
			name = EXCLUDED.name, description = EXCLUDED.description,
			role = EXCLUDED.role, attributes = EXCLUDED.attributes,
			updated_at = NOW(), deleted_at = EXCLUDED.deleted_at
		WHERE characters.project_id = $2`,
		c.ID, projectID, c.Name, c.Description, c.Role, jsonOrEmpty(c.Attributes),
		nullableCreated(c.CreatedAt), c.DeletedAt)
	return err
}

func (r *SyncRepository) upsertLocation(ctx context.Context, q queryer, projectID uuid.UUID, l *domain.Location) error {
	_, err := q.ExecContext(ctx, `
		INSERT INTO locations (location_id, project_id, name, description, location_type, created_at, updated_at, deleted_at)
		VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), NOW(), $7)
		ON CONFLICT (location_id) DO UPDATE SET
			name = EXCLUDED.name, description = EXCLUDED.description,
			location_type = EXCLUDED.location_type, updated_at = NOW(),
			deleted_at = EXCLUDED.deleted_at
		WHERE locations.project_id = $2`,
		l.ID, projectID, l.Name, l.Description, l.Type, nullableCreated(l.CreatedAt), l.DeletedAt)
	return err
}

func (r *SyncRepository) upsertBeat(ctx context.Context, q queryer, projectID uuid.UUID, b *domain.Beat) error {
	_, err := q.ExecContext(ctx, `
		INSERT INTO beats (beat_id, project_id, title, description, scene_numbers, color, position_x, position_y, width, height, act_number, beat_order, start_page, end_page, image_url, created_at, updated_at, deleted_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, COALESCE($16, NOW()), NOW(), $17)
		ON CONFLICT (beat_id) DO UPDATE SET
			title = EXCLUDED.title, description = EXCLUDED.description,
			scene_numbers = EXCLUDED.scene_numbers, color = EXCLUDED.color,
			position_x = EXCLUDED.position_x, position_y = EXCLUDED.position_y,
			width = EXCLUDED.width, height = EXCLUDED.height,
			act_number = EXCLUDED.act_number, beat_order = EXCLUDED.beat_order,
			start_page = EXCLUDED.start_page, end_page = EXCLUDED.end_page,
			image_url = EXCLUDED.image_url, updated_at = NOW(),
			deleted_at = EXCLUDED.deleted_at
		WHERE beats.project_id = $2`,
		b.ID, projectID, b.Title, b.Description, b.SceneNumbers, b.Color,
		b.PositionX, b.PositionY, b.Width, b.Height, b.ActNumber, b.Order,
		b.StartPage, b.EndPage, b.ImageURL, nullableCreated(b.CreatedAt), b.DeletedAt)
	return err
}

func (r *SyncRepository) upsertConnection(ctx context.Context, q queryer, projectID uuid.UUID, c *domain.Connection) error {
	_, err := q.ExecContext(ctx, `
		INSERT INTO beat_connections (connection_id, project_id, from_beat_id, to_beat_id, from_side, to_side, created_at, updated_at, deleted_at)
		VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), NOW(), $8)
		ON CONFLICT (connection_id) DO UPDATE SET
			from_beat_id = EXCLUDED.from_beat_id, to_beat_id = EXCLUDED.to_beat_id,
			from_side = EXCLUDED.from_side, to_side = EXCLUDED.to_side,
			updated_at = NOW(), deleted_at = EXCLUDED.deleted_at
		WHERE beat_connections.project_id = $2`,
		c.ID, projectID, c.FromID, c.ToID, c.FromSide, c.ToSide,
		nullableCreated(c.CreatedAt), c.DeletedAt)
	return err
}

func (r *SyncRepository) upsertLane(ctx context.Context, q queryer, projectID uuid.UUID, l *domain.Lane) error {
	_, err := q.ExecContext(ctx, `
		INSERT INTO lanes (lane_id, project_id, name, color, lane_order, created_at, updated_at, deleted_at)
		VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), NOW(), $7)
		ON CONFLICT (lane_id) DO UPDATE SET
			name = EXCLUDED.name, color = EXCLUDED.color,
			lane_order = EXCLUDED.lane_order, updated_at = NOW(),
			deleted_at = EXCLUDED.deleted_at
		WHERE lanes.project_id = $2`,
		l.ID, projectID, l.Name, l.Color, l.Order, nullableCreated(l.CreatedAt), l.DeletedAt)
	return err
}

func (r *SyncRepository) upsertOutlineItem(ctx context.Context, q queryer, projectID uuid.UUID, o *domain.OutlineItem) error {
	_, err := q.ExecContext(ctx, `
		INSERT INTO outline_items (outline_item_id, project_id, beat_id, lane_id, item_order, timeline_position, width, created_at, updated_at, deleted_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()), NOW(), $9)
		ON CONFLICT (outline_item_id) DO UPDATE SET
			beat_id = EXCLUDED.beat_id, lane_id = EXCLUDED.lane_id,
			item_order = EXCLUDED.item_order, timeline_position = EXCLUDED.timeline_position,
			width = EXCLUDED.width, updated_at = NOW(),
			deleted_at = EXCLUDED.deleted_at
		WHERE outline_items.project_id = $2`,
		o.ID, projectID, o.BeatID, o.LaneID, o.Order, o.TimelinePosition, o.Width,
		nullableCreated(o.CreatedAt), o.DeletedAt)
	return err
}

// upsertDrawing writes one shape. `data` is stored verbatim — the server never
// looks inside a shape (decisions/0022), so there is nothing to validate here
// beyond what the column already enforces.
func (r *SyncRepository) upsertDrawing(ctx context.Context, q queryer, projectID uuid.UUID, d *domain.Drawing) error {
	_, err := q.ExecContext(ctx, `
		INSERT INTO drawings (drawing_id, project_id, kind, data, drawing_order, created_at, updated_at, deleted_at)
		VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), NOW(), $7)
		ON CONFLICT (drawing_id) DO UPDATE SET
			kind = EXCLUDED.kind, data = EXCLUDED.data,
			drawing_order = EXCLUDED.drawing_order, updated_at = NOW(),
			deleted_at = EXCLUDED.deleted_at
		WHERE drawings.project_id = $2`,
		d.ID, projectID, d.Kind, d.Data, d.Order, nullableCreated(d.CreatedAt), d.DeletedAt)
	return err
}

// ─── Pull (per-project delta, excluding just-pushed ids) ─────────────────────
//
// Returns every row for the project with updated_at > cursor (incl. tombstones),
// minus the ids the caller just pushed (so the pusher keeps its own version and
// never diverges). A zero cursor pulls the whole project (first sync / fresh
// device).

// PullChanges collects the project delta since cursor, excluding the ids present
// in pushed (the caller's own push). pushed may be nil.
func (r *SyncRepository) PullChanges(ctx context.Context, q queryer, projectID uuid.UUID, cursor time.Time, pushed *domain.SyncChanges) (*domain.SyncChanges, error) {
	out := &domain.SyncChanges{}
	ex := newExcluder(pushed)

	proj, err := r.pullProject(ctx, q, projectID, cursor, ex.project)
	if err != nil {
		return nil, err
	}
	out.Project = proj
	if out.Scenes, err = r.pullScenes(ctx, q, projectID, cursor, ex.scenes); err != nil {
		return nil, err
	}
	if out.Elements, err = r.pullElements(ctx, q, projectID, cursor, ex.elements); err != nil {
		return nil, err
	}
	if out.Characters, err = r.pullCharacters(ctx, q, projectID, cursor, ex.characters); err != nil {
		return nil, err
	}
	if out.Locations, err = r.pullLocations(ctx, q, projectID, cursor, ex.locations); err != nil {
		return nil, err
	}
	if out.Beats, err = r.pullBeats(ctx, q, projectID, cursor, ex.beats); err != nil {
		return nil, err
	}
	if out.Connections, err = r.pullConnections(ctx, q, projectID, cursor, ex.connections); err != nil {
		return nil, err
	}
	if out.Lanes, err = r.pullLanes(ctx, q, projectID, cursor, ex.lanes); err != nil {
		return nil, err
	}
	if out.OutlineItems, err = r.pullOutlineItems(ctx, q, projectID, cursor, ex.outlineItems); err != nil {
		return nil, err
	}
	if out.Drawings, err = r.pullDrawings(ctx, q, projectID, cursor, ex.drawings); err != nil {
		return nil, err
	}
	return out, nil
}

// excluder holds the per-entity id lists to exclude from a pull.
type excluder struct {
	project      []uuid.UUID
	scenes       []uuid.UUID
	elements     []uuid.UUID
	characters   []uuid.UUID
	locations    []uuid.UUID
	beats        []uuid.UUID
	connections  []uuid.UUID
	lanes        []uuid.UUID
	outlineItems []uuid.UUID
	drawings     []uuid.UUID
}

func newExcluder(c *domain.SyncChanges) excluder {
	var e excluder
	if c == nil {
		return e
	}
	if c.Project != nil {
		e.project = []uuid.UUID{c.Project.ID}
	}
	for _, s := range c.Scenes {
		e.scenes = append(e.scenes, s.ID)
	}
	for _, x := range c.Elements {
		e.elements = append(e.elements, x.ID)
	}
	for _, x := range c.Characters {
		e.characters = append(e.characters, x.ID)
	}
	for _, x := range c.Locations {
		e.locations = append(e.locations, x.ID)
	}
	for _, x := range c.Beats {
		e.beats = append(e.beats, x.ID)
	}
	for _, x := range c.Connections {
		e.connections = append(e.connections, x.ID)
	}
	for _, x := range c.Lanes {
		e.lanes = append(e.lanes, x.ID)
	}
	for _, x := range c.OutlineItems {
		e.outlineItems = append(e.outlineItems, x.ID)
	}
	for _, x := range c.Drawings {
		e.drawings = append(e.drawings, x.ID)
	}
	return e
}

func (r *SyncRepository) pullProject(ctx context.Context, q queryer, projectID uuid.UUID, cursor time.Time, exclude []uuid.UUID) (*domain.Project, error) {
	p := &domain.Project{}
	err := q.QueryRowContext(ctx, `
		SELECT project_id, title, description, owner_id, category, status, is_starred, created_at, updated_at, deleted_at
		FROM projects
		WHERE project_id = $1 AND updated_at > $2 AND project_id <> ALL($3::uuid[])`,
		projectID, cursor, idArray(exclude),
	).Scan(&p.ID, &p.Title, &p.Description, &p.OwnerID, &p.Category, &p.Status, &p.IsStarred, &p.CreatedAt, &p.UpdatedAt, &p.DeletedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (r *SyncRepository) pullScenes(ctx context.Context, q queryer, projectID uuid.UUID, cursor time.Time, exclude []uuid.UUID) ([]*domain.Scene, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT scene_id, project_id, outline_unit_id, scene_heading, content, order_index, created_at, updated_at, deleted_at
		FROM scenes
		WHERE project_id = $1 AND updated_at > $2 AND scene_id <> ALL($3::uuid[])
		ORDER BY updated_at`,
		projectID, cursor, idArray(exclude))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.Scene
	for rows.Next() {
		s := &domain.Scene{}
		if err := rows.Scan(&s.ID, &s.ProjectID, &s.OutlineUnitID, &s.SceneHeading, &s.Content, &s.OrderIndex, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *SyncRepository) pullElements(ctx context.Context, q queryer, projectID uuid.UUID, cursor time.Time, exclude []uuid.UUID) ([]*domain.ProjectElement, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT element_id, project_id, scene_id, element_type, content, line_number, formatting, created_at, updated_at, deleted_at
		FROM script_elements
		WHERE project_id = $1 AND updated_at > $2 AND element_id <> ALL($3::uuid[])
		ORDER BY updated_at`,
		projectID, cursor, idArray(exclude))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.ProjectElement
	for rows.Next() {
		e := &domain.ProjectElement{}
		var formatting string
		if err := rows.Scan(&e.ID, &e.ProjectID, &e.SceneID, &e.Type, &e.Content, &e.LineNumber, &formatting, &e.CreatedAt, &e.UpdatedAt, &e.DeletedAt); err != nil {
			return nil, err
		}
		e.Formatting = map[string]string{}
		if formatting != "" && formatting != "{}" {
			_ = json.Unmarshal([]byte(formatting), &e.Formatting)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *SyncRepository) pullCharacters(ctx context.Context, q queryer, projectID uuid.UUID, cursor time.Time, exclude []uuid.UUID) ([]*domain.Character, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT character_id, project_id, name, description, role, attributes, created_at, updated_at, deleted_at
		FROM characters
		WHERE project_id = $1 AND updated_at > $2 AND character_id <> ALL($3::uuid[])
		ORDER BY updated_at`,
		projectID, cursor, idArray(exclude))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.Character
	for rows.Next() {
		c := &domain.Character{}
		var attrs string
		if err := rows.Scan(&c.ID, &c.ProjectID, &c.Name, &c.Description, &c.Role, &attrs, &c.CreatedAt, &c.UpdatedAt, &c.DeletedAt); err != nil {
			return nil, err
		}
		c.Attributes = map[string]string{}
		if attrs != "" && attrs != "{}" {
			_ = json.Unmarshal([]byte(attrs), &c.Attributes)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *SyncRepository) pullLocations(ctx context.Context, q queryer, projectID uuid.UUID, cursor time.Time, exclude []uuid.UUID) ([]*domain.Location, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT location_id, project_id, name, description, location_type, created_at, updated_at, deleted_at
		FROM locations
		WHERE project_id = $1 AND updated_at > $2 AND location_id <> ALL($3::uuid[])
		ORDER BY updated_at`,
		projectID, cursor, idArray(exclude))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.Location
	for rows.Next() {
		l := &domain.Location{}
		if err := rows.Scan(&l.ID, &l.ProjectID, &l.Name, &l.Description, &l.Type, &l.CreatedAt, &l.UpdatedAt, &l.DeletedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *SyncRepository) pullBeats(ctx context.Context, q queryer, projectID uuid.UUID, cursor time.Time, exclude []uuid.UUID) ([]*domain.Beat, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT beat_id, project_id, title, description, scene_numbers, color, position_x, position_y, width, height, act_number, beat_order, start_page, end_page, image_url, created_at, updated_at, deleted_at
		FROM beats
		WHERE project_id = $1 AND updated_at > $2 AND beat_id <> ALL($3::uuid[])
		ORDER BY updated_at`,
		projectID, cursor, idArray(exclude))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.Beat
	for rows.Next() {
		b := &domain.Beat{}
		if err := rows.Scan(&b.ID, &b.ProjectID, &b.Title, &b.Description, &b.SceneNumbers, &b.Color, &b.PositionX, &b.PositionY, &b.Width, &b.Height, &b.ActNumber, &b.Order, &b.StartPage, &b.EndPage, &b.ImageURL, &b.CreatedAt, &b.UpdatedAt, &b.DeletedAt); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (r *SyncRepository) pullConnections(ctx context.Context, q queryer, projectID uuid.UUID, cursor time.Time, exclude []uuid.UUID) ([]*domain.Connection, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT connection_id, project_id, from_beat_id, to_beat_id, from_side, to_side, created_at, updated_at, deleted_at
		FROM beat_connections
		WHERE project_id = $1 AND updated_at > $2 AND connection_id <> ALL($3::uuid[])
		ORDER BY updated_at`,
		projectID, cursor, idArray(exclude))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.Connection
	for rows.Next() {
		c := &domain.Connection{}
		if err := rows.Scan(&c.ID, &c.ProjectID, &c.FromID, &c.ToID, &c.FromSide, &c.ToSide, &c.CreatedAt, &c.UpdatedAt, &c.DeletedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *SyncRepository) pullLanes(ctx context.Context, q queryer, projectID uuid.UUID, cursor time.Time, exclude []uuid.UUID) ([]*domain.Lane, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT lane_id, project_id, name, color, lane_order, created_at, updated_at, deleted_at
		FROM lanes
		WHERE project_id = $1 AND updated_at > $2 AND lane_id <> ALL($3::uuid[])
		ORDER BY updated_at`,
		projectID, cursor, idArray(exclude))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.Lane
	for rows.Next() {
		l := &domain.Lane{}
		if err := rows.Scan(&l.ID, &l.ProjectID, &l.Name, &l.Color, &l.Order, &l.CreatedAt, &l.UpdatedAt, &l.DeletedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *SyncRepository) pullDrawings(ctx context.Context, q queryer, projectID uuid.UUID, cursor time.Time, exclude []uuid.UUID) ([]*domain.Drawing, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT drawing_id, project_id, kind, data, drawing_order, created_at, updated_at, deleted_at
		FROM drawings
		WHERE project_id = $1 AND updated_at > $2 AND drawing_id <> ALL($3::uuid[])
		ORDER BY updated_at`,
		projectID, cursor, idArray(exclude))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.Drawing
	for rows.Next() {
		d := &domain.Drawing{}
		if err := rows.Scan(&d.ID, &d.ProjectID, &d.Kind, &d.Data, &d.Order, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *SyncRepository) pullOutlineItems(ctx context.Context, q queryer, projectID uuid.UUID, cursor time.Time, exclude []uuid.UUID) ([]*domain.OutlineItem, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT outline_item_id, project_id, beat_id, lane_id, item_order, timeline_position, width, created_at, updated_at, deleted_at
		FROM outline_items
		WHERE project_id = $1 AND updated_at > $2 AND outline_item_id <> ALL($3::uuid[])
		ORDER BY updated_at`,
		projectID, cursor, idArray(exclude))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.OutlineItem
	for rows.Next() {
		o := &domain.OutlineItem{}
		if err := rows.Scan(&o.ID, &o.ProjectID, &o.BeatID, &o.LaneID, &o.Order, &o.TimelinePosition, &o.Width, &o.CreatedAt, &o.UpdatedAt, &o.DeletedAt); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// PurgeTombstones hard-deletes tombstoned rows older than the retention horizon
// across every synced table. Time-based GC — no device tracking; a device
// offline past the horizon may resurrect a few rows (acceptable at this scale).
// Returns the number of rows purged.
func (r *SyncRepository) PurgeTombstones(ctx context.Context, olderThan time.Duration) (int64, error) {
	cutoff := time.Now().Add(-olderThan)
	var total int64
	tables := []string{
		"scenes", "script_elements", "characters", "locations",
		"beats", "beat_connections", "lanes", "outline_items", "drawings", "projects",
	}
	for _, t := range tables {
		res, err := r.db.ExecContext(ctx,
			`DELETE FROM `+t+` WHERE deleted_at IS NOT NULL AND deleted_at < $1`, cutoff)
		if err != nil {
			return total, err
		}
		if n, err := res.RowsAffected(); err == nil {
			total += n
		}
	}
	return total, nil
}
