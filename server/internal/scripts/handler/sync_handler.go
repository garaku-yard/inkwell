package handler

import (
	"context"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/scripts/domain"
	"inkwell/server/pkg/grpc/common"
	scriptspb "inkwell/server/pkg/grpc/scripts"
)

// SyncProject reconciles one project bidirectionally for the gateway's sync
// endpoint. It maps the proto change bundle to domain, delegates to the service
// (apply-then-pull, last-sync-wins), and maps the resulting delta back. See
// SYNC_DESIGN.md.
func (h *ScriptsHandler) SyncProject(ctx context.Context, req *scriptspb.SyncProjectRequest) (*scriptspb.SyncProjectResponse, error) {
	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}
	ownerID, err := uuid.Parse(req.OwnerId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid owner_id: %v", err)
	}

	out, cursor, err := h.service.SyncProject(ctx, projectID, ownerID, goTime(req.Cursor), protoToSyncChanges(req.Changes))
	if err != nil {
		return nil, handleServiceError(err)
	}

	return &scriptspb.SyncProjectResponse{
		Changes: syncChangesToProto(out),
		Cursor:  protoTS(cursor),
	}, nil
}

// Vault sync page bounds: one pull page carries at most this many files and this
// many content bytes (whichever comes first), so a large first pull stays under
// the gateway's request size cap. The client pages until has_more is false.
const (
	vaultPageMaxFiles = 200
	vaultPageMaxBytes = 16 << 20 // 16 MiB
)

// SyncVault reconciles a vault project's files for the gateway's vault sync
// endpoint: it maps the proto file batch to domain, delegates to the service
// (apply-then-pull-by-path, last-sync-wins), and maps the resulting page back.
// See SYNC_DESIGN.md.
func (h *ScriptsHandler) SyncVault(ctx context.Context, req *scriptspb.SyncVaultRequest) (*scriptspb.SyncVaultResponse, error) {
	projectID, err := uuid.Parse(req.ProjectId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}
	ownerID, err := uuid.Parse(req.OwnerId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid owner_id: %v", err)
	}

	var project *domain.Project
	if req.Project != nil {
		project = syncProtoToProject(req.Project)
	}
	files := make([]*domain.VaultFile, 0, len(req.Files))
	for _, f := range req.Files {
		files = append(files, &domain.VaultFile{
			Path:        f.Path,
			Content:     f.Content,
			ContentHash: f.ContentHash,
			DeletedAt:   goTimePtr(f.DeletedAt),
		})
	}

	out, nextCursor, hasMore, err := h.service.SyncVault(
		ctx, projectID, ownerID, project, protoToVaultCursor(req.Cursor), files,
		vaultPageMaxFiles, vaultPageMaxBytes,
	)
	if err != nil {
		return nil, handleServiceError(err)
	}

	respFiles := make([]*scriptspb.VaultFile, 0, len(out))
	for _, f := range out {
		respFiles = append(respFiles, &scriptspb.VaultFile{
			Path:        f.Path,
			Content:     f.Content,
			ContentHash: f.ContentHash,
			UpdatedAt:   protoTS(f.UpdatedAt),
			DeletedAt:   protoTSPtr(f.DeletedAt),
		})
	}
	return &scriptspb.SyncVaultResponse{
		Files:   respFiles,
		Cursor:  vaultCursorToProto(nextCursor),
		HasMore: hasMore,
	}, nil
}

func protoToVaultCursor(c *scriptspb.VaultCursor) domain.VaultCursor {
	if c == nil {
		return domain.VaultCursor{}
	}
	return domain.VaultCursor{UpdatedAt: goTime(c.UpdatedAt), Path: c.Path}
}

func vaultCursorToProto(c domain.VaultCursor) *scriptspb.VaultCursor {
	return &scriptspb.VaultCursor{UpdatedAt: protoTS(c.UpdatedAt), Path: c.Path}
}

// ─── time + id helpers ───────────────────────────────────────────────────────

func protoTS(t time.Time) *common.Timestamp {
	if t.IsZero() {
		return nil
	}
	return &common.Timestamp{Seconds: t.Unix(), Nanos: int32(t.Nanosecond())}
}

func protoTSPtr(t *time.Time) *common.Timestamp {
	if t == nil {
		return nil
	}
	return protoTS(*t)
}

func goTime(ts *common.Timestamp) time.Time {
	if ts == nil {
		return time.Time{}
	}
	return time.Unix(ts.Seconds, int64(ts.Nanos)).UTC()
}

func goTimePtr(ts *common.Timestamp) *time.Time {
	if ts == nil {
		return nil
	}
	t := goTime(ts)
	return &t
}

// parseUUIDPtr parses an optional id string; "" or invalid yields nil.
func parseUUIDPtr(s string) *uuid.UUID {
	if s == "" {
		return nil
	}
	id, err := uuid.Parse(s)
	if err != nil {
		return nil
	}
	return &id
}

// ─── proto → domain (push) ───────────────────────────────────────────────────
//
// updated_at is intentionally not carried in: the server stamps it on upsert
// (single authoritative clock). created_at and deleted_at flow through.

func protoToSyncChanges(c *scriptspb.SyncChanges) *domain.SyncChanges {
	if c == nil {
		return &domain.SyncChanges{}
	}
	out := &domain.SyncChanges{}
	if c.Project != nil {
		out.Project = syncProtoToProject(c.Project)
	}
	for _, s := range c.Scenes {
		if d := syncProtoToScene(s); d != nil {
			out.Scenes = append(out.Scenes, d)
		}
	}
	for _, e := range c.Elements {
		if d := syncProtoToElement(e); d != nil {
			out.Elements = append(out.Elements, d)
		}
	}
	for _, x := range c.Characters {
		if d := syncProtoToCharacter(x); d != nil {
			out.Characters = append(out.Characters, d)
		}
	}
	for _, x := range c.Locations {
		if d := syncProtoToLocation(x); d != nil {
			out.Locations = append(out.Locations, d)
		}
	}
	for _, x := range c.Beats {
		if d := syncProtoToBeat(x); d != nil {
			out.Beats = append(out.Beats, d)
		}
	}
	for _, x := range c.Connections {
		if d := syncProtoToConnection(x); d != nil {
			out.Connections = append(out.Connections, d)
		}
	}
	for _, x := range c.Lanes {
		if d := syncProtoToLane(x); d != nil {
			out.Lanes = append(out.Lanes, d)
		}
	}
	for _, x := range c.OutlineItems {
		if d := syncProtoToOutlineItem(x); d != nil {
			out.OutlineItems = append(out.OutlineItems, d)
		}
	}
	return out
}

func syncProtoToProject(p *scriptspb.Project) *domain.Project {
	id, err := uuid.Parse(p.Id)
	if err != nil {
		return nil
	}
	owner, _ := uuid.Parse(p.OwnerId)
	return &domain.Project{
		ID: id, Title: p.Title, Description: p.Description, OwnerID: owner,
		Category: p.Category, Status: p.Status, IsStarred: p.IsStarred,
		CreatedAt: goTime(p.CreatedAt), DeletedAt: goTimePtr(p.DeletedAt),
	}
}

func syncProtoToScene(s *scriptspb.Scene) *domain.Scene {
	id, err := uuid.Parse(s.Id)
	if err != nil {
		return nil
	}
	pid, _ := uuid.Parse(s.ProjectId)
	return &domain.Scene{
		ID: id, ProjectID: pid, OutlineUnitID: parseUUIDPtr(s.OutlineUnitId),
		SceneHeading: s.SceneHeading, Content: s.Content, OrderIndex: s.OrderIndex,
		CreatedAt: goTime(s.CreatedAt), DeletedAt: goTimePtr(s.DeletedAt),
	}
}

func syncProtoToElement(e *scriptspb.ProjectElement) *domain.ProjectElement {
	id, err := uuid.Parse(e.Id)
	if err != nil {
		return nil
	}
	pid, _ := uuid.Parse(e.ProjectId)
	return &domain.ProjectElement{
		ID: id, ProjectID: pid, SceneID: parseUUIDPtr(e.SceneId),
		Type: e.Type, Content: e.Content, LineNumber: e.LineNumber,
		Formatting: e.Formatting,
		CreatedAt:  goTime(e.CreatedAt), DeletedAt: goTimePtr(e.DeletedAt),
	}
}

func syncProtoToCharacter(c *scriptspb.Character) *domain.Character {
	id, err := uuid.Parse(c.Id)
	if err != nil {
		return nil
	}
	pid, _ := uuid.Parse(c.ProjectId)
	return &domain.Character{
		ID: id, ProjectID: pid, Name: c.Name, Description: c.Description,
		Role: c.Role, Attributes: c.Attributes,
		CreatedAt: goTime(c.CreatedAt), DeletedAt: goTimePtr(c.DeletedAt),
	}
}

func syncProtoToLocation(l *scriptspb.Location) *domain.Location {
	id, err := uuid.Parse(l.Id)
	if err != nil {
		return nil
	}
	pid, _ := uuid.Parse(l.ProjectId)
	return &domain.Location{
		ID: id, ProjectID: pid, Name: l.Name, Description: l.Description,
		Type: l.Type, CreatedAt: goTime(l.CreatedAt), DeletedAt: goTimePtr(l.DeletedAt),
	}
}

func syncProtoToBeat(b *scriptspb.Beat) *domain.Beat {
	id, err := uuid.Parse(b.Id)
	if err != nil {
		return nil
	}
	pid, _ := uuid.Parse(b.ProjectId)
	return &domain.Beat{
		ID: id, ProjectID: pid, Title: b.Title, Description: b.Description,
		SceneNumbers: b.SceneNumbers, Color: b.Color,
		PositionX: int32(b.PositionX), PositionY: int32(b.PositionY),
		Width: int32(b.Width), Height: int32(b.Height),
		ActNumber: b.ActNumber, Order: b.Order,
		StartPage: b.StartPage, EndPage: b.EndPage, ImageURL: b.ImageUrl,
		CreatedAt: goTime(b.CreatedAt), DeletedAt: goTimePtr(b.DeletedAt),
	}
}

func syncProtoToConnection(c *scriptspb.Connection) *domain.Connection {
	id, err := uuid.Parse(c.Id)
	if err != nil {
		return nil
	}
	pid, _ := uuid.Parse(c.ProjectId)
	from, _ := uuid.Parse(c.FromBeatId)
	to, _ := uuid.Parse(c.ToBeatId)
	return &domain.Connection{
		ID: id, ProjectID: pid, FromID: from, ToID: to,
		FromSide: c.FromSide, ToSide: c.ToSide,
		CreatedAt: goTime(c.CreatedAt), DeletedAt: goTimePtr(c.DeletedAt),
	}
}

func syncProtoToLane(l *scriptspb.Lane) *domain.Lane {
	id, err := uuid.Parse(l.Id)
	if err != nil {
		return nil
	}
	pid, _ := uuid.Parse(l.ProjectId)
	return &domain.Lane{
		ID: id, ProjectID: pid, Name: l.Name, Color: l.Color, Order: l.Order,
		CreatedAt: goTime(l.CreatedAt), DeletedAt: goTimePtr(l.DeletedAt),
	}
}

func syncProtoToOutlineItem(o *scriptspb.OutlineItem) *domain.OutlineItem {
	id, err := uuid.Parse(o.Id)
	if err != nil {
		return nil
	}
	pid, _ := uuid.Parse(o.ProjectId)
	bid, _ := uuid.Parse(o.BeatId)
	lid, _ := uuid.Parse(o.LaneId)
	return &domain.OutlineItem{
		ID: id, ProjectID: pid, BeatID: bid, LaneID: lid, Order: o.Order,
		TimelinePosition: o.TimelinePosition, Width: o.Width,
		CreatedAt: goTime(o.CreatedAt), DeletedAt: goTimePtr(o.DeletedAt),
	}
}

// ─── domain → proto (pull) ───────────────────────────────────────────────────

func syncChangesToProto(c *domain.SyncChanges) *scriptspb.SyncChanges {
	if c == nil {
		return &scriptspb.SyncChanges{}
	}
	out := &scriptspb.SyncChanges{}
	if c.Project != nil {
		out.Project = syncProjectToProto(c.Project)
	}
	for _, s := range c.Scenes {
		out.Scenes = append(out.Scenes, syncSceneToProto(s))
	}
	for _, e := range c.Elements {
		out.Elements = append(out.Elements, syncElementToProto(e))
	}
	for _, x := range c.Characters {
		out.Characters = append(out.Characters, syncCharacterToProto(x))
	}
	for _, x := range c.Locations {
		out.Locations = append(out.Locations, syncLocationToProto(x))
	}
	for _, x := range c.Beats {
		out.Beats = append(out.Beats, syncBeatToProto(x))
	}
	for _, x := range c.Connections {
		out.Connections = append(out.Connections, syncConnectionToProto(x))
	}
	for _, x := range c.Lanes {
		out.Lanes = append(out.Lanes, syncLaneToProto(x))
	}
	for _, x := range c.OutlineItems {
		out.OutlineItems = append(out.OutlineItems, syncOutlineItemToProto(x))
	}
	return out
}

func syncProjectToProto(p *domain.Project) *scriptspb.Project {
	return &scriptspb.Project{
		Id: p.ID.String(), Title: p.Title, Description: p.Description,
		OwnerId: p.OwnerID.String(), Category: p.Category, Status: p.Status,
		IsStarred: p.IsStarred, CreatedAt: protoTS(p.CreatedAt),
		UpdatedAt: protoTS(p.UpdatedAt), DeletedAt: protoTSPtr(p.DeletedAt),
	}
}

func syncSceneToProto(s *domain.Scene) *scriptspb.Scene {
	out := &scriptspb.Scene{
		Id: s.ID.String(), ProjectId: s.ProjectID.String(),
		SceneHeading: s.SceneHeading, Content: s.Content, OrderIndex: s.OrderIndex,
		CreatedAt: protoTS(s.CreatedAt), UpdatedAt: protoTS(s.UpdatedAt),
		DeletedAt: protoTSPtr(s.DeletedAt),
	}
	if s.OutlineUnitID != nil {
		out.OutlineUnitId = s.OutlineUnitID.String()
	}
	return out
}

func syncElementToProto(e *domain.ProjectElement) *scriptspb.ProjectElement {
	out := &scriptspb.ProjectElement{
		Id: e.ID.String(), ProjectId: e.ProjectID.String(),
		Type: e.Type, Content: e.Content, LineNumber: e.LineNumber,
		Formatting: e.Formatting, CreatedAt: protoTS(e.CreatedAt),
		UpdatedAt: protoTS(e.UpdatedAt), DeletedAt: protoTSPtr(e.DeletedAt),
	}
	if e.SceneID != nil {
		out.SceneId = e.SceneID.String()
	}
	return out
}

func syncCharacterToProto(c *domain.Character) *scriptspb.Character {
	return &scriptspb.Character{
		Id: c.ID.String(), ProjectId: c.ProjectID.String(), Name: c.Name,
		Description: c.Description, Role: c.Role, Attributes: c.Attributes,
		CreatedAt: protoTS(c.CreatedAt), UpdatedAt: protoTS(c.UpdatedAt),
		DeletedAt: protoTSPtr(c.DeletedAt),
	}
}

func syncLocationToProto(l *domain.Location) *scriptspb.Location {
	return &scriptspb.Location{
		Id: l.ID.String(), ProjectId: l.ProjectID.String(), Name: l.Name,
		Description: l.Description, Type: l.Type,
		CreatedAt: protoTS(l.CreatedAt), UpdatedAt: protoTS(l.UpdatedAt),
		DeletedAt: protoTSPtr(l.DeletedAt),
	}
}

func syncBeatToProto(b *domain.Beat) *scriptspb.Beat {
	return &scriptspb.Beat{
		Id: b.ID.String(), ProjectId: b.ProjectID.String(), Title: b.Title,
		Description: b.Description, SceneNumbers: b.SceneNumbers, Color: b.Color,
		PositionX: float64(b.PositionX), PositionY: float64(b.PositionY),
		Width: float64(b.Width), Height: float64(b.Height),
		ActNumber: b.ActNumber, Order: b.Order,
		StartPage: b.StartPage, EndPage: b.EndPage, ImageUrl: b.ImageURL,
		CreatedAt: protoTS(b.CreatedAt), UpdatedAt: protoTS(b.UpdatedAt),
		DeletedAt: protoTSPtr(b.DeletedAt),
	}
}

func syncConnectionToProto(c *domain.Connection) *scriptspb.Connection {
	return &scriptspb.Connection{
		Id: c.ID.String(), ProjectId: c.ProjectID.String(),
		FromBeatId: c.FromID.String(), ToBeatId: c.ToID.String(),
		FromSide: c.FromSide, ToSide: c.ToSide,
		CreatedAt: protoTS(c.CreatedAt), UpdatedAt: protoTS(c.UpdatedAt),
		DeletedAt: protoTSPtr(c.DeletedAt),
	}
}

func syncLaneToProto(l *domain.Lane) *scriptspb.Lane {
	return &scriptspb.Lane{
		Id: l.ID.String(), ProjectId: l.ProjectID.String(), Name: l.Name,
		Color: l.Color, Order: l.Order,
		CreatedAt: protoTS(l.CreatedAt), UpdatedAt: protoTS(l.UpdatedAt),
		DeletedAt: protoTSPtr(l.DeletedAt),
	}
}

func syncOutlineItemToProto(o *domain.OutlineItem) *scriptspb.OutlineItem {
	return &scriptspb.OutlineItem{
		Id: o.ID.String(), ProjectId: o.ProjectID.String(),
		BeatId: o.BeatID.String(), LaneId: o.LaneID.String(), Order: o.Order,
		TimelinePosition: o.TimelinePosition, Width: o.Width,
		CreatedAt: protoTS(o.CreatedAt), UpdatedAt: protoTS(o.UpdatedAt),
		DeletedAt: protoTSPtr(o.DeletedAt),
	}
}
