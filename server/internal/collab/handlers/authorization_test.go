package handlers

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/collab/domain"
	"inkwell/server/internal/collab/repository"
	"inkwell/server/internal/collab/service"
	collabpb "inkwell/server/pkg/grpc/collab"
)

type presenceAuthRepo struct {
	repository.CollaborationRepository
	role    string
	roleErr error
	writes  int
	actor   uuid.UUID
}

func (r *presenceAuthRepo) GetUserProjectRole(context.Context, uuid.UUID, uuid.UUID) (string, error) {
	return r.role, r.roleErr
}

func (r *presenceAuthRepo) CreateOrUpdateUserPresence(_ context.Context, presence *domain.UserPresence) error {
	r.writes++
	r.actor = presence.UserID
	return nil
}

func TestUpdatePresenceAuthorizationBoundary(t *testing.T) {
	actorID := uuid.New()
	projectID := uuid.New()

	tests := []struct {
		name       string
		actor      string
		assertion  collabpb.CallerRole
		role       string
		roleErr    error
		wantCode   codes.Code
		wantWrites int
	}{
		{name: "missing actor", actor: "", assertion: collabpb.CallerRole_CALLER_ROLE_VIEWER, wantCode: codes.InvalidArgument},
		{name: "stranger without assertion", actor: actorID.String(), roleErr: domain.ErrUnauthorized, wantCode: codes.PermissionDenied},
		{name: "active direct viewer without assertion", actor: actorID.String(), role: "viewer", wantCode: codes.OK, wantWrites: 1},
		{name: "org-only viewer with gateway assertion", actor: actorID.String(), assertion: collabpb.CallerRole_CALLER_ROLE_VIEWER, roleErr: domain.ErrUnauthorized, wantCode: codes.OK, wantWrites: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &presenceAuthRepo{role: tt.role, roleErr: tt.roleErr}
			h := NewCollaborationHandler(service.NewCollaborationService(nil, repo, nil, nil))
			_, err := h.UpdatePresence(context.Background(), &collabpb.UpdatePresenceRequest{
				UserId:     tt.actor,
				ProjectId:  projectID.String(),
				CallerRole: tt.assertion,
			})
			if got := status.Code(err); got != tt.wantCode {
				t.Fatalf("status = %v, want %v (err=%v)", got, tt.wantCode, err)
			}
			if repo.writes != tt.wantWrites {
				t.Fatalf("writes = %d, want %d", repo.writes, tt.wantWrites)
			}
			if tt.wantWrites == 1 && repo.actor.String() != tt.actor {
				t.Fatalf("persisted actor = %s, want %s", repo.actor, tt.actor)
			}
		})
	}
}
